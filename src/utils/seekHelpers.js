import { downloadPdf } from './documentDownload.js';
import { assertCanAdvance, waitForUploadReady, FlowStop } from './flowGuard.js';
// Shared helper functions for Seek autofill
// Used by both seek_simple.js (continuous) and seek_autodill.js (manual)

import { updateAutofillProgress } from './progressUtils.js';
import { mapStructuredQuestion } from '../services/infoMapping.js';

// Helper function to find and click job card if apply button is not visible
export async function findAndClickJobCard(jobId) {
  // Ensure jobId is a string for consistent comparison
  const targetJobId = String(jobId).trim();
  console.log(`🔍 [FIND_CARD] Looking for job card with ID: "${targetJobId}"`);
  console.log(`🔍 [FIND_CARD] Current URL: ${window.location.href}`);
  
  try {
    let jobCard = null;
    let usedSelector = '';
    
    // Strategy 1: Look for data-automation="recommendedJobLink_{jobId}" (MOST RELIABLE based on HTML structure)
    console.log('🔍 [STRATEGY_1] Checking data-automation="recommendedJobLink_*"...');
    const targetAutomation = `recommendedJobLink_${targetJobId}`;
    const automationLink = document.querySelector(`[data-automation="${targetAutomation}"]`);
    
    if (automationLink) {
      jobCard = automationLink;
      usedSelector = `data-automation="${targetAutomation}"`;
      console.log(`✅ [STRATEGY_1] Found via data-automation`);
      console.log(`   Automation attribute: "${targetAutomation}"`);
      console.log(`   Element href: ${automationLink.href || 'N/A'}`);
    } else {
      console.log(`   No element found with data-automation="${targetAutomation}"`);
    }
    
    // Strategy 2: Look for ANY data-automation containing jobLink or job with the ID
    if (!jobCard) {
      console.log('🔍 [STRATEGY_2] Checking any data-automation with job ID...');
      const automationElements = document.querySelectorAll('[data-automation*="job"]');
      console.log(`   Found ${automationElements.length} elements with "job" in data-automation`);
      
      for (const element of automationElements) {
        const automation = element.getAttribute('data-automation');
        // Match patterns like: "jobLink_123456", "recommendedJobLink_123456", "job-123456"
        const idMatch = automation.match(/jobLink[_-]?(\d+)$/i) || automation.match(/job[_-](\d+)$/i);
        if (idMatch) {
          const elementJobId = String(idMatch[1]).trim();
          
          if (elementJobId === targetJobId) {
            jobCard = element;
            usedSelector = `data-automation="${automation}"`;
            console.log(`✅ [STRATEGY_2] Found via data-automation pattern`);
            console.log(`   Automation value: "${automation}"`);
            console.log(`   Extracted ID: "${elementJobId}"`);
            break;
          }
        }
      }
    }
    
    // Strategy 3: Look for links with EXACT job ID in href
    if (!jobCard) {
      console.log('🔍 [STRATEGY_3] Checking links with /job/{id} in href...');
      const allLinks = document.querySelectorAll('a[href*="/job/"]');
      console.log(`   Found ${allLinks.length} links with /job/ in href`);
      
      for (const link of allLinks) {
        // Match /job/{id} followed by ? or end
        const hrefMatch = link.href.match(/\/job\/(\d+)(?:\?|$)/);
        if (hrefMatch) {
          const linkJobId = String(hrefMatch[1]).trim();
          
          if (linkJobId === targetJobId) {
            jobCard = link;
            usedSelector = `a[href*="/job/${targetJobId}"]`;
            console.log(`✅ [STRATEGY_3] Found matching link via href`);
            console.log(`   Link ID: "${linkJobId}"`);
            console.log(`   Link href: ${link.href}`);
            break;
          }
        }
      }
    }
    
    // Strategy 4: Look for button IDs containing the job ID (save/hide buttons)
    if (!jobCard) {
      console.log('🔍 [STRATEGY_4] Checking button IDs with job ID...');
      const buttonPatterns = [
        `recs-homepage-save-job-${targetJobId}`,
        `recs-homepage-hide-job-${targetJobId}`,
        `recs-homepage-m-hide-job-${targetJobId}`
      ];
      
      for (const buttonId of buttonPatterns) {
        const button = document.getElementById(buttonId);
        if (button) {
          // Find the parent container with the clickable link
          const container = button.closest('[aria-label]');
          if (container) {
            const link = container.querySelector('a[href*="/job/"]');
            if (link) {
              jobCard = link;
              usedSelector = `button#${buttonId} -> closest container -> link`;
              console.log(`✅ [STRATEGY_4] Found via button ID: "${buttonId}"`);
              console.log(`   Found link in container: ${link.href}`);
              break;
            }
          }
        }
      }
    }
    
    if (!jobCard) {
      console.log(`❌ [FIND_CARD] Could not find job card for ID: "${targetJobId}"`);
      console.log('   Tried all strategies without success');
      console.log('   🔍 Dumping first 5 data-automation attributes for debugging:');
      
      const debugElements = document.querySelectorAll('[data-automation*="job"]');
      Array.from(debugElements).slice(0, 5).forEach((element, index) => {
        console.log(`   Element ${index + 1}: data-automation="${element.getAttribute('data-automation')}"`);
      });
      
      return false;
    }
    
    // Click the job card to bring it into focus
    console.log(`🖱️ [CLICK] About to click job card (found via ${usedSelector})`);
    console.log(`   Element type: ${jobCard.tagName}`);
    console.log(`   Element href: ${jobCard.href || 'N/A'}`);
    console.log(`   Element visible: ${jobCard.offsetParent !== null}`);
    
    // Scroll into view
    jobCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Click the element
    jobCard.click();
    console.log('✅ [CLICK] Job card clicked successfully');
    
    // Wait for the job details to load and apply button to appear
    console.log('⏳ [WAIT] Waiting for job details and apply button to load...');
    const buttonFound = await waitForApplyButton(5000);
    
    if (!buttonFound) {
      console.log('⚠️ [WAIT] Apply button did not appear after clicking card');
    } else {
      console.log('✅ [WAIT] Apply button is now visible');
    }
    
    return buttonFound;
  } catch (error) {
    console.error('❌ [ERROR] Error in findAndClickJobCard:', error);
    return false;
  }
}

