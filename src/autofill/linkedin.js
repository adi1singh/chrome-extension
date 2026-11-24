import { downloadPdf } from '../utils/documentDownload.js';
import { assertCanAdvance, FlowStop, prepareTransitionWait, claimSubmissionAttempt } from '../utils/flowGuard.js';
import { mapStructuredQuestion } from '../services/infoMapping.js';
import { submitJobApplication, submitJobApplicationOutcome, getStoredFAQData } from '../services/apiService.js';
import { LinkedInExtractor } from '../utils/siteExtractors.js';
import { createProgressEmitters } from '../utils/progressBridge.js';
import { ensureEasyApplyMonitor, _awaitSubmissionSuccess } from '../utils/linkedinHelpers.js';

const PROGRESS_SITE = 'linkedin';
const { start: startProgress, update: updateProgress, error: errorProgress } = createProgressEmitters(PROGRESS_SITE);

let latestApplicationAssets = null;
const LINKEDIN_LOCK_PREFIX = 'jobgen-linkedin-lock-';
let cachedFullNameForFilename = null;

// ==== Lock to prevent duplicate call from iframe ====
function getLinkedinLockKey(lockName = 'default') {
  return `${LINKEDIN_LOCK_PREFIX}${lockName}`;
}

function acquireLinkedinLock(lockName = 'default', context = 'auto-apply') {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const store = window.sessionStorage;
    if (!store) return true;

    const lockKey = getLinkedinLockKey(lockName);
    const existing = store.getItem(lockKey);
    if (existing) {
      console.warn('🔒 LinkedIn lock already held, skipping duplicate flow', {
        lockName,
        existing,
        context,
        frameType: window.top === window.self ? 'top' : 'iframe',
        frameElement: window.frameElement?.tagName || null,
        href: window.location?.href
      });
      return false;
    }

    const payload = JSON.stringify({ context, acquiredAt: Date.now() });
    store.setItem(lockKey, payload);
    console.log('🔐 LinkedIn lock acquired', {
      lockName,
      context,
      frameType: window.top === window.self ? 'top' : 'iframe',
      frameElement: window.frameElement?.tagName || null,
      href: window.location?.href,
      lockKey
    });
    return true;
  } catch (error) {
    console.warn('⚠️ Unable to access sessionStorage for LinkedIn auto-apply lock', error);
    return true; // fall back to allowing flow so we do not block functionality
  }
}

function releaseLinkedinLock(lockName = 'default') {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const store = window.sessionStorage;
    const lockKey = getLinkedinLockKey(lockName);
    const existing = store?.getItem(lockKey);
    store?.removeItem(lockKey);
    if (existing !== null && existing !== undefined) {
      console.log('🔓 LinkedIn lock released', {
        lockName,
        frameType: window.top === window.self ? 'top' : 'iframe',
        frameElement: window.frameElement?.tagName || null,
        href: window.location?.href,
        lockKey
      });
    }
  } catch (error) {
    console.warn('⚠️ Unable to clear LinkedIn lock', { lockName, error });
  }
}

// ======== Main functions ========
export async function autoApplyLinkedin() {
  const lockAcquired = acquireLinkedinLock('auto-apply', 'auto-apply');
  if (!lockAcquired) {
    return;
  }

  console.log("Autoapplying LinkedIn");
  
  startProgress('apply');
  
  let modalMonitor = null;
  let modal = null;
  let _modalDetached = false;
  let abortTriggered = false;
  let unregisterMonitorCallbacks = null;

  try {
    const { monitor, modal: ensuredModal, unregister } = await ensureEasyApplyMonitor({
      context: 'auto-apply',
      onModalReady: (node) => {
        modal = node;
      },
      onModalDismissed: () => {
        _modalDetached = true;
        abortTriggered = true;
      }
    });

    modalMonitor = monitor;
    unregisterMonitorCallbacks = unregister;
    modal = ensuredModal;

    if (!modal) {
      throw new Error('Easy Apply modal unavailable after monitor start');
    }

    // Keep looping until the modal disappears and within counting guard
    let nextButtonGuard = 0;
    const abortPromise = modalMonitor.waitForAbort();
    const abortable = (promise) => Promise.race([promise, abortPromise]);
    const abortableDelay = (ms) => abortable(new Promise((resolve) => setTimeout(resolve, ms)));

    while (nextButtonGuard <= 10) {
      if (abortTriggered) {
        break;
      }

      modal = modalMonitor.getModal();
      if (!modal) {
        console.log('ℹ️ Easy Apply modal reference unavailable, exiting loop.');
        _modalDetached = true;
        abortTriggered = true;
        break;
      }

      nextButtonGuard++;

      // Find the form container
      const formContainer = modal.querySelector('.jobs-easy-apply-modal__content');
      if (!formContainer) {
        console.log('❌ Form container not found, stopping loop');
        errorProgress();
        break;
      }

      // Get current page title
      const detectedPageTitle = getFormPageTitle(formContainer);
      const currentPage = detectedPageTitle || 'Unknown';
      console.log('📄 Current page:', currentPage);

      // Update progress for current page
      updateProgress(currentPage, 'filling');

      // Fill the page
      try {
        await abortable(fillSinglePage(formContainer, currentPage));
      } catch (error) {
        if (error?.message?.includes('Easy Apply modal dismissed')) {
          _modalDetached = true;
          abortTriggered = true;
          break;
        }
        throw error;
      }

      // Update progress after page completion
      // For auto-apply flows we only display the current page being filled,
      // so we skip the "finished" message to avoid flicker.

      const inlineErrorMessage = extractInlineErrorMessage(modal);
      if (inlineErrorMessage) {
        console.warn('⚠️ LinkedIn inline error detected before clicking CTA.');
        errorProgress(inlineErrorMessage);
        abortTriggered = true;
        break;
      }

      // Capture the step before clicking; do not retry an unchanged form.
      const waitForTransition = prepareTransitionWait(formContainer, () => getFormPageTitle(formContainer), { site: 'linkedin' });
      // Click Next / Review / Submit
      let clicked;
      try {
        clicked = await abortable(clickNextButton(modal));
      } catch (error) {
        if (error?.message?.includes('Easy Apply modal dismissed')) {
          _modalDetached = true;
          abortTriggered = true;
          break;
        }
        throw error;
      }

      if (!clicked) {
        console.log("⚠️ No more CTA buttons found, stopping loop");
        break;
      }
      
      // Wait a bit before next loop (page transition)
      try {
        await abortable(waitForTransition());
        await abortableDelay(500);
      } catch (error) {
        if (error?.message?.includes('Easy Apply modal dismissed')) {
          _modalDetached = true;
          abortTriggered = true;
          break;
        }
        throw error;
      }
    }
    
  } catch (error) {
    if (error?.message?.includes('Easy Apply modal dismissed')) {
      logModalClosed('during auto-apply');
    } else if (error?.message?.includes('Timed out waiting for LinkedIn submission success')) {
      console.log('⚠️ Timed out waiting for LinkedIn submission confirmation.');
      errorProgress();
    } else {
      console.error('❌ Error in autoApplyLinkedIn:', error);
      errorProgress(error instanceof FlowStop ? error.message : undefined);
    }
  } finally {
    unregisterMonitorCallbacks?.();
    releaseLinkedinLock('auto-apply');
  }
}

