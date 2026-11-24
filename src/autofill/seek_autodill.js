import { FlowStop } from '../utils/flowGuard.js';
import { createProgressEmitters } from '../utils/progressBridge.js';
import {
  handleResumeUpload,
  handleCoverLetterUpload,
  waitForUploadCompletion,
  handleQuestionAnswering
} from '../utils/seekHelpers.js';

const PROGRESS_SITE = 'seek';
const baseEmitters = createProgressEmitters(PROGRESS_SITE);

// Track current mode for auto-navigation decisions
let currentFlowMode = 'autofill';

// === JOB-SPECIFIC FLOW FUNCTIONS (imported from seek_simple.js pattern) ===
async function startFlowForJob(jobId, mode = 'autofill') {
  try {
    // Set mode in storage for monitoring system to pick up
    await chrome.storage.local.set({ 'seek_flow_mode': mode });
    
    const flowKey = `seek_flow_${jobId}`;
    await chrome.storage.local.set({
      [flowKey]: {
        active: true,
        startTime: Date.now(),
        jobId: jobId,
        mode: mode
      }
    });
    console.log(`🚀 Flow started for job ${jobId} in ${mode} mode`);
  } catch (error) {
    console.error('❌ Error saving flow state:', error);
  }
}

// Wrap progress emitters with safeguards to prevent showing on listing pages
const startProgress = (mode = 'autofill', pageTitle = '', action = 'filling', extra = {}) => {
  // Never start progress on listing page
  const hasApplyButton = document.querySelector('[data-automation="job-detail-apply"]');
  const hasStepIndicator = document.querySelector('[aria-current="step"]');
  
  if (hasApplyButton && !hasStepIndicator) {
    console.log('🚫 Blocked progress start on Seek listing page');
    return;
  }
  
  currentFlowMode = mode; // Track the mode
  baseEmitters.start(mode, pageTitle, action, extra);
};

const updateProgress = baseEmitters.update;
const errorProgress = baseEmitters.error;

// Helper to determine if we should auto-click next
const shouldAutoClickNext = () => {
  return currentFlowMode === 'apply';
};