// Helper function to wait for apply button to appear
export async function waitForApplyButton(timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const applyButton = document.querySelector('[data-automation="job-detail-apply"]');
    if (applyButton) {
      console.log('✅ Apply button found!');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('⚠️ Apply button not found within timeout');
  return false;
}

// Helper function to get current resume count
export function getResumeCount() {
  const resumeItems = document.querySelectorAll('[data-testid*="resume-item"], .resume-item, [data-automation*="resume"]');
  const resumeDropdownOptions = document.querySelectorAll('select option[value]:not([value=""]):not([disabled])');
  
  if (resumeDropdownOptions.length > 0) {
    return resumeDropdownOptions.length;
  } else if (resumeItems.length > 0) {
    return resumeItems.length;
  }
  
  const _resumeElements = document.querySelectorAll('[data-testid*="resume"], [class*="resume"]');
  return 0;
}

// Helper function to handle resume upload
export async function handleResumeUpload(resumeUrl) {
  console.log('📄 Starting resume upload process');
  
  if (window.resumeUploadInProgress) {
    console.log('⚠️ Resume upload already in progress, skipping duplicate');
    return;
  }
  
  window.resumeUploadInProgress = true;
  
  try {
    const uploadRadio = document.querySelector('input[data-testid="resume-method-upload"]');
    if (uploadRadio) {
      uploadRadio.click();
      uploadRadio.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('✅ Selected "Upload a resumé" option');
    }
    
    const currentCount = getResumeCount();
    console.log('Current resume count:', currentCount);
    
    if (currentCount < 10) {
      console.log('Resume count under limit - direct upload');
      updateAutofillProgress(`Resume slot available (${currentCount}/10) - uploading file...`);
      await uploadResumeFile(resumeUrl);
      updateAutofillProgress('Resume uploaded successfully ✓');
    } else {
      console.log('Resume limit reached - need to delete resumes until count is 9');
      updateAutofillProgress(`Resume limit reached (${currentCount}/10) - deleting old resumes...`);
      await deleteResumesUntilUnderLimit();
      console.log('Uploading new resume after clearing space');
      updateAutofillProgress('Now uploading new resume file...');
      await uploadResumeFile(resumeUrl);
      updateAutofillProgress('Resume uploaded successfully ✓');
    }
    
  } catch (error) {
    console.error('❌ Error uploading resume:', error);
    throw error;
  } finally {
    window.resumeUploadInProgress = false;
  }
}

// Helper function to upload resume file
export async function uploadResumeFile(resumeUrl) {
  try {
    const fileInput = document.querySelector('input#resume-fileFile[data-testid="file-input"]');
    if (fileInput) {
      fileInput.value = '';
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const blob = await downloadPdf(resumeUrl);
      
      // Get user's first name and job title for filename
      let firstName = 'Resume';
      let jobTitle = 'JobGenAI';
      
      try {
        // Get user's first name from storage
        const result = await chrome.storage.local.get(['user_faq_data']);
        if (result.user_faq_data) {
          const personalInfo = typeof result.user_faq_data.personal_info === 'string' 
            ? JSON.parse(result.user_faq_data.personal_info)
            : result.user_faq_data.personal_info;
          
          if (personalInfo?.first_name) {
            firstName = personalInfo.first_name;
          }
        }
        
        // Get job title from current job
        const currentJobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
        if (currentJobId) {
          const jobInfoResult = await chrome.storage.local.get([`seek_job_${currentJobId}`]);
          const jobInfo = jobInfoResult[`seek_job_${currentJobId}`];
          
          if (jobInfo?.job_title) {
            // Clean job title for filename (remove special characters)
            jobTitle = jobInfo.job_title
              .replace(/[^a-zA-Z0-9\s]/g, '')
              .replace(/\s+/g, '')
              .substring(0, 50); // Limit length
          }
        }
      } catch (_e) {
        console.log('⚠️ Could not get name/title for filename, using defaults');
      }
      
      const filename = `${firstName}-${jobTitle}.pdf`;
      console.log('📄 Resume filename:', filename);
      
      const file = new File([blob], filename, { type: 'application/pdf' });
      
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('✅ Resume uploaded successfully');
    } else {
      throw new FlowStop('seek', 'documents', 'MISSING_CONTROL');
    }
  } catch (error) {
    console.error('❌ Error in file upload:', error);
    throw error;
  }
}

// Helper function to delete resumes until count is 9 or fewer
export async function deleteResumesUntilUnderLimit({ confirmed = false } = {}) {
  const targetCount = 9;
  let currentCount = getResumeCount();
  if (currentCount > targetCount && !confirmed) throw new FlowStop('seek', 'documents', 'MANUAL_REVIEW_REQUIRED');
  let deletionAttempts = 0;
  const maxDeletions = 10;
  
  console.log(`🗑️ Starting bulk deletion - Current: ${currentCount}, Target: ${targetCount}`);
  
  while (currentCount > targetCount && deletionAttempts < maxDeletions) {
    deletionAttempts++;
    console.log(`🗑️ Deletion attempt ${deletionAttempts} - Current count: ${currentCount}`);
    
    const uploadButton = document.querySelector('button[data-testid="upload-button"]');
    if (uploadButton) {
      console.log('Clicking upload button to trigger overflow popup');
      uploadButton.click();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const limitPopup = document.querySelector('[data-testid="10-resume-limit-text"]');
    if (limitPopup) {
      console.log('✅ Overflow popup appeared - deleting oldest resume');
      await handleResumeOverflow();
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      const newCount = getResumeCount();
      
      if (newCount >= currentCount) {
        console.warn('⚠️ Resume count did not decrease, breaking loop to prevent infinite deletion');
        break;
      }
      
      currentCount = newCount;
      console.log(`✅ Deletion successful - New count: ${currentCount}`);
    } else {
      console.error('Expected overflow popup but it did not appear');
      break;
    }
  }
}

// Helper function to handle resume overflow popup
export async function handleResumeOverflow() {
  try {
    const overflowDropdown = document.querySelector('select#docLimitExceededDropdown');
    if (!overflowDropdown) {
      console.warn('⚠️ Overflow dropdown not found');
      return;
    }
    
    console.log('✅ Found overflow dropdown');
    
    const options = Array.from(overflowDropdown.options);
    const resumeOptions = options.filter(option => option.value && option.value !== '');
    
    if (resumeOptions.length === 0) {
      console.warn('⚠️ No resume options found');
      return;
    }
    
    const oldestResume = resumeOptions[resumeOptions.length - 1];
    console.log('🗑️ Selecting oldest resume for deletion:', oldestResume.textContent);
    
    overflowDropdown.focus();
    overflowDropdown.value = oldestResume.value;
    overflowDropdown.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const deleteButton = document.querySelector('button[data-automation="10-resume-delete"]');
    if (deleteButton) {
      console.log('🗑️ Clicking delete button');
      deleteButton.focus();
      deleteButton.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('✅ Resume deleted successfully');
    }
    
  } catch (error) {
    console.error('❌ Error handling resume overflow:', error);
  }
}

// Helper function to handle cover letter upload
export async function handleCoverLetterUpload(coverLetterUrl) {
  console.log('📝 Starting cover letter upload process');
  
  try {
    const uploadCoverLetterRadio = document.querySelector('input[data-testid="coverLetter-method-upload"]');
    if (uploadCoverLetterRadio) {
      uploadCoverLetterRadio.click();
      uploadCoverLetterRadio.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    const coverLetterInput = document.querySelector('input#coverLetter-fileFile[data-testid="file-input"]');
    if (coverLetterInput) {
      const blob = await downloadPdf(coverLetterUrl);
      
      // Get user's first name and job title for filename
      let firstName = 'CoverLetter';
      let jobTitle = 'JobGenAI';
      
      try {
        // Get user's first name from storage
        const result = await chrome.storage.local.get(['user_faq_data']);
        if (result.user_faq_data) {
          const personalInfo = typeof result.user_faq_data.personal_info === 'string' 
            ? JSON.parse(result.user_faq_data.personal_info)
            : result.user_faq_data.personal_info;
          
          if (personalInfo?.first_name) {
            firstName = personalInfo.first_name;
          }
        }
        
        // Get job title from current job
        const currentJobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
        if (currentJobId) {
          const jobInfoResult = await chrome.storage.local.get([`seek_job_${currentJobId}`]);
          const jobInfo = jobInfoResult[`seek_job_${currentJobId}`];
          
          if (jobInfo?.job_title) {
            // Clean job title for filename (remove special characters)
            jobTitle = jobInfo.job_title
              .replace(/[^a-zA-Z0-9\s]/g, '')
              .replace(/\s+/g, '')
              .substring(0, 50); // Limit length
          }
        }
      } catch (_e) {
        console.log('⚠️ Could not get name/title for cover letter filename');
      }
      
      const filename = `${firstName}-${jobTitle}-CoverLetter.pdf`;
      console.log('📄 Cover letter filename:', filename);
      
      const file = new File([blob], filename, { type: 'application/pdf' });
      
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      coverLetterInput.files = dataTransfer.files;
      coverLetterInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      updateAutofillProgress('Cover letter uploaded successfully ✓');
      console.log('✅ Cover letter uploaded successfully');
    } else {
      throw new FlowStop('seek', 'documents', 'MISSING_CONTROL');
    }
    
  } catch (error) {
    console.error('❌ Error uploading cover letter:', error);
    throw error;
  }
}

// Helper function to wait for upload completion
export async function waitForUploadCompletion(options) {
  return waitForUploadReady(document, options);
}

// ======== Career history management on "Update SEEK Profile" page ========

// Returns the delete button visible inside an open role-edit form.
export function findSeekCareerDeleteButton() {
  return Array.from(document.querySelectorAll('button')).find(btn => {
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
    const automation = btn.getAttribute('data-automation') || '';
    const label = `${btn.getAttribute('aria-label') || ''} ${btn.textContent || ''}`
      .replace(/\s+/g, ' ').trim();
    return (
      automation === 'career-history-delete-button' ||
      automation === 'role-delete-button' ||
      automation === 'delete-role' ||
      (automation.includes('delete') && (automation.includes('role') || automation.includes('career'))) ||
      /\b(delete|remove)\b.*\b(role|career|employment|position)\b/i.test(label) ||
      /^(delete|remove)$/i.test(label)
    );
  }) || null;
}

// Waits up to timeoutMs for a delete-confirmation button to appear in a dialog.
export async function waitForSeekDeleteConfirmButton(timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dialogs = Array.from(document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-testid*="modal"], [data-automation*="modal"]'
    )).filter(d => /delete|remove/i.test(d.textContent || ''));

    for (const dialog of dialogs) {
      const btn =
        dialog.querySelector('button[data-automation^="confirm-delete"]') ||
        Array.from(dialog.querySelectorAll('button')).find(b => {
          if (b.disabled) return false;
          const text = `${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`
            .replace(/\s+/g, ' ').trim();
          return /^(delete|delete role|remove|confirm|yes,? delete|yes,? remove)$/i.test(text);
        });
      if (btn) return btn;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

// Returns actual career-history entries on the profile page.
// Excludes "Found in resumé" suggestion cards — those are items SEEK is inviting
// the user to ADD and do not have a delete control.
export function getSeekProfileCareerCards() {
  const editButtons = Array.from(
    document.querySelectorAll('button[data-automation^="edit-role-"]')
  );

  const results = [];
  for (const editBtn of editButtons) {
    let card = editBtn.parentElement;
    let foundCard = null;
    for (let i = 0; i < 6; i++) {
      if (!card || card === document.body) break;
      // "Found in resumé" cards are SEEK suggestions to add roles — skip them.
      if (/found in resum/i.test(card.textContent || '')) {
        foundCard = null;
        break;
      }
      const lines = (card.textContent || '')
        .split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length >= 3 && card.querySelectorAll('button').length <= 5) {
        foundCard = card;
        break;
      }
      card = card.parentElement;
    }
    if (foundCard) results.push({ card: foundCard, editButton: editBtn });
  }
  return results;
}

// Deletes a single career card. Returns { deleted: boolean, message?: string }.
export async function deleteSeekCareerCard(entry, { confirmed = false } = {}) {
  if (!confirmed) throw new FlowStop('seek', 'advance', 'MANUAL_REVIEW_REQUIRED');
  const { card, editButton } = entry;

  if (!editButton || !document.body.contains(editButton)) {
    return { deleted: false, message: 'Edit control not found — please delete this role manually' };
  }

  editButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 300));
  editButton.click();
  await new Promise(r => setTimeout(r, 1000));

  const deleteBtn = findSeekCareerDeleteButton();
  if (!deleteBtn) {
    // Dismiss the edit form so the page stays in a clean state.
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(b =>
      /^cancel$/i.test((b.textContent || '').trim())
    );
    cancelBtn?.click();
    return { deleted: false, message: 'Delete control not found — please delete this role manually' };
  }

  deleteBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 300));
  deleteBtn.click();

  const confirmBtn = await waitForSeekDeleteConfirmButton(4000);
  if (!confirmBtn) {
    return { deleted: false, message: 'Delete confirmation did not appear — please delete this role manually' };
  }
  confirmBtn.click();

  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (!document.body.contains(card)) return { deleted: true };
    await new Promise(r => setTimeout(r, 300));
  }
  return { deleted: false, message: 'Role did not disappear after deletion — please remove it manually' };
}