export async function autofillLinkedin() {
  const lockAcquired = acquireLinkedinLock('autofill', 'autofill');
  if (!lockAcquired) {
    return;
  }

  console.log("Autofilling LinkedIn");

  let modalMonitor = null;
  let modal = null;
  let _modalDetached = false;
  let unregisterMonitorCallbacks = null;

  try {
    // const modal = await waitForModal();
    const { monitor, modal: ensuredModal, unregister } = await ensureEasyApplyMonitor({
      context: 'autofill',
      onModalReady: (node) => {
        modal = node;
      },
      onModalDismissed: () => {
        _modalDetached = true;
      }
    });

    modalMonitor = monitor;
    unregisterMonitorCallbacks = unregister;
    modal = ensuredModal;

    // Find the form container
    const formContainer = modal.querySelector('.jobs-easy-apply-modal__content');
    if (!formContainer) {
      console.log('❌ Form container not found');
      unregisterMonitorCallbacks?.();
      return;
    }

    // Get current page title
    const currentPage = getFormPageTitle(formContainer) || 'Unknown';
    console.log('📄 Current page:', currentPage);

    startProgress('autofill', currentPage, 'filling');

    const abortPromise = modalMonitor.waitForAbort();
    const abortable = (promise) => Promise.race([promise, abortPromise]);

    try {
      await abortable(fillSinglePage(formContainer, currentPage));
    } catch (error) {
      if (error?.message?.includes('Easy Apply modal dismissed')) {
        logModalClosed('during autofill');
        _modalDetached = true;
        return;
      }
      throw error;
    }

    if (_modalDetached) {
      logModalClosed('before autofill completed');
      return;
    }

    updateProgress(currentPage, 'finished');

  } catch (error) {
    if (error?.message?.includes('Easy Apply modal dismissed')) {
      logModalClosed('during autofill');
      return;
    }
    console.error('❌ Error in LinkedIn autofill:', error);
    errorProgress();
  } finally {
    unregisterMonitorCallbacks?.();
    releaseLinkedinLock('autofill');
  }
}

export async function triggerLinkedinNext() {
  try {
    let modal = null;
    try {
      modal = await waitForModal(3000);
    } catch (_error) {
      modal = null;
    }

    if (!modal) {
      modal = locateSubmissionSuccessModal();
    }

    if (!modal) {
      console.warn('⚠️ LinkedIn Next button requested but modal not found');
      return false;
    }

    const inlineErrorMessage = extractInlineErrorMessage(modal);
    if (inlineErrorMessage) {
      console.warn('⚠️ LinkedIn inline error detected before manual CTA trigger.');
      errorProgress(inlineErrorMessage);
      return false;
    }

    const clicked = await clickNextButton(modal);
    if (!clicked) {
      console.warn('⚠️ LinkedIn Next button requested but no CTA found');
    }
    return clicked;
  } catch (error) {
    console.error('❌ Error triggering LinkedIn Next button:', error);
    errorProgress(error instanceof FlowStop ? error.message : undefined);
    return false;
  }
}

async function fillSinglePage(formContainer, pageTitle = 'Form') {
  console.log(`📝 Filling ${pageTitle}`);

  // Handle Experience page
  if (pageTitle && pageTitle.toLowerCase().includes('work experience')) {
    if (hasPrefilledEentry(formContainer)) {
      await removEntry(formContainer);
    }
    await fillExperience(formContainer);
    return;
  }

  // Handle Education page
  if (pageTitle && pageTitle.toLowerCase().includes('education')) {
    if (hasPrefilledEentry(formContainer)) {
      await removEntry(formContainer);
    }
    await fillEducation(formContainer);
    return;
  }
        
  // Find all form elements
  const textInputs = formContainer.querySelectorAll('[data-test-single-line-text-form-component]');
  const textAreas = formContainer.querySelectorAll('[data-test-multiline-text-form-component]');
  const dropdowns = formContainer.querySelectorAll('[data-test-text-entity-list-form-component]');
  const typeaheadInputs = formContainer.querySelectorAll('[data-test-single-typeahead-entity-form-component]');
  
  // Process text inputs
  for (const textInputContainer of textInputs) {
    console.log("textInputContainer", textInputContainer);
    const label = textInputContainer.querySelector('label');
    const input = textInputContainer.querySelector('input');
    
    let cleanQuestion = '';
    if (label && (label.innerText || label.textContent)) { // Some screens (e.g., LinkedIn Profile URL) have no label inside this container.
      cleanQuestion = (label.innerText || label.textContent).trim();
    }

    // If there is no label text, leave it as-is.
    if (!cleanQuestion) {
      highlightElement(input);
      continue;
    }
    await fillTextInput(input, cleanQuestion);
  }
  
  // Process dropdowns (Phone country code, Email address)
  for (const dropdownContainer of dropdowns) {
    const label = dropdownContainer.querySelector('[data-test-text-entity-list-form-title] span') ||
                  dropdownContainer.querySelector('label span') ||
                  dropdownContainer.querySelector('label');
    const select = dropdownContainer.querySelector('select[data-test-text-entity-list-form-select]') ||
                  dropdownContainer.querySelector('select');
    const questionText = label.innerText || label.textContent || '';
    const cleanQuestion = questionText.trim();
    if (cleanQuestion) {
      await fillDropdown(select, cleanQuestion);
    }
  }

  // Process text areas (multiline text fields)
  for (const textAreaContainer of textAreas) {
    const label = textAreaContainer.querySelector('label');
    const textarea = textAreaContainer.querySelector('textarea');
    const questionText = label.innerText || label.textContent || '';
    const cleanQuestion = questionText.trim();
    
    if (cleanQuestion) {
      await fillTextArea(textarea, cleanQuestion);
    }
  }
  
  // Process typeahead inputs (Location fields, etc.)
  for (const typeaheadContainer of typeaheadInputs) {
    const label = typeaheadContainer.querySelector('label');
    const input = typeaheadContainer.querySelector('input[type="text"]') || 
                  typeaheadContainer.querySelector('input[role="combobox"]') ||
                  typeaheadContainer.querySelector('input');
    const questionText = label.innerText || label.textContent || '';
    const cleanQuestion = questionText.trim();
    
    if (cleanQuestion) {
      await fillTypeahead(input, cleanQuestion);
    }
  }
  
  // Process radio button groups
  const radioFieldsets = formContainer.querySelectorAll('fieldset[data-test-form-builder-radio-button-form-component]');
  for (const fieldset of radioFieldsets) {
    const legend = fieldset.querySelector('legend span[aria-hidden="true"]');
    if (legend) {
      const questionText = legend.textContent.trim();
      await fillRadio(fieldset, questionText);
    }
  }

  // Process checkbox groups  
  const checkboxFieldsets = formContainer.querySelectorAll('fieldset[data-test-checkbox-form-component]');
  for (const fieldset of checkboxFieldsets) {
    const legend = fieldset.querySelector('legend span[aria-hidden="true"]');
    if (legend) {
      const questionText = legend.textContent.trim();
      await fillCheckboxes(fieldset, questionText);
    }
  }

  // Process upload fields if they appear on the page
  const fileInputs = formContainer.querySelectorAll('input[type="file"]');
  for (const fileInput of fileInputs) {
    const id = fileInput.id || '';
    const acceptAttr = fileInput.getAttribute('accept') || '';
  
    if (acceptAttr.includes('.pdf') || acceptAttr.includes('.doc') || acceptAttr.includes('.docx')) {
      if (id.includes('upload-resume')) {
      console.log('📄 Found resume upload field, filling...');
        await fillFileInput({specificFileInput : fileInput, isResume : true});
      } else if (id.includes('upload-cover-letter')) {
        console.log('📄 Found cover letter upload field, filling...');
        await fillFileInput({specificFileInput : fileInput, isResume : false});
      } else {
        console.log('⚠️ Unknown file input type:', id);
      }
    }
  }

  console.log(`"${pageTitle}" filling completed`);
}