export async function autofillSeek() {
  console.log("Autofilling Seek...");
  
  // Prevent duplicate function calls
  if (window.seekAutofillInProgress) {
    console.log("⚠️ Seek autofill already in progress, skipping duplicate call");
    return;
  }
  window.seekAutofillInProgress = true;
  
  // Add your Seek autofill logic here
  try {
    // Check if we're on an application page by looking for step indicator
    const stepElement = document.querySelectorAll('[aria-current="step"]')[0];
    console.log('🎯 Step element:', stepElement);
    const currentPage = stepElement ? stepElement.innerText.trim() : null;
    console.log('🎯 Current page:', currentPage);

    let applyButton = document.querySelector('[data-automation="job-detail-apply"]');

    // If we're on a listing page (no step indicator)
    if (!stepElement) {
      console.log('⚠️ Listing page detected');
      
      // Check if apply button is already visible
      if (applyButton) {
        // Apply button exists, just click it
        const Btn_type = applyButton.innerText.trim();
        console.log('✅ Apply button already visible:', Btn_type);
        
        if (Btn_type.includes("Apply") && !Btn_type.includes("Quick")) {
          console.log('⚠️ Regular Apply button found - not supported (requires external site)');
          return;
        }
        else if (Btn_type.includes("Quick apply") || Btn_type.includes("Quick Apply")) {
          console.log('✅ Quick Apply button found - clicking now');
          applyButton.click();
          
          // Get job ID to start flow
          const result = await chrome.storage.local.get(['current_listing_job_id']);
          const jobId = result.current_listing_job_id;
          
          if (jobId) {
            // Start flow AFTER clicking button, with a delay to ensure page transitions
            setTimeout(async () => {
              console.log(`🚀 [AUTOFILL] Starting flow for job ${jobId} in autofill mode`);
              await startFlowForJob(jobId, 'autofill');
              console.log(`✅ [AUTOFILL] Flow started - monitoring will auto-fill first page`);
            }, 500);
          }
        }
      } else {
        // No apply button visible, need to find and open correct job container
        console.log('⚠️ Apply button not visible - need to find and open correct job container');
        
        // Get job ID from chrome.storage.local using key 'current_listing_job_id'
        console.log('🔍 Getting job ID from chrome.storage.local[current_listing_job_id]...');
        
        let jobId = null;
        try {
          const result = await chrome.storage.local.get(['current_listing_job_id']);
          jobId = result.current_listing_job_id;
          
          if (jobId) {
            console.log(`✅ Got job ID from storage: ${jobId}`);
          } else {
            console.log('❌ current_listing_job_id not found in storage');
            return;
          }
        } catch (error) {
          console.error('❌ Error getting job ID from storage:', error);
          return;
        }
        
        if (jobId) {
          // Open the job container for the correct job
          console.log(`🎯 Opening job container for ID: ${jobId}`);
          const { findAndClickJobCard } = await import('../utils/seekHelpers.js');
          const cardClicked = await findAndClickJobCard(jobId);
          
          if (!cardClicked) {
            console.log('❌ Could not find or click job card, or apply button did not appear');
            return;
          }
          
          // Get apply button after clicking card
          applyButton = document.querySelector('[data-automation="job-detail-apply"]');
          
          if (!applyButton) {
            console.log('❌ Apply button not found after clicking card');
            return;
          }
          
          // Now click the apply button
          const Btn_type = applyButton.innerText.trim();
          console.log('🎯 Apply button found after opening container:', Btn_type);
          
          if (Btn_type.includes("Apply") && !Btn_type.includes("Quick")) {
            console.log('⚠️ Regular Apply button found - not supported (requires external site)');
            return;
          }
          else if (Btn_type.includes("Quick apply") || Btn_type.includes("Quick Apply")) {
            console.log('✅ Quick Apply button found - clicking now');
            applyButton.click();
            
            // Start flow AFTER clicking button, with a delay to ensure page transitions
            setTimeout(async () => {
              console.log(`🚀 [AUTOFILL] Starting flow for job ${jobId} in autofill mode`);
              await startFlowForJob(jobId, 'autofill');
              console.log(`✅ [AUTOFILL] Flow started - monitoring will auto-fill first page`);
            }, 500);
          }
        }
      }
    }
    // If we're on application steps pages - validate job ID first
    else if (currentPage == "Choose documents") {
      // CRITICAL: Validate job ID matches between storage and current URL
      const jobIdMatch = await validateJobIdMatch();
      if (!jobIdMatch) {
        console.log('❌ Job ID mismatch - this is not the correct application tab');
        errorProgress('Job ID mismatch - this autofill is for a different job');
        return;
      }
      console.log('Choose documents page detected');
      
      // Wait a moment to ensure page has fully transitioned to application page
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Double-check we're on application page, not listing page
      const hasStepIndicator = document.querySelector('[aria-current="step"]');
      if (!hasStepIndicator) {
        console.log('🚫 No step indicator found - not on application page yet, skipping');
        return;
      }
      
      // Start progress tracking
      startProgress('autofill', currentPage, 'filling');
      
      try {
        // Retrieve job information from storage (try new system first, fallback to old)
        const getStoredJobInfo = async () => {
          try {
            // Extract current job ID from URL
            const urlMatch = window.location.href.match(/\/job\/(\d+)/);
            const currentJobId = urlMatch ? urlMatch[1] : null;
            
            if (currentJobId) {
              // Try new storage system first (seek_job_${jobId})
              const newStorageKey = `seek_job_${currentJobId}`;
              const newResult = await chrome.storage.local.get([newStorageKey]);
              const newStoredJob = newResult[newStorageKey];
              
              if (newStoredJob) {
                console.log('✅ Found job info in new storage system');
                return newStoredJob;
              }
            }
            
            // Fallback to old storage system (current_seek_job)
            return new Promise((resolve) => {
              if (chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['current_seek_job'], (result) => {
                  if (result.current_seek_job) {
                    console.log('✅ Found job info in old storage system');
                  }
                  resolve(result.current_seek_job || null);
                });
              } else {
                // Fallback for testing environment
                resolve(window.current_seek_job || null);
              }
            });
          } catch (error) {
            console.error('❌ Error getting stored job info:', error);
            return null;
          }
        };
        
        const jobInfo = await getStoredJobInfo();
        
        if (!jobInfo) {
          console.warn('⚠️ No job info found in storage');
          errorProgress('No job information found. Please start from the job listing page.');
          return;
        }
        
        console.log('📋 Retrieved job info from storage:', jobInfo);
        
        // Import the API service
        const { submitJobApplication } = await import('../services/apiService.js');
        
        // Use clean URL format: https://au.seek.com/job/{jobId}
        const cleanJobUrl = `https://au.seek.com/job/${jobInfo.job_url_id}`;
        console.log(`📍 Using clean job URL for API: ${cleanJobUrl}`);
        
        // Prepare job application data using stored info (current_seek_job structure)
        const jobApplicationData = {
          job_url: cleanJobUrl,
          description: jobInfo.description,
          cover_letter: "yes", // Request both resume and cover letter
          company: jobInfo.company,
          job_title: jobInfo.job_title,
          job_url_id: jobInfo.job_url_id,
          job_portal: jobInfo.job_portal || "SEEK"
        };
        
        console.log('🚀 Calling job application API to get documents...');
        updateProgress(currentPage, 'filling', { message: 'Generating personalized documents...' });
        
        // Call API to get resume and cover letter
        const result = await submitJobApplication(jobApplicationData);
        
        if (result.success) {
          console.log('✅ Documents generated successfully!');
          console.log('📄 Resume URL:', result.resume);
          console.log('📝 Cover Letter URL:', result.cover_letter);
          
          // Update jobgen_job_status to "Saved" (job application started)
          const currentJobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
          if (currentJobId) {
            console.log('💾 [DOCUMENTS] Job application API called - updating status to "Saved"...');
            try {
              const matchStorageKey = `seek_job_match_${currentJobId}`;
              const matchResult = await chrome.storage.local.get([matchStorageKey]);
              
              if (matchResult[matchStorageKey]) {
                const currentStatus = matchResult[matchStorageKey].jobgen_job_status;
                
                // Only update to "Saved" if not already "Applied"
                if (currentStatus !== "Applied") {
                  const updatedMatchData = {
                    ...matchResult[matchStorageKey],
                    jobgen_job_status: "Saved"
                  };
                  await chrome.storage.local.set({ [matchStorageKey]: updatedMatchData });
                  console.log(`✅ [DOCUMENTS] Updated jobgen_job_status to "Saved" for job ${currentJobId}`);
                } else {
                  console.log(`ℹ️ [DOCUMENTS] Job ${currentJobId} already "Applied", keeping status`);
                }
              }
            } catch (error) {
              console.error('❌ [DOCUMENTS] Error updating jobgen_job_status:', error);
            }
          }
          
          // Store URLs for later use
          window.seekDocuments = {
            resume_url: result.resume,
            cover_letter_url: result.cover_letter,
            job_id: result.job_id
          };
          
          // Now handle the actual document upload
          updateProgress(currentPage, 'filling', { message: 'Preparing resume upload...' });
          await handleResumeUpload(result.resume);
          
          updateProgress(currentPage, 'filling', { message: 'Preparing cover letter upload...' });
          await handleCoverLetterUpload(result.cover_letter);
          
          // Wait for any loading indicators to disappear before declaring success
          updateProgress(currentPage, 'filling', { message: 'Finalizing upload...' });
          await waitForUploadCompletion();
          
          // Mark as finished
          updateProgress(currentPage, 'finished');
          
          console.log('📄 Documents uploaded successfully!');
          
          // Auto-click next in apply mode, manual in autofill mode
          if (shouldAutoClickNext()) {
            console.log('🤖 Apply mode - auto-clicking Next');
            const { clickNextButton } = await import('../utils/seekHelpers.js');
            await clickNextButton();
          } else {
            console.log('✅ Autofill mode - waiting for user to click Next');
          }
        } else {
          console.error('❌ Failed to generate documents:', result.error);
          
          // Handle specific errors
          if (result.error === 'JOB_ALREADY_APPLIED') {
            errorProgress('Job already applied to. Documents may already exist.');
          } else if (result.error === 'TOKEN_INVALID') {
            errorProgress('Authentication issue. Please login to candidates.jobgen.ai');
          } else {
            errorProgress(`Failed to generate documents: ${result.error}`);
          }
        }
        
      } catch (error) {
        console.error('❌ Error in document generation:', error);
        errorProgress(`An error occurred: ${error.message}`);
      }
    }
    else if (currentPage == "Answer employer questions") {
      // CRITICAL: Validate job ID matches between storage and current URL
      const jobIdMatch = await validateJobIdMatch();
      if (!jobIdMatch) {
        console.log('❌ Job ID mismatch - this is not the correct application tab');
        errorProgress('Job ID mismatch - this autofill is for a different job');
        return;
      }
      
      console.log('Answer employer questions page detected');
      
      // Wait a moment to ensure page has fully transitioned
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Double-check we're on application page
      const hasStepIndicator2 = document.querySelector('[aria-current="step"]');
      if (!hasStepIndicator2) {
        console.log('🚫 No step indicator found - not on application page yet, skipping');
        return;
      }
      
      // Start progress tracking
      startProgress('autofill', currentPage, 'filling');
      
      try {
        const form = document.getElementsByTagName('form')[0].children[0];
        await handleQuestionAnswering(form);
      
        updateProgress(currentPage, 'finished');
        
        // Auto-click next in apply mode, manual in autofill mode
        if (shouldAutoClickNext()) {
          console.log('🤖 Apply mode - auto-clicking Next');
          const { clickNextButton } = await import('../utils/seekHelpers.js');
          await clickNextButton();
        } else {
          console.log('✅ Autofill mode - waiting for user to click Next');
        }
      } catch (error) {
        console.error('❌ SEEK question answering error:', error);
        errorProgress(`An error occurred while answering questions: ${error.message}`);
      }
    }
    else if (currentPage == "Update SEEK Profile") {
      // CRITICAL: Validate job ID matches between storage and current URL
      const jobIdMatch = await validateJobIdMatch();
      if (!jobIdMatch) {
        console.log('❌ Job ID mismatch - this is not the correct application tab');
        errorProgress('Job ID mismatch - this autofill is for a different job');
        return;
      }

      console.log('Update SEEK Profile page detected');

      // Wait a moment to ensure page has fully transitioned
      await new Promise(resolve => setTimeout(resolve, 500));

      // Double-check we're on application page
      const hasStepIndicator3 = document.querySelector('[aria-current="step"]');
      if (!hasStepIndicator3) {
        console.log('🚫 No step indicator found - not on application page yet, skipping');
        return;
      }

      startProgress('autofill', currentPage, 'filling');

      // In apply mode, attempt to remove stale career entries from the profile.
      // "Found in resumé" suggestion cards (added by SEEK from the uploaded PDF)
      // do NOT have delete controls — skip them to avoid false errors.
      if (shouldAutoClickNext()) {
        try {
          const { getSeekProfileCareerCards, deleteSeekCareerCard } = await import('../utils/seekHelpers.js');
          const cards = getSeekProfileCareerCards();
          const failures = [];

          for (const entry of cards) {
            updateProgress(currentPage, 'filling', { message: 'Removing stale career role…' });
            const result = await deleteSeekCareerCard(entry);
            if (!result.deleted && result.message) {
              console.warn('⚠️ Career deletion issue:', result.message);
              failures.push(result.message);
            }
          }

          if (failures.length > 0) {
            errorProgress(`Please delete manually before continuing: ${failures.join('; ')}`);
            return;
          }
        } catch (err) {
          console.error('❌ Career history cleanup error:', err);
          throw err;
        }
      }

      updateProgress(currentPage, 'finished');

      // Auto-click next in apply mode, manual in autofill mode
      if (shouldAutoClickNext()) {
        console.log('🤖 Apply mode - auto-clicking Next');
        const { clickNextButton } = await import('../utils/seekHelpers.js');
        await clickNextButton();
      } else {
        console.log('✅ Autofill mode - waiting for user to click Next');
      }
    }
    else if (currentPage == "Review and submit") {
      // CRITICAL: Validate job ID matches between storage and current URL
      const jobIdMatch = await validateJobIdMatch();
      if (!jobIdMatch) {
        console.log('❌ Job ID mismatch - this is not the correct application tab');
        errorProgress('Job ID mismatch - this autofill is for a different job');
        return;
      }
      console.log('Review and submit page detected');
      
      // Wait a moment to ensure page has fully transitioned
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Double-check we're on application page
      const hasStepIndicator4 = document.querySelector('[aria-current="step"]');
      if (!hasStepIndicator4) {
        console.log('🚫 No step indicator found - not on application page yet, skipping');
        return;
      }
      
      // Start progress tracking
      startProgress('autofill', currentPage, 'filling');
      
      // Manual autofill stops at review. Submission is an explicit action in
      // the progress panel, which waits for confirmation from SEEK.
      updateProgress(currentPage, 'finished', {
        message: 'Review your application, then click Submit when ready.'
      });
    }
    else {
      console.log('🎯 No apply button found and no recognized application page');
    }

  } catch (error) {
    console.log('🎯 Error in autofillSeek:', error);
    errorProgress(error instanceof FlowStop ? error.message : 'Autofill stopped. Review this step before continuing.');
  } finally {
    // Always clear the flag when function completes
    window.seekAutofillInProgress = false;
  }
}