// Helper function to click next/continue button
export async function clickNextButton() {
  const expectedUrl = window.location.href;
  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Try specific data-testid first
    let nextButton = document.querySelector('button[data-testid="continue-button"]');
    
    // If not found, search for buttons by text content
    if (!nextButton) {
      const buttons = document.querySelectorAll('button');
      nextButton = Array.from(buttons).find(btn => {
        const text = btn.textContent?.trim().toLowerCase() || '';
        return text.includes('continue') || text.includes('next');
      });
    }
    
    // Try data-automation attributes
    if (!nextButton) {
      nextButton = document.querySelector('[data-automation*="continue"]') ||
                   document.querySelector('[data-automation*="next"]');
    }
  
    if (nextButton) {
      console.log('➡️ Clicking Next/Continue button:', nextButton.textContent?.trim());
      assertCanAdvance(nextButton.form || document.querySelector('main') || document, nextButton, { site: 'seek', step: 'advance', expectedUrl });
      nextButton.click();
      return true;
    } else {
      assertCanAdvance(document, null, { site: 'seek', step: 'advance', expectedUrl });
    }
    
  } catch (error) {
    console.error('❌ Error clicking next button:', error);
    throw error;
  }
}

// Helper function to handle question answering
export async function handleQuestionAnswering(form) {
  const questions = form.children;
  const totalQuestions = questions.length - 1;
  
  // First, clear all checkboxes
  const allCheckboxes = form.querySelectorAll('input[type="checkbox"]');
  allCheckboxes.forEach(checkbox => {
    if (checkbox.checked) {
      checkbox.focus();
      checkbox.click();
      console.log(`Unchecked: ${checkbox.id}`);
    }
  });
  console.log(`🧹 Cleared ${allCheckboxes.length} checkboxes`);
  
  await new Promise(resolve => setTimeout(resolve, 500));

  for (let i = 0; i < totalQuestions; i++) {
    const question = questions[i];
    const questionText = question.querySelector('label strong')?.innerText ||
      question.querySelector('strong')?.innerText ||
      question.querySelector('legend strong')?.innerText ||
      question.querySelector('legend')?.innerText?.trim() || `Question ${i + 1}`;
    
    const selectElement = question.querySelector('select');
    const textareaElement = question.querySelector('textarea');
    const checkboxElements = question.querySelectorAll('input[type="checkbox"]');
    const radioElements = question.querySelectorAll('input[type="radio"]');

    if (selectElement) {
      await handleSelectQuestion(selectElement, questionText);
    } else if (radioElements.length > 0) {
      await handleRadioQuestion(radioElements, questionText);
    } else if (checkboxElements.length > 0) {
      await handleCheckboxQuestion(checkboxElements, questionText);
    } else if (textareaElement) {
      await handleTextareaQuestion(textareaElement, questionText);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

// Individual question handlers
async function handleSelectQuestion(selectElement, questionText) {
  const options = {};
  selectElement.querySelectorAll('option').forEach(option => {
    if (option.value) {
      options[option.value] = option.textContent.trim();
    }
  });

  const questionData = {
    question: questionText,
    question_type: 'single choice',
    options: options
  };
  
  const result = await mapStructuredQuestion(questionData);
  
  if (result?.answer) {
    selectElement.value = result.answer;
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ Filled select: "${questionText}" = "${result.answer}"`);
  }
}

async function handleRadioQuestion(radioElements, questionText) {
  const options = {};
  radioElements.forEach(radio => {
    const labelElement = document.querySelector(`label[for="${radio.id}"]`);
    if (labelElement) {
      const labelText = labelElement.querySelector('span')?.textContent?.trim() || labelElement.textContent.trim();
      options[radio.value] = labelText;
    }
  });

  const questionData = {
    question: questionText,
    question_type: 'single choice',
    options: options
  };
  
  const result = await mapStructuredQuestion(questionData);
  
  if (result?.answer) {
    const selectedRadio = [...radioElements].find(radio => radio.value === result.answer);
    if (selectedRadio && !selectedRadio.checked) {
      selectedRadio.focus();
      selectedRadio.click();
      console.log(`✅ Filled radio: "${questionText}" = "${result.answer}"`);
    }
  }
}

async function handleCheckboxQuestion(checkboxElements, questionText) {
  const options = {};
  checkboxElements.forEach(checkbox => {
    const labelElement = document.querySelector(`label[for="${checkbox.id}"]`);
    if (labelElement) {
      const labelText = labelElement.querySelector('span')?.textContent?.trim() || labelElement.textContent.trim();
      options[checkbox.id] = labelText;
    }
  });

  const questionData = {
    question: questionText,
    question_type: 'multiple choice',
    options: options
  };
  
  const result = await mapStructuredQuestion(questionData);
  
  if (result?.answer) {
    const answersArray = Array.isArray(result.answer) ? result.answer : [result.answer];
    answersArray.forEach(answerId => {
      const checkbox = document.querySelector(`#${answerId}`);
      if (checkbox && !checkbox.checked) {
        checkbox.focus();
        checkbox.click();
        console.log(`Checked: ${checkbox.id}`);
      }
    });
    console.log(`✅ Filled checkboxes: "${questionText}" = ${answersArray.join(', ')}`);
  }
}

async function handleTextareaQuestion(textareaElement, questionText) {
  const questionData = {
    question: questionText,
    question_type: 'input',
    options: {}
  };
  
  const result = await mapStructuredQuestion(questionData);
  
  if (result?.answer) {
    textareaElement.focus();
    textareaElement.value = '';
    textareaElement.value = result.answer;
    textareaElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    textareaElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    textareaElement.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    console.log(`✅ Filled textarea: "${questionText}" = "${result.answer}"`);
  }
}
