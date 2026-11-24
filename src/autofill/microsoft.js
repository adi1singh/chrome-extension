import { FlowStop, visibleForFlow } from '../utils/flowGuard.js';
import { downloadPdf } from '../utils/documentDownload.js';
import { mapStructuredQuestion } from '../services/infoMapping.js';
import { _getJWT, submitJobApplication } from '../services/apiService.js';
import { 
  createAutofillProgressSection,
  updateAutofillProgress,
  showAutofillSuccessState,
  showAutofillErrorState,
  closeAutofillProgress
} from '../utils/progressUtils.js';

export class MicrosoftAutofill {
  constructor() {
    this.siteName = 'microsoft';
    console.log('🔵 MicrosoftAutofill: Constructor called');
  }



  // Helper function for full click simulation
  simulateFullClick(el) {
    const events = ["pointerdown", "mousedown", "focus", "mouseup", "click"];
    for (const type of events) {
      const evt = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      });
      el.dispatchEvent(evt);
    }
  }

  // Helper function to wait for elements
  async waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const interval = 100;
      let elapsedTime = 0;

      const checkElement = setInterval(() => {
        let element = document.querySelector(selector);
        if (element) {
          clearInterval(checkElement);
          resolve(element);
        }
        elapsedTime += interval;
        if (elapsedTime >= timeout) {
          clearInterval(checkElement);
          reject(new Error(`Timeout: ${selector} not found`));
        }
      }, interval);
    });
  }

  async handleApply() {
    console.log('🔵 Microsoft: handleApply() called');
    console.log('🔵 Microsoft: Starting comprehensive autofill process');
    
         // Create and show progress animation - we'll update with specific page name after detection
     createAutofillProgressSection('Detecting Page', 'Microsoft');
     updateAutofillProgress('Starting autofill process');
    
    try {
      const pageTitle = document.querySelector("h1")?.innerText?.trim().toLowerCase();
      let currentPageName = 'Application Form';

      // ========== Profile Page ==========
      if (pageTitle?.includes("profile") || pageTitle?.includes("contact information")) {
        currentPageName = 'Profile & Contact Information';
        await this.fillProfilePage();
      }
      // ========== Work Authorization Page ==========
      else if (pageTitle?.includes("work authorization")) {
        currentPageName = 'Work Authorization';
        await this.fillWorkAuthorizationPage();
      }
      // ========== Additional Information Page ==========
      else {
        currentPageName = 'Additional Information';
        await this.fillAdditionalInformationPage();
      }

             // Show completion
      updateAutofillProgress('Autofill finished. Review the form and any missing fields.');
      setTimeout(() => {
        showAutofillSuccessState(currentPageName, 'Microsoft');
        
        // Manually close after 3 seconds
        setTimeout(() => {
          closeAutofillProgress();
        }, 3000);
      }, 1000);

    } catch (error) {
      console.error('❌ Microsoft autofill error:', error);
      const currentPageName = 'Application Form'; // fallback
      showAutofillErrorState(`An error occurred during autofill: ${error.message}`, currentPageName, 'Microsoft');
      return { success: false, error: 'AUTOFILL_STOPPED' };
    }

    return { success: true, message: 'Microsoft Apply autofill completed' };
  }

  async handleReview() {
    console.log('🔵 Microsoft: handleReview() called');
    console.log('🔵 Microsoft: This would extract job information and prepare review data');
    
    // For now, just simulate the review process
         createAutofillProgressSection('Job Review', 'Microsoft');
     updateAutofillProgress('Extracting job information');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    updateAutofillProgress('Analyzing job requirements');
    await new Promise(resolve => setTimeout(resolve, 800));
    
    showAutofillSuccessState('Job Review', 'Microsoft');
    
    console.log('✅ Microsoft: Review process completed');
    return { success: true, message: 'Microsoft Review completed' };
  }

  // Profile page autofill logic
  async fillProfilePage() {
    console.log("👤 Profile page detected. Filling name + contact info...");

    // Step 1: Get resume & cover letter from API
    updateAutofillProgress('Getting resume and cover letter');
    const { resumeContent, coverLetterURL } = await this.getResumeAndCoverLetter();

    // Step 2: Fill name section
    await this.fillNameSection();

    // Step 3: Fill contact section  
    await this.fillContactSection();

    // Step 4: Upload resume
    if (resumeContent) {
      await this.uploadResume(resumeContent);
    }

    // Step 5: Fill recent role information
    await this.fillRecentRoleInformation();

    // Step 6: Upload cover letter
    if (coverLetterURL) {
      await this.uploadCoverLetter(coverLetterURL);
    }

    // Step 7: Handle checkboxes
    await this.handlePrivacyCheckboxes();
  }

  // Work authorization page autofill logic
  async fillWorkAuthorizationPage() {
    console.log("🟣 Work Authorization page detected. Filling dynamic dropdowns...");
    updateAutofillProgress('Work Authorization');

    const fieldsets = document.querySelectorAll('fieldset');

    for (const fs of fieldsets) {
      try {
        const question = fs.querySelector('label')?.innerText?.trim();
        const caret = fs.querySelector('.ms-Dropdown-caretDownWrapper');

        // Clear existing selection
        const clearBtn = fs.querySelector('i[data-icon-name="Cancel"], i[data-icon-name="Clear"]')?.closest('button');
        if (clearBtn) {
          clearBtn.click();
          console.log(`🗑️ Cleared existing selection for: ${question}`);
          await new Promise(r => setTimeout(r, 300));
        }

        if (!question || !caret) continue;

        console.log(`🔍 Question: ${question}`);
        caret.click();
        await new Promise(r => setTimeout(r, 1000));

        // Get all options
        const options = {};
        document.querySelectorAll('button[role="option"]').forEach(opt => {
          const text = opt.innerText?.trim();
          if (text) options[text] = text;
        });

        if (Object.keys(options).length === 0) {
          console.warn(`⚠️ No options for: ${question}`);
          continue;
        }

        // Use infoMapping instead of structuredMapper
        const result = await mapStructuredQuestion({
          question,
          question_type: "single choice",
          options
        });
        const selected = result?.answer;

        const selectedOption = [...document.querySelectorAll('button[role="option"]')]
          .find(opt => opt.innerText?.trim() === selected);

        if (selectedOption) {
          selectedOption.click();
          console.log(`✅ Filled: "${question}" → ${selected}`);
        } else {
          console.warn(`⚠️ No matching option found for: ${selected}`);
        }

        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`❌ Error handling fieldset dropdown:`, err);
      }
    }
  }

  // Additional information page autofill logic
  async fillAdditionalInformationPage() {
    console.log(`🔍 Additional information page detected — autofilling additional information.`);
    updateAutofillProgress('Additional Information');

    const rows = document.querySelectorAll('.iCIMS_TableRow');
    console.log(`🔎 Found ${rows.length} .iCIMS_TableRow elements`);

    // Clear all inputs and dropdowns first
    console.log('🧹 Clearing all existing form values...');
    updateAutofillProgress('Clearing existing entries');
    
    // Clear all text inputs
    document.querySelectorAll('input[type="text"]').forEach(input => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    
    // Reset all dropdowns
    document.querySelectorAll('select').forEach(select => {
      const makeSelectionOption = [...select.options].find(opt => 
        opt.text.includes('Make a Selection') || opt.value === ''
      );
      if (makeSelectionOption) {
        select.value = makeSelectionOption.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    // Uncheck all checkboxes
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (cb.checked) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    await new Promise(r => setTimeout(r, 1000));
    updateAutofillProgress('Existing entries cleared');
    console.log('✅ All form fields cleared, starting autofill...');

    // Process each row
    for (const [idx, row] of [...rows].entries()) {
      const labelEl = row.querySelector('label');
      const labelText = labelEl?.innerText?.trim();
      if (!labelText) {
        console.warn(`⚠️ [${idx}] Skipped: No label found.`);
        continue;
      }
      
      updateAutofillProgress(labelText);

      const select = row.querySelector('select');
      const input = row.querySelector('input[type="text"]');
      const checkboxes = row.querySelectorAll('input[type="checkbox"]');

      let question_type = 'input';
      if (checkboxes.length >= 2) {
        question_type = 'multiple choice';
      } else if (select) {
        question_type = 'single choice';
      }

      let options = {};
      if (question_type === 'single choice') {
        for (const opt of select.options) {
          const val = opt.value?.trim();
          const txt = opt.innerText?.trim();
          if (val && txt && val !== '') options[val] = txt;
        }
      } else if (question_type === 'multiple choice') {
        checkboxes.forEach(cb => {
          const id = cb.id;
          const val = cb.value?.trim();
          const label = row.querySelector(`label[for="${id}"]`)?.innerText?.trim();
          if (val && label) options[val] = label;
        });
      }

      const questionObj = {
        question: labelText,
        question_type,
        options
      };

      console.log(`📌 [${idx}] Extracted Question:`, questionObj);

      try {
        // Use infoMapping instead of structuredMapper
        const result = await mapStructuredQuestion(questionObj);
        const answer = result?.answer;

        if (question_type === 'input' && input && typeof answer === 'string') {
          input.value = answer;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          console.log(`✅ [${idx}] Filled input: ${labelText} → ${answer}`);
        }

        else if (question_type === 'single choice' && select) {
          const matched = [...select.options].find(o => o.value === answer);
          if (matched) {
            select.value = answer;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`✅ [${idx}] Selected dropdown: ${labelText} → ${answer}`);
          } else {
            console.warn(`⚠️ [${idx}] No matching dropdown option for: ${answer}`);
          }
        }

        else if (question_type === 'multiple choice' && checkboxes.length) {
          const toCheck = Array.isArray(answer) ? answer : [answer];
          let checkedAny = false;
          for (const cb of checkboxes) {
            if (toCheck.includes(cb.value)) {
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
              console.log(`☑️ [${idx}] Checked: ${cb.value}`);
              checkedAny = true;
            }
          }
          if (!checkedAny) {
            console.warn(`⚠️ [${idx}] No checkbox matched for:`, answer);
          }
        }

        else {
          console.warn(`❓ [${idx}] Unknown input type or no element found to fill.`);
        }
      } catch (e) {
        console.error(`❌ [${idx}] mapStructuredQuestion() error:`, e);
      }

      await new Promise(r => setTimeout(r, 300));
    }

    console.log("✅ Autofill complete for additional information page.");
  }

  // Helper methods for specific sections
  async getResumeAndCoverLetter() {
    let resumeContent = null;
    let coverLetterURL = null;
    
    try {
      // Extract job information from the page
      const jobTitle = document.querySelector('h1')?.textContent?.trim() || 'N/A';
      const company = 'Microsoft';
      const pageUrl = new URL(window.location.href);
      const jobId = pageUrl.searchParams.get('jobId') || pageUrl.searchParams.get('jobid') ||
        pageUrl.pathname.match(/\/(?:job|jobs)\/([^/]+)/)?.[1];
      const description = document.querySelector('[data-testid="job-description"], [data-automation="jobDescription"], .job-description')?.textContent?.trim();
      if (!jobId || !description) {
        updateAutofillProgress('Job details are unavailable here. Review or upload your documents on the application form.');
        return { resumeContent, coverLetterURL };
      }
      
      const jobApplicationData = {
        job_url: window.location.href,
        job_url_id: jobId, 
        job_portal: 'microsoft',
        description, 
        cover_letter: 'yes',
        company: company,
        job_title: jobTitle
      };

      console.log("🚀 Calling submitJobApplication with data:", {
        job_title: jobApplicationData.job_title,
        company: jobApplicationData.company,
        job_portal: jobApplicationData.job_portal,
        cover_letter: jobApplicationData.cover_letter
      });

      // Use the standardized submitJobApplication function
      const result = await submitJobApplication(jobApplicationData);
      
      if (result.error) {
        console.error("❌ Failed to submit job application:", result.error);
        return { resumeContent, coverLetterURL };
      }

      if (result.success) {
        resumeContent = result.resume || null;
        coverLetterURL = result.cover_letter || null;
        
        console.log("📄 Resume content retrieved:", !!resumeContent);
        console.log("🔗 Cover letter URL retrieved:", !!coverLetterURL);
        console.log("🆔 Job ID:", result.job_id);
      } else {
        console.warn("⚠️ Unexpected response format from submitJobApplication:", result);
      }
      
    } catch (err) {
      console.error("❌ Failed to get resume and cover letter:", err);
    }
    
    return { resumeContent, coverLetterURL };
  }

  async fillNameSection() {
    updateAutofillProgress('Name Information');
    
    const nameEditButton = document.querySelector('button[data-testid="edit-link-test-id"][aria-label="name edit"]');
    if (nameEditButton) {
      nameEditButton.click();
      await new Promise(r => setTimeout(r, 500));
    }

    const nameFields = [
      { label: "First name", aria: "add first name" },
      { label: "Middle name", aria: "add middle name" },
      { label: "Last name", aria: "add last name" },
      { label: "Preferred first name", aria: "add preferred name" }
    ];

    // Clear all name fields
    for (const field of nameFields) {
      const inp = document.querySelector(`input[aria-label="${field.aria}"]`);
      if (inp) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    await new Promise(r => setTimeout(r, 300));

    // Fill name fields
    for (const field of nameFields) {
      const inputField = document.querySelector(`input[aria-label="${field.aria}"]`);

      const questionData = {
        question: field.label,
        question_type: "input",
        options: {}
      };

      try {
        const result = await mapStructuredQuestion(questionData);
        const answer = result?.answer;
        if (inputField && typeof answer === 'string') {
          inputField.value = answer;
          inputField.dispatchEvent(new Event('input', { bubbles: true }));
          console.log(`🟢 Name - Filled ${field.label}: ${answer}`);
        }
      } catch (e) {
        console.error(`❌ Name - Error filling ${field.label}:`, e);
      }
    }
  }

  async fillContactSection() {
    updateAutofillProgress('Contact Information');
    
    const contactEditButton = document.querySelector('#contactEditId');
    if (contactEditButton) {
      contactEditButton.click();
      await new Promise(r => setTimeout(r, 300));
    }

    const contactInputFields = [
      { label: "Phone number", aria: "add phone number" },
      { label: "Street address", aria: "add street address" },
      { label: "City", aria: "add city" }
    ];

    // Clear all contact fields
    for (const field of contactInputFields) {
      const inp = document.querySelector(`input[aria-label="${field.aria}"]`);
      if (inp) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    await new Promise(r => setTimeout(r, 300));

    // Fill contact fields
    for (const field of contactInputFields) {
      const inputField = document.querySelector(`input[aria-label="${field.aria}"]`);

      const questionData = {
        question: field.label,
        question_type: "input",
        options: {}
      };

      try {
        const result = await mapStructuredQuestion(questionData);
        const answer = result?.answer;
        if (inputField && typeof answer === 'string') {
          inputField.value = answer;
          inputField.dispatchEvent(new Event('input', { bubbles: true }));
          console.log(`🟢 Contact - Filled ${field.label}: ${answer}`);
        }
      } catch (e) {
        console.error(`❌ Contact - Error filling ${field.label}:`, e);
      }
    }

    // Handle contact dropdowns
    await this.fillContactDropdowns();

    // Click save button
    const saveBtn = [...document.querySelectorAll('.ms-Button-label')]
      .find(btn => btn.innerText.trim().toLowerCase() === 'save');

    if (saveBtn) {
      await new Promise(r => setTimeout(r, 800));
      saveBtn.click();
      console.log("💾 Contact info saved.");
    } else {
      console.warn("❌ Save button not found.");
    }
  }

  async fillContactDropdowns() {
    const contactDropdownFields = [
      {
        label: "Country/region of residence",
        aria: "select your country or region"
      },
      {
        label: "State/province", 
        aria: "select your state or province"
      }
    ];

    for (let i = 0; i < contactDropdownFields.length; i++) {
      const field = contactDropdownFields[i];

      try {
        const input = document.querySelector(`input[aria-label="${field.aria}"]`);
        if (!input) {
          console.warn(`⚠️ Cannot find dropdown input for ${field.label}`);
          continue;
        }

        const wrapper = input.closest('.ms-ComboBox');

        // Clear existing selection
        const clearBtn = wrapper?.querySelector('i[data-icon-name="Cancel"], i[data-icon-name="Clear"]')?.closest('button');
        if (clearBtn) {
          clearBtn.click();
          console.log(`🗑️ Cleared existing selection for: ${field.label}`);
          await new Promise(r => setTimeout(r, 300));
        }

        // Click caret to expand dropdown
        const caretBtn = wrapper?.querySelector('.ms-ComboBox-CaretDown-button');
        if (caretBtn) {
          caretBtn.click();
          await new Promise(r => setTimeout(r, 800));
        } else {
          console.warn(`⚠️ No dropdown caret found for: ${field.label}`);
          continue;
        }

        // Get options
        const optionsContainer = document.querySelector('.ms-ComboBox-optionsContainer[role="listbox"]');
        const options = {};
        if (optionsContainer) {
          optionsContainer.querySelectorAll('button[role="option"]').forEach(opt => {
            const textEl = opt.querySelector('.ms-ComboBox-optionText');
            const val = opt.getAttribute('data-value') || textEl?.innerText.trim();
            const txt = textEl?.innerText.trim();
            if (txt) options[val] = txt;
          });
        }

        if (Object.keys(options).length === 0) {
          console.warn(`⚠️ No options found for ${field.label}`);
          continue;
        }

        // Get answer using infoMapping
        const result = await mapStructuredQuestion({
          question: field.label,
          question_type: "single choice",
          options
        });
        const selectedKey = result?.answer;

        // Find and click the matching option
        const selectedOption = [...(optionsContainer?.querySelectorAll('button[role="option"]') || [])]
          .find(opt => {
            const label = opt.querySelector('.ms-ComboBox-optionText')?.innerText.trim();
            const val = opt.getAttribute('data-value') || label;
            return val === selectedKey || label === options[selectedKey];
          });

        if (selectedOption) {
          selectedOption.click();
          console.log(`✅ Selected ${field.label}: ${options[selectedKey]}`);
        } else {
          console.warn(`⚠️ No matching option found for: ${selectedKey}`);
        }

        await new Promise(r => setTimeout(r, 500));

        // Delay between dropdowns
        if (i === 0) {
          console.log("⏳ Waiting 2s before next dropdown...");
          await new Promise(r => setTimeout(r, 500));
        }

      } catch (e) {
        console.error(`❌ Dropdown - Error handling ${field.label}:`, e);
      }
    }
  }

  async uploadResume(resumeContent) {
    updateAutofillProgress('Resume Upload');
    
    try {
      // Click the update button to open upload popup
      const updateBtn = [...document.querySelectorAll('button.ms-Link')]
        .find(btn => btn.textContent?.toLowerCase().includes("update"));
      if (updateBtn) {
        updateBtn.click();
        await new Promise(r => setTimeout(r, 500));
        console.log("📤 Clicked Resume Update button.");
      } else {
        console.warn("⚠️ Resume Update button not found.");
      }

      // Wait for #uploadfiles input
      let resumeInput = null;
      for (let i = 0; i < 6; i++) {
        resumeInput = document.querySelector('input#uploadfiles[data-testid="inputFiles"]');
        if (resumeInput) break;
        console.log("⌛ Waiting for #uploadfiles input...");
        await new Promise(r => setTimeout(r, 500));
      }

      // Inject the file
      if (resumeInput) {
        console.log(`📁 Found resume input: ${resumeInput.id || resumeInput.className}`);
        
        const blob = await downloadPdf(resumeContent);
        const file = new File([blob], 'jobgenai_resume.pdf', { type: 'application/pdf' });

        const dt = new DataTransfer();
        dt.items.add(file);
        resumeInput.files = dt.files;
        
        // Trigger events
        console.log("🔄 Triggering resume upload events...");
        
        resumeInput.focus();
        
        const events = [
          new Event('focus', { bubbles: true }),
          new Event('input', { bubbles: true }),
          new Event('change', { bubbles: true }),
          new Event('blur', { bubbles: true })
        ];
        
        for (const event of events) {
          resumeInput.dispatchEvent(event);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Look for upload buttons
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // File assignment emits change; explicit site confirmation is left to the user.
        
        console.log("✅ Resume file injected with comprehensive event triggering");

        await new Promise(r => setTimeout(r, 1500));
        
        // Check for duplicate CV error and auto-close if detected
        await this.handleResumeUploadErrors();
      } else {
        throw new FlowStop('microsoft', 'documents', 'MISSING_CONTROL');
      }
    } catch (err) {
      console.error("❌ Resume upload failed:", err);
      throw err;
    }
  }

  async handleResumeUploadErrors() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const errors = document.querySelectorAll('[role="alert"], .ms-MessageBar--error, [data-testid*="error"]');
    if ([...errors].some(element => visibleForFlow(element) && /duplicate|already|same file|error|failed|invalid/i.test(element.textContent || ''))) {
      throw new FlowStop('microsoft', 'documents', 'UPLOAD_FAILED');
    }
  }

  async fillRecentRoleInformation() {
    updateAutofillProgress('Recent Role Information');
    
    try {
      // Click experience edit button
      const expEditBtn = document.querySelector('button[aria-label="experience edit"]');
      if (expEditBtn) {
        expEditBtn.click();
        await new Promise(r => setTimeout(r, 300));
        console.log('✏️ Clicked experience edit button.');
      } else {
        console.warn('⚠️ Experience edit button not found.');
      }

      // Fill input fields
      const roleInputFields = [
        { label: 'Most recent employer', aria: 'add most recent employer' },
        { label: 'Most recent job title', aria: 'add most recent job title' }
      ];

      // Clear all role input fields first
      for (const field of roleInputFields) {
        const inputEl = document.querySelector(`input[aria-label="${field.aria}"]`);
        if (inputEl) {
          inputEl.value = '';
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      await new Promise(r => setTimeout(r, 300));

      for (const field of roleInputFields) {
        const inputEl = document.querySelector(`input[aria-label="${field.aria}"]`);
        if (!inputEl) {
          console.warn(`⚠️ Cannot find input for ${field.label}`);
          continue;
        }

        try {
          const result = await mapStructuredQuestion({
            question: field.label,
            question_type: 'input',
            options: {}
          });
          const answer = result?.answer;
          
          if (typeof answer === 'string') {
            inputEl.value = answer;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            console.log(`🟢 Role - Filled ${field.label}: ${answer}`);
          }
        } catch (e) {
          console.error(`❌ Role - Error filling ${field.label}:`, e);
        }
      }

      // Handle "I currently work here" checkbox
      const currentWorkCheckbox = document.querySelector('input#checkbox-1016');
      if (currentWorkCheckbox) {
        // For now, just set to checked - could be made dynamic
        if (!currentWorkCheckbox.checked) {
          const labelEl = currentWorkCheckbox.closest('label');
          (labelEl || currentWorkCheckbox).click();
          console.log(`🔘 Checkbox set to checked`);
        }
      }

    } catch (e) {
      console.error('❌ Unexpected error during recent role autofill:', e);
    }
  }

  async uploadCoverLetter(coverLetterURL) {
    updateAutofillProgress('Cover Letter Upload');
    
    try {
      // Click to expand attachments section
      const expandBtn = [...document.querySelectorAll('button')]
        .find(btn =>
          btn.innerText?.toLowerCase().includes("attachment") ||
          btn.innerText?.toLowerCase().includes("add a file")
        );

      if (expandBtn) {
        expandBtn.click();
        await new Promise(r => setTimeout(r, 1000));
        console.log("📂 Clicked to expand attachments section.");

        if (document.querySelector('button i[data-icon-name="Delete"]')) {
          throw new FlowStop('microsoft', 'documents', 'MANUAL_REVIEW_REQUIRED');
        }

      }

      // Find file input
      let attachInput = null;
      for (let i = 0; i < 10; i++) {
        attachInput = document.querySelector('input#uploadfiles') ||
                      document.querySelector('input[type="file"][data-testid="inputFiles"]') ||
                      document.querySelector('input[type="file"].profileResumeUploadFileInputStyle-553');
        if (attachInput) break;
        await new Promise(r => setTimeout(r, 300));
      }

      if (!attachInput) {
        // Try clicking "Add a file" again
        const addFileBtn = [...document.querySelectorAll('button')]
          .find(b => b.innerText?.toLowerCase().includes('add a file'));
        if (addFileBtn) {
          addFileBtn.click();
          console.log('📂 Clicked "Add a file" button inside attachments.');
          await new Promise(r => setTimeout(r, 800));
          attachInput = document.querySelector('input[type="file"]');
        }
      }

      if (attachInput) {
        console.log(`📁 Found file input: ${attachInput.id || attachInput.className}`);
        
        const blob = await downloadPdf(coverLetterURL);
        const file = new File([blob], 'jobgenai_coverletter.pdf', { type: 'application/pdf' });

        const dt = new DataTransfer();
        dt.items.add(file);
        attachInput.files = dt.files;
        
        // Trigger events
        console.log("🔄 Triggering file upload events...");
        
        attachInput.focus();
        
        const events = [
          new Event('focus', { bubbles: true }),
          new Event('input', { bubbles: true }),
          new Event('change', { bubbles: true }),
          new Event('blur', { bubbles: true })
        ];
        
        for (const event of events) {
          attachInput.dispatchEvent(event);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Look for upload buttons
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // File assignment emits change; explicit site confirmation is left to the user.

        console.log("📎 Cover letter uploaded with comprehensive event triggering.");
      } else {
        throw new FlowStop('microsoft', 'documents', 'MISSING_CONTROL');
      }
    } catch (err) {
      console.error("❌ Attachment upload failed:", err);
      throw err;
    }
  }

  async handlePrivacyCheckboxes() {
    updateAutofillProgress('Review privacy and consent choices on the application form before submitting.');
    return { requiresReview: true };
  }

}

// Export function wrapper for consistency with other autofill modules
export function autofillMicrosoft() {
  const microsoftAutofill = new MicrosoftAutofill();
  return microsoftAutofill.handleApply();
}