// === JOB ID VALIDATION ===
async function validateJobIdMatch() {
  try {
    // Extract job ID from current application URL first
    const currentUrl = window.location.href;
    console.log('🔍 Current URL:', currentUrl);
    
    const urlMatch = currentUrl.match(/\/job\/(\d+)/);
    const currentJobId = urlMatch ? urlMatch[1] : null;
    
    if (!currentJobId) {
      console.log('⚠️ Could not extract job ID from current URL');
      return false;
    }
    
    console.log('🔍 Current page job ID:', currentJobId);
    
    // Try new storage system first (seek_job_${jobId})
    const newStorageKey = `seek_job_${currentJobId}`;
    const newResult = await chrome.storage.local.get([newStorageKey]);
    const newStoredJob = newResult[newStorageKey];
    
    if (newStoredJob) {
      console.log('✅ Found job data in new storage system');
      console.log('✅ Job ID validation passed - correct application tab');
      return true;
    }
    
    // Fallback to old storage system (current_seek_job)
    const oldResult = await chrome.storage.local.get(['current_seek_job']);
    const oldStoredJob = oldResult.current_seek_job;
    
    if (!oldStoredJob || !oldStoredJob.job_url_id) {
      console.log('⚠️ No stored job ID found in either storage system');
      return false;
    }
    
    console.log('🔍 Found job in old storage system, job ID:', oldStoredJob.job_url_id);
    
    // Compare job IDs
    const idsMatch = oldStoredJob.job_url_id === currentJobId;
    
    if (idsMatch) {
      console.log('✅ Job ID validation passed - correct application tab');
      return true;
    } else {
      console.log(`❌ Job ID mismatch! Stored: ${oldStoredJob.job_url_id}, Current: ${currentJobId}`);
      console.log('🚫 This autofill is for a different job - skipping to prevent wrong application');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error validating job ID:', error);
    return false;
  }
}

// All helper functions moved to seekHelpers.js for reuse