// Function to fill LinkedIn work experience page
async function fillExperience(formContainer, _pageTitle) {
  const experienceResult = await getAnswer("experience", 'workexperience');
  const experienceData = experienceResult.answer;
  if (!experienceResult.answer ||!Array.isArray(experienceData) || experienceData.length === 0) {
    console.warn("No experience data found");
    return;
  }
  console.log(`📋 Found ${experienceData.length} experience entries:`, experienceData);

  // Fill experience entries one by one
  for (let i = 0; i < experienceData.length; i++) {
    const experience = experienceData[i];
    await fillSingleExperience(formContainer, experience, i);
    await clickSave(formContainer);
    if (i < experienceData.length - 1) {
      await clickAdd(formContainer);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Function to fill a single experience entry
async function fillSingleExperience(formContainer, experience, index) {
  console.log(`📝 Filling experience entry ${index + 1}:`);
  
  // Get all experience cards and select the last one (newly created after "Add more")
  const experienceCards = formContainer.querySelectorAll('.jobs-easy-apply-repeatable-groupings__groupings .artdeco-card');
  const experienceSection = experienceCards[experienceCards.length - 1]; // Always get the last/newest card
  
  if (!experienceSection) {
    console.log("⚠️ Experience section not found");
    return;
  }
  // Fill job title
  const titleInput = experienceSection.querySelector('input[type="text"]');
  dispatchFieldEvent(titleInput, experience.title);

  // Fill company name
  const companyInput = experienceSection.querySelectorAll('input[type="text"]')[1];
  dispatchFieldEvent(companyInput, experience.company_name);

  // Handle "I currently work here" checkbox
  if (experience.ongoing === "yes") {
    const checkbox = experienceSection.querySelector('input[type="checkbox"]');
    if (checkbox && !checkbox.checked) {
      checkbox.click();
      highlightElement(checkbox);
    }
  }

  // Fill dates (month/year dropdowns)
  await fillExperienceDates(experienceSection, experience);

  // Fill city/location (typeahead field)
  const cityInput = experienceSection.querySelector('[data-test-single-typeahead-entity-form-component] input');
  if (cityInput && experience.location) {
    await fillTypeahead(cityInput, experience.location, true);
  }

  // Fill description (textarea)
  const descriptionTextarea = experienceSection.querySelector('textarea');
  dispatchFieldEvent(descriptionTextarea, experience.role_description);
}

// Function to fill experience dates
async function fillExperienceDates(experienceSection, experience) {
  // Find the date range component within this specific experience section
  const dateRangeComponent = experienceSection.querySelector('[data-test-date-range-form-component]');
  
  if (!dateRangeComponent) {
    console.warn("⚠️ Date range component not found");
    return;
  }

  // Find month and year dropdowns within the date range component
  const monthSelects = dateRangeComponent.querySelectorAll('select[data-test-month-select]');
  const yearSelects = dateRangeComponent.querySelectorAll('select[data-test-year-select]');

  // Parse start date
  if (experience.start_date) {
    // Handle Unix timestamp (if it's a string of numbers) or regular date string
    const startDate = /^\d+$/.test(experience.start_date) 
      ? new Date(parseInt(experience.start_date) * 1000) 
      : new Date(experience.start_date);
    if (!isNaN(startDate.getTime())) {
      const startMonth = startDate.getMonth() + 1; // JavaScript months are 0-indexed
      const startYear = startDate.getFullYear();

      // Fill start month (first month select)
      if (monthSelects[0]) {
        monthSelects[0].value = startMonth.toString();
        monthSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(monthSelects[0]);
      }

      // Fill start year (first year select)
      if (yearSelects[0]) {
        yearSelects[0].value = startYear.toString();
        yearSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(yearSelects[0]);
      }
    }
  }

  // Parse end date (only if not currently working)
  if (experience.ongoing !== "yes" && experience.end_date) {
    // Handle Unix timestamp (if it's a string of numbers) or regular date string
    const endDate = /^\d+$/.test(experience.end_date) 
      ? new Date(parseInt(experience.end_date) * 1000) 
      : new Date(experience.end_date);
    if (!isNaN(endDate.getTime())) {
      const endMonth = endDate.getMonth() + 1;
      const endYear = endDate.getFullYear();

      // Fill end month (second month select)
      if (monthSelects[1]) {
        monthSelects[1].value = endMonth.toString();
        monthSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(monthSelects[1]);
      }

      // Fill end year (second year select)
      if (yearSelects[1]) {
        yearSelects[1].value = endYear.toString();
        yearSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(yearSelects[1]);
      }
    }
  }
}
// Function to fill LinkedIn education page
// TODO: test multiple education entries
async function fillEducation(formContainer) {
  const educationResult = await getAnswer("education", 'education');
  let educationData = educationResult?.answer;

  if (typeof educationData === "string") {
    try {
      educationData = JSON.parse(educationData);
    } catch (e) {
      console.warn("=== Could not parse education JSON:", e);
      return;
    }
  }
  if (educationData && !Array.isArray(educationData)) {
    educationData = [educationData];
  }
  if (!Array.isArray(educationData) || educationData.length === 0) {
    console.warn("=== Education data is empty");
    return;
  }

  // Fill education entries one by one
  for (let i = 0; i < educationData.length; i++) {
    const education = educationData[i];
    await fillSingleEducation(formContainer, education, i);
    await clickSave(formContainer);
    if (i < educationData.length - 1) {
      await clickAdd(formContainer);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Function to fill a single education entry
export async function fillSingleEducation(formContainer, education, _index) {
  // Get all education cards and select the last one (newly created after "Add more")
  let educationCards = formContainer.querySelectorAll('.jobs-easy-apply-repeatable-groupings__groupings .artdeco-card');
  let educationSection = educationCards[educationCards.length - 1];
  
  if (!educationSection) {
    await clickAdd(formContainer);                 // ensure a blank card exists
    await new Promise(r => setTimeout(r, 500));    // let DOM render
    educationCards = formContainer.querySelectorAll('.jobs-easy-apply-repeatable-groupings__groupings .artdeco-card');
    educationSection = educationCards[educationCards.length - 1];
    if (!educationSection) {
      console.warn('⚠️ Section not found after Add');
      return; // bail safely
    }
  }
  
  // Fill school - first text input
  const schoolInput = educationSection.querySelector('input[type="text"]');
  dispatchFieldEvent(schoolInput, education.institute);

  // Fill city/location (typeahead field)
  const cityInput = educationSection.querySelector('[data-test-single-typeahead-entity-form-component] input');
  if (cityInput && education.location) {
    await fillTypeahead(cityInput, education.location, true);
  }

  // Fill degree - second text input
  const degreeInput = educationSection.querySelectorAll('input[type="text"]')[2];
  dispatchFieldEvent(degreeInput, education.degree);

  // Fill major/field of study - third text input
  const majorInput = educationSection.querySelectorAll('input[type="text"]')[3];
  dispatchFieldEvent(majorInput, education.degree); // Using degree as major for now

  // Handle "I currently attend this institution" checkbox
  if (education.ongoing === "yes") {
    const checkbox = educationSection.querySelector('input[type="checkbox"]');
    if (checkbox && !checkbox.checked) {
      checkbox.click();
      highlightElement(checkbox);
    }
  }

  // Fill dates (month/year dropdowns)
  await fillEducationDates(educationSection, education);
}

// Function to fill education dates
async function fillEducationDates(educationSection, education) {
  // Find the date range component within this specific education section
  const dateRangeComponent = educationSection.querySelector('[data-test-date-range-form-component]');
  
  if (!dateRangeComponent) {
    console.warn("⚠️ Date range component not found");
    return;
  }

  // Find month and year dropdowns within the date range component
  const monthSelects = dateRangeComponent.querySelectorAll('select[data-test-month-select]');
  const yearSelects = dateRangeComponent.querySelectorAll('select[data-test-year-select]');

  // Parse start date
  if (education.start_date) {
    // Handle Unix timestamp (if it's a string of numbers) or regular date string
    const startDate = /^\d+$/.test(education.start_date) 
      ? new Date(parseInt(education.start_date) * 1000) 
      : new Date(education.start_date);
    if (!isNaN(startDate.getTime())) {
      const startMonth = startDate.getMonth() + 1; // JavaScript months are 0-indexed
      const startYear = startDate.getFullYear();

      // Fill start month (first month select)
      if (monthSelects[0]) {
        monthSelects[0].value = startMonth.toString();
        monthSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(monthSelects[0]);
      }

      // Fill start year (first year select)
      if (yearSelects[0]) {
        yearSelects[0].value = startYear.toString();
        yearSelects[0].dispatchEvent(new Event('change', { bubbles: true }));
        highlightElement(yearSelects[0]);
      }
    }
  }

  // Parse end date (only if not currently attending)
  if (education.ongoing !== "yes" && education.end_date) {
    // Handle Unix timestamp (if it's a string of numbers) or regular date string
    const endDate = /^\d+$/.test(education.end_date) 
      ? new Date(parseInt(education.end_date) * 1000) 
      : new Date(education.end_date);
    if (!isNaN(endDate.getTime())) {
      const endMonth = endDate.getMonth() + 1;
      const endYear = endDate.getFullYear();

      // Fill end month (second month select)
      if (monthSelects[1]) {
        monthSelects[1].value = endMonth.toString();
        monthSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Filled end month: ${endMonth}`);
        highlightElement(monthSelects[1]);
      }

      // Fill end year (second year select)
      if (yearSelects[1]) {
        yearSelects[1].value = endYear.toString();
        yearSelects[1].dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Filled end year: ${endYear}`);
        highlightElement(yearSelects[1]);
      }
    }
  }
}

// Function to handle resume or cover letter upload
async function fillFileInput({specificFileInput = null, isResume = true} = {}) {
  const jobUrl = window.location.href;
  const assets = await prepareFiles(jobUrl);
  if (!assets) {
    throw new FlowStop('linkedin', 'documents', 'UPLOAD_FAILED');
  }

  try {
    const assetUrl = isResume ? assets.resumeUrl : assets.coverLetterUrl;
    if (!assetUrl || assetUrl === 'none') {
      console.warn(isResume ? '⚠️ No resume URL available' : '⚠️ No cover letter URL available');
      throw new FlowStop('linkedin', 'documents', 'UPLOAD_FAILED');
    }

    console.log(isResume ? '📥 Downloading resume:' : '📥 Downloading cover letter:', assetUrl);

    const blob = await downloadPdf(assetUrl);
    const rawTitle = assets.jobTitle || 'Job';
    const fileFullName = await getFullNameForFilename();
    const jobTitleSegment = formatJobTitleForFilename(rawTitle);
    const suffix = isResume ? 'Resume' : 'CoverLetter';
    const filename = `${fileFullName}-${jobTitleSegment}-${suffix}.pdf`;
    const file = new File([blob], filename, { type: 'application/pdf' });

    const fileInput = specificFileInput || document.querySelector('input[type="file"][accept*="pdf"]');

    if (!fileInput) {
      console.error('❌ Could not find file input element');
      throw new FlowStop('linkedin', 'documents', 'UPLOAD_FAILED');
    }

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(isResume ? '✅ Resume uploaded successfully to:' : '✅ Cover letter uploaded successfully to:', fileInput.id);
  } catch (error) {
    console.error('❌ Error preparing file for upload:', error);
    throw new FlowStop('linkedin', 'documents', 'UPLOAD_FAILED');
  }
}

// ======== End of Main functions ========


// ======== Supporting functions ========

function logModalClosed(context) {
  const detail = context ? ` ${context}` : '';
  console.log(`🚪 Easy Apply modal closed${detail}.`);
}

function getFormPageTitle(formContainer) {
  if (!formContainer) {
    return '';
  }

  const pageTitleElement = formContainer.querySelector('h3.t-16 .t-bold') ||
                          formContainer.querySelector('h3.t-16.t-bold') ||
                          formContainer.querySelector('h3 .t-bold') ||
                          formContainer.querySelector('h3.t-18'); // review page title variant
  return pageTitleElement ? pageTitleElement.innerText.trim() : '';
}

// Locate the visible Easy Apply control for the current job view.
export function findEasyApplyButton() {
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return !el.disabled && style.visibility !== 'hidden' && style.display !== 'none' && el.offsetParent !== null;
  }

  const isEasyApply = (el) => {
    if (!isVisible(el)) return false;
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();

    // Explicit "Easy Apply" label wins immediately.
    if (/\beasy\s*apply\b/.test(text) || /\beasy\s*apply\b/.test(aria)) return true;

    // LinkedIn's Easy Apply button carries a data-job-id and behaves as a button (not role="link").
    if (el.hasAttribute('data-job-id') && role !== 'link') return true;

    return false;
  };

  // 1) Right-pane/job card stable id scenario
  let el = document.querySelector('#jobs-apply-button-id');
  if (el && isEasyApply(el)) return el;

  // 2) New-tab scenario
  // job detail surface — look inside the main job detail container first
  const jobDetailRoot = document.querySelector('main#workspace [data-view-name="job-detail-page"]');
  if (jobDetailRoot) {
    el = jobDetailRoot.querySelector('button[data-view-name="job-apply-button"], button.jobs-apply-button, a[data-view-name="job-apply-button"]');
    if (el && isEasyApply(el)) return el;
  }
  // LinkedIn renders an <a> with data-view-name="job-apply-button"
  el = document.querySelector('a[data-view-name="job-apply-button"], button[data-view-name="job-apply-button"]');
  if (el && isEasyApply(el)) return el;

  // // 3) Fallback: any clickable control whose visible text is "Easy Apply"
  // const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'));
  // el = candidates.find((node) => isEasyApply(node));
  // if (el) return el;

  return null;
}

function locateEasyApplyModal() {
  // 1) Standard modal pattern
  let modal = document.querySelector('.jobs-easy-apply-modal[role="dialog"]');

  // 2) new-tab pattern
  if (!modal) {
    modal = document.querySelector('[data-test-modal][role="dialog"].jobs-easy-apply-modal');
  }

  // 3) Shadow DOM variant
  if (!modal) {
    const outlet = document.querySelector('#interop-outlet');
    if (outlet?.shadowRoot) {
      modal = outlet.shadowRoot.querySelector('[data-test-modal][role="dialog"].jobs-easy-apply-modal');
    }
  }

  return modal || null;
}

function isSubmissionSuccessHeading(text) {
  if (!text) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const successPhrases = [
    /application\s+sent/,
    /application\s+was\s+sent/,
    /application\s+has\s+been\s+sent/,
    /application\s+submitted/,
    /you\s+applied/,
    /thanks\s+for\s+applying/
  ];

  return successPhrases.some((pattern) => pattern.test(normalized));
}

function locateSubmissionSuccessModal() {
  const selectors = [
    '[role="dialog"][aria-labelledby="post-apply-modal"]',
    '.artdeco-modal[role="dialog"] .jpac-modal-header'
  ];

  for (const selector of selectors) {
    const match = selector.includes('jpac-modal-header')
      ? document.querySelector(selector)?.closest('.artdeco-modal[role="dialog"]')
      : document.querySelector(selector);

    if (!match) continue;

    const headingRaw = (match.querySelector('.jpac-modal-header') || match.querySelector('#post-apply-modal') || match.querySelector('h2, h3'))?.textContent;
    if (isSubmissionSuccessHeading(headingRaw)) {
      return match;
    }
  }

  return null;
}

function isModalVisible(el) {
  if (!el) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isModalStillAttached(modal) {
  if (!modal) return false;
  if (modal.isConnected) return true;
  if (document.body.contains(modal)) return true;

  const outlet = document.querySelector('#interop-outlet');
  return Boolean(outlet?.shadowRoot?.contains(modal));
}

async function ensureEasyApplyModal({ context = 'autofill' } = {}) {
  const existingModal = locateEasyApplyModal();
  if (existingModal && isModalVisible(existingModal)) {
    console.log(`ℹ️ Easy Apply modal already detected for ${context}, skipping button click`);
    return existingModal;
  }

  const easyApplyButton = findEasyApplyButton();
  if (!easyApplyButton) {
    throw new Error('Easy Apply button element not found');
  }

  const buttonText = (easyApplyButton.innerText || easyApplyButton.textContent || '').trim();
  if (!/\beasy\s*apply\b/i.test(buttonText)) {
    throw new Error(`Button is not Easy Apply, text found: ${buttonText}`);
  }

  console.log(`✅ Found Easy Apply button for ${context}:`, buttonText);
  console.log(`🖱️ Clicking Easy Apply button to open modal for ${context}`);
  easyApplyButton.click();

  return waitForModal();
}

// Wait for the Easy Apply modal to be open (resolve only when visible)
function waitForModal(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const modal = locateEasyApplyModal();

      if (modal && isModalVisible(modal)) {
        console.log('✅ Easy Apply modal found and visible');
        resolve(modal);
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        console.warn('⏹️ waitForModal timed out');
        reject(new Error('Timed out waiting for Easy Apply modal'));
        return;
      }

      setTimeout(check, 200); // poll every 200ms
    };

    check();
  });
}

// Universal function to fill any form field with value and events
function dispatchFieldEvent(element, value) {
  if (!element || !value) return false;
  
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
  highlightElement(element);
  return true;
}

// Standalone function to get answer from infoMapping
async function getAnswer(questionText, questionType = 'input', options = {}) {
  const questionData = {
    question: questionText,
    question_type: questionType,
    options: options
  };

  console.log("Infomapping payload: ", questionData);
  const mappingResult = await mapStructuredQuestion(questionData);
  console.log("Infomapping result:", mappingResult);
  return mappingResult;
}

function extractInlineErrorMessage(modal) {
  if (!modal) return null;

  const normalize = (text = '') => text.replace(/\s+/g, ' ').trim();
  const errorNodes = modal.querySelectorAll(
    '.artdeco-inline-feedback.artdeco-inline-feedback--error, .jobs-document-upload-redesign-card__error'
  );

  if (!errorNodes || errorNodes.length === 0) {
    return null;
  }

  const capturedMessages = Array.from(errorNodes)
    .map((node) => normalize(node.textContent || ''))
    .filter(Boolean);

  if (capturedMessages.length) {
    console.warn('⚠️ LinkedIn inline error details:', capturedMessages);
  }

  return 'LinkedIn flagged some fields as invalid. Please fill it manually or try again.';
}

export async function clickNextButton(modal) {
  if (!modal) throw new FlowStop('linkedin', 'advance', 'CLOSED_FORM');
  const expectedUrl = modal.ownerDocument.location.href;

  // 1. Submit button (final step)
  let button = modal.querySelector('button[aria-label="Submit application"]');

  // 2. Review button (review step)
  if (!button) {
    button = modal.querySelector('button[aria-label="Review your application"]') ||
             modal.querySelector('button[data-live-test-easy-apply-review-button]');
  }

  // 3. Next button (early steps)
  if (!button) {
    button = modal.querySelector('button[data-easy-apply-next-button]') ||
             modal.querySelector('button[aria-label="Continue to next step"]');
  }

  // 4. Success modal dismiss button (post-submit dialog)
  if (!button) {
    const successHeading = (modal.querySelector('.jpac-modal-header') || modal.querySelector('#post-apply-modal') || modal.querySelector('h2, h3'))?.textContent;
    if (isSubmissionSuccessHeading(successHeading)) {
      const dismissButton = modal.querySelector('button[data-test-modal-close-btn], button.artdeco-modal__dismiss, button[aria-label="Dismiss"]');
      if (dismissButton && !dismissButton.disabled) {
        button = dismissButton;
      }
    }
  }

  if (button) {
    console.log('✅ Found CTA button:', button.getAttribute('aria-label') || button.innerText);
    await new Promise(resolve => setTimeout(resolve, 1000)); // small delay for safety
    assertCanAdvance(modal, button, { site: 'linkedin', step: 'advance', expectedUrl });
    if (button.getAttribute('aria-label') === 'Submit application') {
      claimSubmissionAttempt(modal, 'linkedin');
    }
    button.click();
    console.log('🎯 Clicked CTA button');
    return true;
  } else {
    throw new FlowStop('linkedin', 'advance', 'MISSING_CONTROL');
  }
}

function highlightElement(element) {
  if (!element) return;
  
  const _originalStyle = element.style.cssText;
  element.style.cssText += '; border: 2px solid #4CAF50 !important; background-color: rgba(76, 175, 80, 0.1) !important;';
  
  // setTimeout(() => {
  //   element.style.cssText = originalStyle;
  // }, 500);
}

// Basic function to fill a text input field
async function fillTextInput(input, questionText) {
  if (!input) return false;
  
  console.log(`Question: "${questionText}"`);

  // Guard for whole number
  let needsWholeNumber = false; // Check if the question requires whole number accoridng to the question text
  if (/\bhow many\b/i.test(questionText)) { // detect "how many"
    questionText = `${questionText}. Please answer with a whole number (no words or symbols).`;
    needsWholeNumber = true;
  }

  // Numeric/decimal guard for pay/salary/OTE/rate
  const numericHintRegex = /\b(ote|salary|income|compensation|pay|wage|rate|hourly|annual|expected|amount)\b/i;
  const needsNumeric = numericHintRegex.test(questionText);

  if (needsNumeric) {
    questionText = `${questionText}. Answer with a number only value — no symbols, commas, or text.`;
  }

  // Edge case for resume page
  if (questionText === "Headline") {
    questionText = `What is your ${questionText} for your Resume?`;
  }
  
  
  const mappingResult = await getAnswer(questionText, 'input');
  
  if (mappingResult && mappingResult.answer) {
    let answer = mappingResult.answer;

    if (needsNumeric) {
      // Grab the first numeric-looking token
      const numMatch = answer.match(/-?\d+(?:[.,]\d+)?/);
      if (numMatch) {
        // Normalize: keep one decimal point, drop thousands separators/currency
        let raw = numMatch[0].replace(/,/g, '.');           // unify separators
        // If multiple dots, keep the first as decimal separator
        const parts = raw.split('.');
        raw = parts.length > 2 ? (parts[0] + '.' + parts.slice(1).join('')) : raw;

        let num = parseFloat(raw);
        if (!isNaN(num)) {
          answer = Math.round(num).toString();
        }
      }
    }
    if (needsWholeNumber) {
      const parsed = parseFloat(answer);
      if (!isNaN(parsed)) {
        answer = Math.round(parsed).toString();
      } 
    }
    // return dispatchFieldEvent(input, "test");
    return dispatchFieldEvent(input, answer);
  }

  return true;
}

// Basic function to fill a textarea field
async function fillTextArea(textarea, questionText) {
  if (!textarea) return false;
  
  console.log(`Question: "${questionText}"`);
  const isLocation = /\b(city|location|suburb|locality|town)\b/i.test(questionText || "");
  const isCoverLetter = /\b(cover letter)\b/i.test(questionText || "");

  let _isResumeInputField = false;
  if (questionText === "Summary") {
    questionText = `What is your ${questionText} for your Resume? Be detailed.`;
    _isResumeInputField = true;
  }

  // Case for loctaion
  if (isLocation) {
    let mappingResult;
    const mappingResultCity = await getAnswer("city", 'input');
    const mappingResultLocation = await getAnswer("state", 'input');
    const mappingResultCountry = await getAnswer("country", 'input');
    mappingResult = { answer: mappingResultCity.answer + ', ' + mappingResultLocation.answer + ', ' + mappingResultCountry.answer };
    if (!mappingResult) {
      return false;
    }
    const ans = mappingResult.answer;
    dispatchFieldEvent(textarea, ans);
    return true;
  }

  // Case for cover letter
  // TODO: currently can not copy cover letter from pdf
  if (isCoverLetter) {
    try {
      const jobUrl = window.location.href;

      let assets = latestApplicationAssets;
      if (!assets || assets.jobUrl !== jobUrl) {
        console.log('ℹ️ Cover letter textarea requested cached assets but none available, preparing now');
        assets = await prepareFiles(jobUrl);
      }

      if (!assets) {
        console.warn('⚠️ Unable to prepare cover letter assets; falling back to generated text');
        const fallbackQuestion = `What is your ${questionText} for your Resume? Be detailed.`;
        const fallbackAnswer = await getAnswer(fallbackQuestion, 'input');
        if (fallbackAnswer?.answer) {
          return dispatchFieldEvent(textarea, fallbackAnswer.answer);
        }
        return true;
      }

      const url = assets.coverLetterUrl;
      if (url && url !== "none") {
        // PDF file .text() and fall back to a simple message.
        const clResponse = await fetch(url);
        const contentType = clResponse.headers.get('content-type') || '';

        let coverLetterText = '';
        try {
          // Try reading as text first
          coverLetterText = await clResponse.text();
        } catch (e) {
          console.warn("Could not read cover letter as text:", e);
        }

        if (!coverLetterText || /application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)/i.test(contentType)) {
          // If we can't read clean text (likely PDF/DOCX), don't paste binary noise.
          console.warn("Cover letter appears to be a non-text document; leaving textarea unchanged.");
          // Fallback to textarea?
          questionText = `What is your ${questionText} for your Resume? Be detailed.`;
          const mappingResult = await getAnswer(questionText, 'input');
          if (mappingResult?.answer) {
            return dispatchFieldEvent(textarea, mappingResult.answer);
          }
          return true;
        }

        return dispatchFieldEvent(textarea, coverLetterText);
      } else {
        console.warn("No cover letter URL returned; leaving textarea unchanged.");
        return true;
      }
    } catch (error) {
      console.error("❌ Error fetching cover letter:", error);
      return true;
    }
  }

  const mappingResult = await getAnswer(questionText, 'input');
  
  if (mappingResult && mappingResult.answer) {
    return dispatchFieldEvent(textarea, mappingResult.answer);
  }
  
  return true;
}

// Basic function to fill a dropdown/select field
async function fillDropdown(select, questionText) {
  if (!select) return false;
  
  console.log(`Question: "${questionText}"`);
  
  // Build options
  const options = {};
  const optionElements = select.querySelectorAll('option');
  
  let idx = 0;
  optionElements.forEach((option) => {
    const value = option.value?.trim();
    const text = (option.innerText || option.textContent || "").trim();

    // Skip placeholder options like "Select an option"
    if (!value || /^select an option$/i.test(value) || /^select an option$/i.test(text)) {
      return;
    }
    idx++;
    options[String(idx)] = value;
  });

  const optionCount = Object.keys(options).length;
  
  if (optionCount === 0) {
    console.log("⚠️ No valid options found");
    return false;
  }

  const mappingResult = await getAnswer(questionText, 'single choice', options);

  if (mappingResult && mappingResult.answer && options[mappingResult.answer]) {
    highlightElement(select);
    select.value = options[mappingResult.answer]; // answer being the key of the options
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    
    await new Promise(resolve => setTimeout(resolve, 300));
    return true;
  } else {
    console.log(`⚠️ No match for "${questionText}": "${mappingResult?.answer}"`);
  }
  
  return true;
}

// Basic function to fill a typeahead field
async function fillTypeahead(input, questionText, notGetAnswer = false) {
  if (!input) return false;
  
  console.log(`Question: "${questionText}", notGetAnswer: "${notGetAnswer}"`);

  let value;
  if (!notGetAnswer) {
    let mappingResult;
    if (questionText.toLowerCase().includes('city') || questionText.toLowerCase().includes('location')) { // To handle typeahead for location
      const mappingResultCity = await getAnswer("city", 'input');
      const mappingResultLocation = await getAnswer("state", 'input');
      const mappingResultCountry = await getAnswer("country", 'input');
      mappingResult = { answer: mappingResultCity.answer + ',' + mappingResultLocation.answer + ',' + mappingResultCountry.answer }; // ATTENTION: don't put space after comma
    } else {
      mappingResult = await getAnswer(questionText, 'input');
    }
    if (!mappingResult || !mappingResult.answer) {
      return false;
    }
    value = mappingResult.answer;
  } else {
    value = questionText;
  }
  
  try {
    input.focus();
    input.value = '';
    
    // Set the value word by word to trigger typeahead
    input.value = value.split(', ')[0];
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Wait for the dropdown to appear
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Find dropdown container
    const typeaheadContainer = input.closest('.search-basic-typeahead, .search-vertical-typeahead');
    let dropdown = null;

    console.log("=== typeaheadContainer: ", typeaheadContainer);
    
    if (typeaheadContainer) {
      dropdown = typeaheadContainer.querySelector('.basic-typeahead-dropdown') ||
                typeaheadContainer.querySelector('[role="listbox"]') ||
                typeaheadContainer.nextElementSibling;
    }
    
    // Fallback: search globally for dropdown
    if (!dropdown) {
      dropdown = document.querySelector('.basic-typeahead-dropdown') ||
                document.querySelector('.search-typeahead-v2__hit-container') ||
                document.querySelector('.typeahead-results') ||
                document.querySelector('[role="listbox"]');
      console.log('🔍 Fallback: searching globally for dropdown', dropdown);
    }
    
    if (dropdown) {
      // Look for clickable options
      const firstOption = dropdown.querySelector('div[role="option"]:first-child') ||
                         dropdown.querySelector('button:first-child') ||
                         dropdown.querySelector('li:first-child') ||
                         dropdown.querySelector('div:first-child[data-test-typeahead-result]') ||
                         dropdown.querySelector('div:first-child');
      
      if (firstOption) {
        console.log('🎯 Found first option:', firstOption.innerText || firstOption.textContent);
        firstOption.click();
        highlightElement(input);
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log(`✅ Auto-filled "${questionText}": "${value}"`);
        return true;
      } else {
        console.warn('⚠️ Dropdown found but no clickable options detected');
        console.log('Dropdown HTML:', dropdown.outerHTML.substring(0, 500) + '...');
      }
    } else {
      console.warn('⚠️ No dropdown found after typing value');
    }
    
  } catch (error) {
    console.error('❌ Error filling typeahead field:', error);
  }
}

// Basic function to fill radio buttons (Yes/No questions)
async function fillRadio(fieldset, questionText) {
  if (!fieldset) return false;
  
  // Find radio buttons within this fieldset and extract options
  const radioButtons = fieldset.querySelectorAll('input[type="radio"]');
  const options = {};
  
  radioButtons.forEach((radio, idx) => {
    const label = fieldset.querySelector(`label[for="${radio.id}"]`);
    const labelText = label && label.textContent ? label.textContent.trim() : '';
    if (labelText) {
      options[String(idx + 1)] = String(labelText);
    }
  });
  
  console.log(`📋 Radio options found:`, options);
  
  if (Object.keys(options).length === 0) {
    console.warn(`⚠️ No radio options found`);
    return false;
  }
  
  const mappingResult = await getAnswer(questionText, 'single choice', options);
  if (!mappingResult || !mappingResult.answer) {
    console.warn(`⚠️ No answer found for: "${questionText}"`);
    return false;
  }
  
  const selectedKey = mappingResult.answer;
  console.log(`🎯 Selected key: "${selectedKey}"`);
  
  // Find and click the radio button with matching key (key is index)
  const selectedIndex = parseInt(selectedKey) - 1; // Convert to 0-based index
  if (selectedIndex >= 0 && selectedIndex < radioButtons.length) {
    const selectedRadio = radioButtons[selectedIndex];
    const label = fieldset.querySelector(`label[for="${selectedRadio.id}"]`);
    const _labelText = label && label.textContent ? label.textContent.trim() : '';
    
    selectedRadio.click();
    highlightElement(selectedRadio);
    return true;
  }
  
  console.warn(`⚠️ No matching radio option found for key: "${selectedKey}"`);
  return false;
}

// Basic function to fill multiple checkboxes (multi-select questions)
async function fillCheckboxes(fieldset, questionText) {
  if (!fieldset) return false;
  
  // Find checkboxes within this fieldset and extract options
  const checkboxes = fieldset.querySelectorAll('input[type="checkbox"]');
  const options = {};
  
  checkboxes.forEach((checkbox, idx) => {
    const label = fieldset.querySelector(`label[for="${checkbox.id}"]`);
    const labelText = label && label.textContent ? label.textContent.trim() : '';
    if (labelText) {
      options[String(idx + 1)] = String(labelText);
    }
  });
  
  if (Object.keys(options).length === 0) {
    console.warn(`⚠️ No checkbox options found`);
    return false;
  }
  
  const mappingResult = await getAnswer(questionText, 'multiple choice', options);
  if (!mappingResult || !mappingResult.answer) {
    console.warn(`⚠️ No answer found for: "${questionText}"`);
    return false;
  }
  
  // Parse selected keys - should be array of indices
  let selectedKeys = [];
  if (Array.isArray(mappingResult.answer)) {
    selectedKeys = mappingResult.answer;
  } else {
    selectedKeys = [mappingResult.answer];
  }
  
  console.log(`🎯 Selected keys:`, selectedKeys);
  
  // Find and check the checkboxes with matching keys (keys are indices)
  for (const selectedKey of selectedKeys) {
    const selectedIndex = parseInt(selectedKey) - 1; // Convert to 0-based index
    if (selectedIndex >= 0 && selectedIndex < checkboxes.length) {
      const selectedCheckbox = checkboxes[selectedIndex];
      const label = fieldset.querySelector(`label[for="${selectedCheckbox.id}"]`);
      const _labelText = label && label.textContent ? label.textContent.trim() : '';
      
      if (!selectedCheckbox.checked) {
        selectedCheckbox.click();
        highlightElement(selectedCheckbox);
      }
    }
  }
}

// Function to click the Save button in experience and education page
async function clickSave(formContainer) {
  const saveButtons = Array.from(formContainer.querySelectorAll('button')).filter(btn => {
    const text = btn.innerText || btn.textContent || '';
    return text.toLowerCase().includes('save');
  });

  if (saveButtons.length > 0) {
    saveButtons[0].click();
    await new Promise(resolve => setTimeout(resolve, 500));
  } else {
    console.log("No more Save Buttons");
  }
}

// Function to click the "Add more" button in experience and education page
async function clickAdd(formContainer) {
  const addMoreButtons = Array.from(formContainer.querySelectorAll('button')).filter(btn => {
    const text = btn.innerText || btn.textContent || '';
    return text.toLowerCase().includes('add more');
  });

  if (addMoreButtons.length > 0 && !addMoreButtons[0].disabled) {
    addMoreButtons[0].click();
    await new Promise(resolve => setTimeout(resolve, 1000));
  } else {
    console.log("No more Add Buttons");
  }
}

// Functions to remove EXP or EDU entry
async function removEntry(formContainer) {
  // find one row "Remove" (the inline one on each card)
  const findRowRemoveBtn = () =>
    formContainer.querySelector('button[aria-label="Remove the following"]') ||
    Array.from(formContainer.querySelectorAll('button')).find(b =>
      (b.innerText || b.textContent || '').trim().toLowerCase() === 'remove'
    );

  // after clicking the inline "Remove", wait for the confirm modal and click its primary "Remove"
  const clickConfirmRemove = async () => {
    // wait up to ~2s for the confirmation modal to appear
    const deadline = Date.now() + 2000;
    let confirmModal = null;

    while (Date.now() < deadline) {
      confirmModal = document.querySelector('.artdeco-modal--layer-confirmation[role="alertdialog"]');
      if (confirmModal) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (!confirmModal) {
      console.warn('⚠️ Confirmation modal did not appear');
      return false;
    }

    // find the primary confirm button INSIDE the confirm modal
    const confirmBtn =
      confirmModal.querySelector('button[data-test-dialog-primary-btn]') ||
      confirmModal.querySelector('.artdeco-modal__confirm-dialog-btn.artdeco-button--primary');

    if (!confirmBtn) {
      console.warn('⚠️ Confirm "Remove" button not found inside the confirmation modal');
      return false;
    }

    confirmBtn.click();
    return true;
};

  // loop until no more row Remove buttons exist
  let guard = 0;
  while (guard++ < 10) {
    const rowRemove = findRowRemoveBtn();
    if (!rowRemove) break;

    rowRemove.click();
    await clickConfirmRemove();

    // let the DOM settle and card disappear
    await new Promise(r => setTimeout(r, 400));
  }
}

// Function to detect prefilled EXP or EDU entries
function hasPrefilledEentry(formContainer) {
  // Either a “Remove” button is present on any entry ummary cards exist
  const removeBtns = formContainer.querySelectorAll(
    'button[aria-label="Remove the following work experience"]'
  );
  const cards = formContainer.querySelectorAll(
    '.jobs-easy-apply-repeatable-groupings__groupings .artdeco-card'
  );

  return removeBtns.length > 0 || cards.length > 0;
}

async function reportLinkedInApplicationOutcome(status = 'Applied', errorCode = '') {
  const jobId = LinkedInExtractor.getJobIdFromUrl(window.location.href);

  if (!jobId) {
    console.warn('⚠️ Unable to determine LinkedIn job ID for outcome reporting');
    return;
  }

  const payload = {
    application_status: status,
    job_id: jobId,
    job_portal: 'LinkedIn'
  };

  if (errorCode) {
    payload.error_code = errorCode;
  }

  try {
    const outcomeResult = await submitJobApplicationOutcome(payload);
    if (!outcomeResult?.success) {
      console.error('❌ Failed to submit LinkedIn application outcome:', outcomeResult);
    } else {
      console.log('📊 Submitted LinkedIn application outcome:', payload);
    }
  } catch (error) {
    console.error('❌ Error reporting LinkedIn application outcome:', error);
  }
}

async function waitForApplicationSubmissionSuccess(timeoutMs = 5000) {
  const start = Date.now();

  const findModal = () => {
    const contexts = [document];
    const outlet = document.querySelector('#interop-outlet');

    if (outlet?.shadowRoot) {
      contexts.push(outlet.shadowRoot);
    }

    const modalSelectors = [
      '[role="dialog"][aria-labelledby="post-apply-modal"]',
      '[data-test-modal][role="dialog"]'
    ];

    for (const contextRoot of contexts) {
      for (const selector of modalSelectors) {
        const modals = contextRoot.querySelectorAll(selector);

        for (const modal of modals) {
          const titleElement = modal.querySelector('.jpac-modal-header') || modal.querySelector('#post-apply-modal') || modal.querySelector('h2, h3');
          const titleText = titleElement?.textContent;

          if (isSubmissionSuccessHeading(titleText)) {
            return modal;
          }
        }
      }
    }

    return null;
  };

  while (Date.now() - start < timeoutMs) {
    const successModal = findModal();
    if (successModal) {
      return successModal;
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return null;
}


async function prepareFiles(jobUrl) {
  try {
    if (latestApplicationAssets?.jobUrl === jobUrl) {
      console.log('♻️ Reusing cached application assets for current job');
      return latestApplicationAssets;
    }

    let jobInfo = {};
    try {
      jobInfo = await LinkedInExtractor.extractJobInfo();
    } catch (error) {
      console.warn('⚠️ LinkedIn job info extraction failed:', error);
    }

    const jobTitle = jobInfo?.jobTitle?.trim() || 'Unknown Position';
    const company = jobInfo?.companyName?.trim() || 'Unknown Company';

    let jobId = jobInfo?.jobId || LinkedInExtractor.getJobIdFromUrl(jobUrl);
    if (!jobId) {
      try {
        jobId = new URL(jobUrl).pathname.split('/').filter(Boolean).pop() || 'unknown';
      } catch (error) {
        console.warn('⚠️ Could not derive job ID from URL:', error);
        jobId = 'unknown';
      }
    }

    let description = 'Job description not found';
    try {
      description = await new Promise((resolve) => {
        LinkedInExtractor.waitForJobDetails((jobText) => {
          resolve(jobText?.trim() || 'Job description not found');
        });

        setTimeout(() => resolve('Job description not found'), 5000); // fallback guard
      });
    } catch (error) {
      console.warn('⚠️ Failed to resolve job description via LinkedInExtractor:', error);
    }

    const submissionPayload = {
      job_url: jobUrl,
      description,
      cover_letter: 'yes',
      company,
      job_title: jobTitle,
      job_url_id: jobId,
      job_portal: 'LinkedIn'
    };

    const submissionResult = await submitJobApplication(submissionPayload);

    if (!submissionResult || submissionResult.error || !submissionResult.success) {
      console.error('❌ Failed to generate application assets:', submissionResult?.error || 'Unknown error');
      return null;
    }

    latestApplicationAssets = {
      jobUrl,
      resumeUrl: submissionResult.resume,
      coverLetterUrl: submissionResult.cover_letter,
      jobId: submissionResult.job_id || jobId,
      jobTitle,
      company,
      description
    };

    console.log('📄 Cached new application assets:', latestApplicationAssets);
    return latestApplicationAssets;
  } catch (error) {
    console.error('❌ prepareFiles encountered an error:', error);
    return null;
  }
}

function stripParentheticalContent(value) {
  const PAREN_CONTENT_REGEX = /\s*\([^)]*\)/g;
  if (!value) {
    return '';
  }
  return value.replace(PAREN_CONTENT_REGEX, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeForFilename(value, { removeWhitespace = false } = {}) {
  const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]+/g;
  if (!value) {
    return '';
  }

  let sanitized = value.replace(INVALID_FILENAME_CHARS, ' ');
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (removeWhitespace) {
    sanitized = sanitized.replace(/\s+/g, '');
  }

  return sanitized;
}

async function getFullNameForFilename() {
  if (cachedFullNameForFilename) {
    return cachedFullNameForFilename;
  }

  try {
    const faqData = await getStoredFAQData();
    const personalInfoRaw = faqData?.personal_info;
    let personalInfo = personalInfoRaw;

    if (typeof personalInfoRaw === 'string') {
      try {
        personalInfo = JSON.parse(personalInfoRaw);
      } catch (error) {
        console.warn('⚠️ Unable to parse personal_info JSON for filename:', error);
        personalInfo = null;
      }
    }

    // const nameParts = [personalInfo?.first_name, personalInfo?.last_name]
    const nameParts = [personalInfo?.first_name] // first name
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean);
    const rawFullName = nameParts.join(' ');
    const sanitizedFullName = sanitizeForFilename(rawFullName, { removeWhitespace: true });

    if (sanitizedFullName) {
      cachedFullNameForFilename = sanitizedFullName;
      return cachedFullNameForFilename;
    }
  } catch (error) {
    console.warn('⚠️ Could not derive user full name for filename:', error);
  }

  return 'Candidate';
}

function formatJobTitleForFilename(rawTitle) {
  const withoutParens = stripParentheticalContent(rawTitle);
  const sanitized = sanitizeForFilename(withoutParens, { removeWhitespace: true });
  return sanitized || 'Job';
}

// ======== End of Supporting functions ========

export {
  ensureEasyApplyModal,
  locateEasyApplyModal,
  isModalStillAttached,
  getFormPageTitle,
  waitForApplicationSubmissionSuccess,
  isSubmissionSuccessHeading,
  locateSubmissionSuccessModal,
  reportLinkedInApplicationOutcome,
  releaseLinkedinLock
};
