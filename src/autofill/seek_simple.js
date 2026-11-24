import { submitSeekApplication, hasSeekSubmissionConfirmation } from '../utils/seekSubmission.js';
// Clean, Simple Seek Continuous Autofill
// Minimal complexity, maximum reliability

import { createProgressEmitters } from '../utils/progressBridge.js';
import {
  handleResumeUpload,
  handleCoverLetterUpload,
  waitForUploadCompletion,
  handleQuestionAnswering
} from '../utils/seekHelpers.js';
import ResumeManager from '../utils/resumeManager.js';

const PROGRESS_SITE = 'seek';
const baseEmitters = createProgressEmitters(PROGRESS_SITE);

// Track current mode for auto-navigation decisions
let currentFlowMode = 'autofill';

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

// === JOB-SPECIFIC STATE MANAGEMENT ===
// No global state - each job manages its own flow state in storage
let currentlyProcessing = false;
let lastProcessedPage = null;
let lastProcessedTime = 0;

// === PAGE DETECTION ===
function detectCurrentPage() {
  console.log('🔍 [DETECT_PAGE] detectCurrentPage() called');
  console.log('🔍 [DETECT_PAGE] URL:', window.location.href);
  
  // Success page
  if (document.querySelector('#applicationSent') || 
      document.querySelector('h1')?.textContent?.includes('Good luck')) {
    console.log('✅ [DETECT_PAGE] Detected: success');
    return 'success';
  }

  // Step-based pages (application flow pages)
  const stepElement = document.querySelector('[aria-current="step"]');
  if (stepElement) {
    const stepText = stepElement.textContent.trim();
    console.log('🔍 [DETECT_PAGE] Step element found:', stepText);
    if (stepText.includes('Choose documents')) return 'documents';
    if (stepText.includes('Answer employer questions')) return 'questions';
    if (stepText.includes('Update SEEK Profile')) return 'profile';
    if (stepText.includes('Review and submit')) return 'review';
  }

  // Job listing page - check if we're on a job URL OR a page with job cards
  const urlMatch = window.location.href.match(/\/job\/\d+/);
  const jobLinkElements = document.querySelectorAll('[data-automation*="jobLink"]');
  const jobHrefElements = document.querySelectorAll('a[href*="/job/"]');
  const hasJobCards = jobLinkElements.length > 0 || jobHrefElements.length > 0;
  
  console.log('🔍 [DETECT_PAGE] URL has /job/ID:', !!urlMatch);
  console.log('🔍 [DETECT_PAGE] Has job cards with data-automation:', jobLinkElements.length);
  console.log('🔍 [DETECT_PAGE] Has job href links:', jobHrefElements.length);
  console.log('🔍 [DETECT_PAGE] Has job cards (total):', hasJobCards);
  
  if ((urlMatch || hasJobCards) && !stepElement) {
    // We're on a job page (/job/{id}) OR a page with job cards (search results, homepage)
    // AND NOT in application flow (no step indicator)
    console.log('✅ [DETECT_PAGE] Detected: job_listing');
    return 'job_listing';
  }

  console.log('❌ [DETECT_PAGE] Detected: unknown');
  return 'unknown';
}

// === HELPER FUNCTIONS ===
async function validateJobIdMatch() {
  try {
    const currentUrl = window.location.href;
    console.log('🔍 Current URL:', currentUrl);

    const urlMatch = currentUrl.match(/\/job\/(\d+)/);
    const currentJobId = urlMatch ? urlMatch[1] : null;

    if (!currentJobId) {
      console.log('⚠️ Could not extract job ID from current URL');
      return false;
    }

    console.log('🔍 Current page job ID:', currentJobId);

    // Check if we have a stored job for this ID
    const jobInfoKey = `seek_job_${currentJobId}`;
    const result = await chrome.storage.local.get([jobInfoKey]);
    const storedJob = result[jobInfoKey];

    if (!storedJob) {
      console.log(`⚠️ No stored job info found for job ${currentJobId}`);
      return false;
    }

    console.log('✅ Job ID validation passed - correct application tab');
    return true;

  } catch (error) {
    console.error('❌ Error validating job ID:', error);
    return false;
  }
}

// Use the centralized close function from progressUtils
// function closeProgressBar() is now replaced by closeAutofillProgress() import

// === JOB VALIDATION ===
async function validateAndGetJobInfo() {
  try {
    // Extract job ID - use DOM for listing pages, URL for application pages
    let currentJobId = null;
    
    const currentPage = detectCurrentPage();
    
    if (currentPage === 'job_listing') {
      // Listing page: Extract from DOM
      const { SeekExtractor } = await import('../utils/siteExtractors.js');
      currentJobId = SeekExtractor.getCurrentJobIdentifier();
    } else {
      // Application page: Extract from URL path
      const pathMatch = window.location.href.match(/\/job\/(\d+)/);
      currentJobId = pathMatch ? pathMatch[1] : null;
    }
    
    if (!currentJobId) {
      console.log('⚠️ Could not extract job ID from current page:', window.location.href);
      return null;
    }
    
    console.log(`🔍 Current job ID: ${currentJobId}`);
    
    // Get job info for this specific job ID
    const storageKey = `seek_job_${currentJobId}`;
    const result = await chrome.storage.local.get([storageKey]);
    const jobInfo = result[storageKey];
    
    if (!jobInfo) {
      console.log(`⚠️ No stored job info found for job ${currentJobId}`);
      return null;
    }
    
    console.log(`✅ Found job info for job ${currentJobId}:`, jobInfo);
    return jobInfo;
  } catch (error) {
    console.error('❌ Error getting job info:', error);
    return null;
  }
}

// === MAIN AUTOFILL FUNCTION ===
export async function autofillSeekSimple() {
  console.log('='.repeat(80));
  console.log('🔄 [APPLY_FLOW] Seek Simple Autofill called');
  console.log('🔍 [APPLY_FLOW] Current URL:', window.location.href);
  console.log('🔍 [APPLY_FLOW] currentlyProcessing:', currentlyProcessing);

  // Simple duplicate prevention
  if (currentlyProcessing) {
    console.log('⚠️ [APPLY_FLOW] Already processing, skipping');
    return;
  }

  currentlyProcessing = true;
  console.log('🔒 [APPLY_FLOW] Processing started');

  try {
    const currentPage = detectCurrentPage();
    console.log('📍 [APPLY_FLOW] detectCurrentPage() returned:', currentPage);

    // Handle job listing page - start flow for specific job
    if (currentPage === 'job_listing') {
      console.log('🚀 [APPLY_FLOW] Job listing detected, calling handleJobListing()');
      await handleJobListing();
      console.log('✅ [APPLY_FLOW] handleJobListing() completed');
      return;
    }
    
    console.log('⚠️ [APPLY_FLOW] Not on job_listing page, currentPage:', currentPage);

    // Handle application pages - check if flow is active for this specific job
    const urlMatch = window.location.href.match(/\/job\/(\d+)/);
    const currentJobId = urlMatch ? urlMatch[1] : null;
    
    if (!currentJobId) {
      console.log('❌ Could not extract job ID from URL');
      return;
    }
    
    let flowState = await isFlowActiveForJob(currentJobId);
    
    // If no active flow but we're on a form page, check if job info exists first
    if (!flowState && (currentPage === 'documents' || currentPage === 'questions' || currentPage === 'profile' || currentPage === 'review')) {
      console.log(`⚠️ [APPLY_FLOW] No active flow for job ${currentJobId} on ${currentPage} page`);
      
      // Check if job info exists
      const jobInfoKey = `seek_job_${currentJobId}`;
      const jobInfoCheck = await chrome.storage.local.get([jobInfoKey]);
      
      if (!jobInfoCheck[jobInfoKey]) {
        console.error(`❌ [APPLY_FLOW] Job info not found in storage for job ${currentJobId}`);
        alert(`⚠️ Job information not found!\n\nPlease go back to the job listing page and start the application from there.\n\nThis ensures all job details are properly loaded.`);
        return;
      }
      
      console.log(`🔧 [APPLY_FLOW] Job info exists, creating flow with mode='apply' and starting process...`);
      
      // Create flow
      const flowKey = `seek_flow_${currentJobId}`;
      await chrome.storage.local.set({
        [flowKey]: { active: true, startTime: Date.now(), jobId: currentJobId, mode: 'apply' }
      });
      
      console.log(`✅ [APPLY_FLOW] Flow created, continuing to process page...`);
      flowState = await isFlowActiveForJob(currentJobId);
    }
    
    if (!flowState) {
      console.log(`❌ No active flow found for job ${currentJobId}`);
      return;
    }

    // Set the mode from flow state
    if (flowState.mode) {
      currentFlowMode = flowState.mode;
      console.log(`📍 Flow mode for job ${currentJobId}: ${currentFlowMode}`);
    }

    // Get job info for this specific job (validates job ID automatically)
    const jobInfo = await validateAndGetJobInfo();
    if (!jobInfo) {
      console.log('❌ No job info found for this tab');
      console.log('⚠️ Please go back to the job listing page and click Apply/Autofill from there');
      alert('⚠️ Job information not found!\n\nPlease go back to the job listing page and click Apply/Autofill to start the process properly.');
      return;
    }

    // Prevent race conditions - check if we just processed this page
    const now = Date.now();
    if (lastProcessedPage === currentPage && (now - lastProcessedTime) < 10000) {
      console.log(`⚠️ Page "${currentPage}" already processed recently (${Math.round((now - lastProcessedTime)/1000)}s ago), skipping`);
      return;
    }

    console.log('✅ Proceeding to process page:', currentPage);
    
    // Mark page as being processed
    lastProcessedPage = currentPage;
    lastProcessedTime = now;

    // Process current page
    switch (currentPage) {
      case 'documents':
        console.log('🎯 Calling handleDocuments');
        await handleDocuments();
        break;
      case 'questions':
        console.log('🎯 Calling handleQuestions');
        await handleQuestions();
        break;
      case 'profile':
        console.log('🎯 Calling handleProfile');
        await handleProfile();
        break;
      case 'review':
        console.log('🎯 Calling handleReview');
        await handleReview();
        break;
      case 'success':
        console.log('🎯 Calling handleSuccess');
        await handleSuccess();
        break;
      default:
        console.log('🔍 Unknown page, waiting...');
    }

  } catch (error) {
    console.error('❌ Error in autofill:', error);
    errorProgress('The application stopped. Review this step before continuing.');
    const urlMatch = window.location.href.match(/\/job\/(\d+)/);
    const currentJobId = urlMatch ? urlMatch[1] : null;
    if (currentJobId) await endFlowForJob(currentJobId);
  } finally {
    currentlyProcessing = false;
    console.log('🔓 Processing complete');
  }
}

// === JOB-SPECIFIC FLOW FUNCTIONS ===
async function startFlowForJob(jobId, mode = 'autofill') {
  lastProcessedPage = null;
  lastProcessedTime = 0;
  
  // Check if mode was set in storage
  try {
    const result = await chrome.storage.local.get(['seek_flow_mode']);
    if (result.seek_flow_mode) {
      mode = result.seek_flow_mode;
      console.log(`📍 Using mode from storage: ${mode}`);
      // Clear it after reading
      await chrome.storage.local.remove(['seek_flow_mode']);
    }
  } catch (_e) {
    console.log('⚠️ Could not read flow mode from storage, using default:', mode);
  }
  
  currentFlowMode = mode; // Set the mode globally
  
  try {
    const flowKey = `seek_flow_${jobId}`;
    await chrome.storage.local.set({
      [flowKey]: {
        active: true,
        startTime: Date.now(),
        jobId: jobId,
        mode: mode // Store mode in flow state
      }
    });
    console.log(`🚀 Flow started for job ${jobId} in ${mode} mode`);
  } catch (error) {
    console.error('❌ Error saving flow state:', error);
  }
}

async function endFlowForJob(jobId) {
  console.log(`🏁 Ending flow for job ${jobId}`);
  
  currentlyProcessing = false;
  lastProcessedPage = null;
  lastProcessedTime = 0;
  
  try {
    const flowKey = `seek_flow_${jobId}`;
    await chrome.storage.local.remove([flowKey]);
    console.log(`✅ Flow ended for job ${jobId} - ready for next job`);
  } catch (error) {
    console.error('❌ Error cleaning up flow:', error);
  }
}

async function isFlowActiveForJob(jobId) {
  try {
    const flowKey = `seek_flow_${jobId}`;
    const result = await chrome.storage.local.get([flowKey]);
    const flow = result[flowKey];
    
    if (!flow || !flow.active) {
      return false;
    }
    
    // Check timeout (10 minutes max)
    const elapsed = Date.now() - flow.startTime;
    if (elapsed > 10 * 60 * 1000) {
      console.log(`⏰ Flow expired for job ${jobId}, cleaning up`);
      await endFlowForJob(jobId);
      return false;
    }
    
    return flow; // Return the flow object (includes mode)
  } catch (error) {
    console.error('❌ Error checking flow state:', error);
    return false;
  }
}

// === PAGE HANDLERS ===
async function handleJobListing() {
  console.log('🔵 [HANDLE_LISTING] handleJobListing() called');
  
  // ALWAYS get job ID from storage first
  console.log('🔍 [HANDLE_LISTING] Getting job ID from chrome.storage.local[current_listing_job_id]...');
  let jobId = null;
  try {
    const result = await chrome.storage.local.get(['current_listing_job_id']);
    jobId = result.current_listing_job_id;
    console.log('📦 [HANDLE_LISTING] Storage result:', result);
    
    if (jobId) {
      console.log(`✅ [HANDLE_LISTING] Got job ID from storage: ${jobId}`);
    } else {
      console.log('❌ [HANDLE_LISTING] current_listing_job_id not found in storage');
      console.log('🚫 [HANDLE_LISTING] No job selected - stopping');
      return;
    }
  } catch (error) {
    console.error('❌ [HANDLE_LISTING] Error getting job ID from storage:', error);
    console.log('🚫 [HANDLE_LISTING] Storage error - stopping');
    return;
  }
  
  // Check if apply button is already visible
  let applyButton = document.querySelector('[data-automation="job-detail-apply"]');
  console.log('🔍 [HANDLE_LISTING] Apply button found:', !!applyButton);
  
  // If apply button NOT visible, we need to find and open the correct job container
  if (!applyButton) {
    console.log('⚠️ [HANDLE_LISTING] Apply button not visible - need to find and open correct job container');
    
    // Open the job container for the correct job
    console.log(`🎯 [HANDLE_LISTING] Opening job container for ID: ${jobId}`);
    const { findAndClickJobCard } = await import('../utils/seekHelpers.js');
    const cardClicked = await findAndClickJobCard(jobId);
    console.log(`📊 [HANDLE_LISTING] findAndClickJobCard returned: ${cardClicked}`);
    
    if (!cardClicked) {
      console.log('❌ [HANDLE_LISTING] Could not find or click job card, or apply button did not appear');
      console.log('🚫 [HANDLE_LISTING] Stopping - job container not found');
      return;
    }
    
    // Get apply button after clicking card
    applyButton = document.querySelector('[data-automation="job-detail-apply"]');
    console.log('🔍 [HANDLE_LISTING] Apply button after clicking card:', !!applyButton);
    
    if (!applyButton) {
      console.log('❌ [HANDLE_LISTING] Apply button not found after clicking card');
      console.log('🚫 [HANDLE_LISTING] Stopping - apply button not found');
      return;
    }
  } else {
    console.log('✅ [HANDLE_LISTING] Apply button already visible');
  }

  const buttonText = applyButton.textContent.trim();
  console.log('🎯 [HANDLE_LISTING] Apply button text:', buttonText);

  if (buttonText.includes('Quick apply') || buttonText.includes('Quick Apply')) {
    console.log('✅ [HANDLE_LISTING] Quick Apply button detected');
    
    // Check if tailored resume mode is enabled
    const { ResumeManager } = await import('../utils/resumeManager.js');
    const isTailoredEnabled = await ResumeManager.isTailoredResumeEnabled();
    console.log(`🔍 [HANDLE_LISTING] Tailored mode enabled: ${isTailoredEnabled}`);
    
    if (isTailoredEnabled) {
      // TAILORED MODE: Only allow one application at a time
      const activeCount = await ResumeManager.getActiveApplicationCount();
      console.log(`🔍 [HANDLE_LISTING] Active applications count: ${activeCount}`);
      
      if (activeCount > 0) {
        console.log(`🚫 [HANDLE_LISTING] Tailored mode: Cannot start new application (${activeCount} already active)`);
        console.log(`🚫 [HANDLE_LISTING] Stopping - tailored mode blocked`);
        alert(`⚠️ Only one application allowed in tailored mode.\n\n${activeCount} application(s) currently active. Please complete or cancel them first.`);
        return;
      }
      console.log('✅ [HANDLE_LISTING] Tailored mode: No active applications, proceeding...');
    } else {
      console.log('✅ [HANDLE_LISTING] Shared mode: Multiple applications allowed');
    }
    
    // Check if job info exists in storage before creating flow
    const jobInfoKey = `seek_job_${jobId}`;
    const jobInfoCheck = await chrome.storage.local.get([jobInfoKey]);
    if (!jobInfoCheck[jobInfoKey]) {
      console.error(`❌ [HANDLE_LISTING] Job info not found in storage for job ${jobId}`);
      alert(`⚠️ Job information not found!\n\nThe job details for this position haven't been loaded yet. Please:\n1. Wait for the job details to fully load on the page\n2. Try clicking Apply again\n\nIf the issue persists, try refreshing the page.`);
      return;
    }
    console.log(`✅ [HANDLE_LISTING] Job info exists in storage for job ${jobId}`);
    
    // CRITICAL: Create flow BEFORE clicking button
    console.log(`🚀 [HANDLE_LISTING] Creating flow for job ${jobId} with mode='apply'`);
    await startFlowForJob(jobId, 'apply');
    console.log(`✅ [HANDLE_LISTING] Flow created`);
    
    // Verify flow was saved
    const flowKey = `seek_flow_${jobId}`;
    const verify = await chrome.storage.local.get([flowKey]);
    if (!verify[flowKey]) {
      console.error(`❌ [HANDLE_LISTING] Flow NOT in storage! Aborting.`);
      return;
    }
    console.log(`✅ [HANDLE_LISTING] VERIFIED: Flow in storage with mode: ${verify[flowKey].mode}`);
    
    // Click button (will open new tab on listing pages)
    console.log(`🖱️ [HANDLE_LISTING] Clicking apply button...`);
    applyButton.click();
    console.log(`✅ [HANDLE_LISTING] Button clicked`);
  } else {
    console.log('⚠️ [HANDLE_LISTING] External apply detected - not supported');
    console.log('🚫 [HANDLE_LISTING] Stopping - external apply');
  }
  
  console.log('🏁 [HANDLE_LISTING] handleJobListing() complete');
}

async function handleDocuments() {
  console.log('📄 Processing documents page');
  
  // Validate job ID match before processing
  const jobIdMatch = await validateJobIdMatch();
  if (!jobIdMatch) {
    console.log('🚫 Job ID mismatch - skipping autofill on this tab');
    return;
  }
  
  // Wait a moment to ensure page has fully transitioned to application page
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Double-check we're on application page, not listing page
  const hasStepIndicator = document.querySelector('[aria-current="step"]');
  if (!hasStepIndicator) {
    console.log('🚫 No step indicator found - not on application page yet, skipping');
    return;
  }
  
  startProgress(currentFlowMode, 'Choose documents', 'filling');

  try {
    // Get job info for this specific job ID
    const jobInfo = await validateAndGetJobInfo();
    
    if (!jobInfo) {
      console.warn('⚠️ No job info found for this job');
      errorProgress('No job information found for this job');
      const jobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
      if (jobId) await endFlowForJob(jobId);
      return;
    }
    
    console.log('📋 Using job info for documents:', jobInfo);

    const { submitJobApplication } = await import('../services/apiService.js');
    
    // Use clean URL format: https://au.seek.com/job/{jobId}
    const cleanJobUrl = `https://au.seek.com/job/${jobInfo.job_url_id}`;
    console.log(`📍 Using clean job URL for API: ${cleanJobUrl}`);
    
    const jobApplicationData = {
      job_url: cleanJobUrl,
      description: jobInfo.description,
      cover_letter: "yes",
      company: jobInfo.company,
      job_title: jobInfo.job_title,
      job_url_id: jobInfo.job_url_id,
      job_portal: jobInfo.job_portal || "SEEK"
    };

    updateProgress('Choose documents', 'filling', { message: 'Generating documents...' });
    const apiResult = await submitJobApplication(jobApplicationData);

    if (apiResult.success) {
      const currentJobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
      
      // Update jobgen_job_status to "Saved" (job application started)
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
      const isTailoredEnabled = await ResumeManager.isTailoredResumeEnabled(currentJobId);
      const activeCount = await ResumeManager.getActiveApplicationCount();
      
      console.log('📄 Resume strategy check:', {
        jobId: currentJobId,
        tailoredEnabled: isTailoredEnabled,
        activeCount: activeCount
      });

      if (isTailoredEnabled) {
        // TAILORED MODE: Each job uploads its own resume
        console.log('🎯 Tailored mode - uploading custom resume for job', currentJobId);
        updateProgress('Choose documents', 'filling', { message: 'Uploading tailored resume...' });
        await handleResumeUpload(apiResult.resume);

        updateProgress('Choose documents', 'filling', { message: 'Uploading cover letter...' });
        await handleCoverLetterUpload(apiResult.cover_letter);

        updateProgress('Choose documents', 'filling', { message: 'Finalizing...' });
        await waitForUploadCompletion();
        
      } else {
        // SHARED MODE: Queue-based resume management
        const resumeStatus = await ResumeManager.getResumeStatus();
        
        if (resumeStatus.state === 'not_started') {
          // FIRST APPLICATION: Handle full resume management
          console.log('📄 First application - handling resume management for job', currentJobId);
          await ResumeManager.setResumeStatus('processing', currentJobId);
          
          updateProgress('Choose documents', 'filling', { message: 'Managing resumes (first application)...' });
          await handleResumeUpload(apiResult.resume);
          
          // Note: Resume management will be marked as completed after this application clicks "next"
          console.log('✅ Resume uploaded by first application, will complete after next click');
          
        } else if (resumeStatus.state === 'processing') {
          // SUBSEQUENT APPLICATIONS: Wait for first to complete fully (with timeout)
          console.log(`⏳ Waiting for job ${resumeStatus.processingJobId} to complete resume management...`);
          updateProgress('Choose documents', 'filling', { message: `Waiting for job ${resumeStatus.processingJobId}...` });
          
          let completed = false;
          try {
            // Wait with a shorter timeout (30 seconds instead of 60)
            completed = await ResumeManager.waitForResumeCompletion(30000);
          } catch (waitError) {
            console.error('❌ Error during wait:', waitError);
            completed = false;
          }
          
          if (completed) {
            // Check if we already have a resume selected (to avoid infinite refresh)
            const resumeSelected = document.querySelector('select[data-testid="select-input"]')?.value;
            if (resumeSelected) {
              console.log('✅ Resume already selected, continuing without refresh');
              await ResumeManager.selectNewestResumeDirectly();
            } else {
              updateProgress('Choose documents', 'filling', { message: 'Refreshing to get updated resume list...' });
              await ResumeManager.refreshAndSelectNewestResume();
              console.log('✅ Page will refresh and continue automatically');
              return; // Exit here as page will reload
            }
          } else {
            // TIMEOUT or ERROR: First application took too long or failed
            console.log('⏰ Timeout/error waiting for first application - clearing stuck state and uploading own resume');
            
            // Clear the stuck resume status to unblock other applications
            await ResumeManager.clearResumeStatus();
            console.log('🧹 Cleared stuck resume status to unblock other applications');
            
            // Upload this job's own resume as recovery
            updateProgress('Choose documents', 'filling', { message: 'Uploading resume (recovery)...' });
            await handleResumeUpload(apiResult.resume);
          }
          
        } else if (resumeStatus.state === 'completed') {
          // RESUME READY: Check if resume already selected to avoid refresh loop
          const resumeSelected = document.querySelector('select[data-testid="select-input"]')?.value;
          if (resumeSelected) {
            console.log('✅ Resume already selected, continuing without refresh');
            await ResumeManager.selectNewestResumeDirectly();
          } else {
            console.log('📄 Resume management completed, refreshing to get latest list');
            updateProgress('Choose documents', 'filling', { message: 'Refreshing to get updated resume list...' });
            await ResumeManager.refreshAndSelectNewestResume();
            console.log('✅ Page will refresh and continue automatically');
            return; // Exit here as page will reload
          }
        }

        updateProgress('Choose documents', 'filling', { message: 'Uploading cover letter...' });
        await handleCoverLetterUpload(apiResult.cover_letter);

        updateProgress('Choose documents', 'filling', { message: 'Finalizing...' });
        await waitForUploadCompletion();
      }

      updateProgress('Choose documents', 'finished');

      // CRITICAL: Mark resume management as completed IMMEDIATELY to unblock other applications
      try {
        const resumeStatus = await ResumeManager.getResumeStatus();
        console.log('🔍 Current resume status:', resumeStatus);
        
        if (resumeStatus.state === 'processing' && resumeStatus.processingJobId === currentJobId) {
          await ResumeManager.setResumeStatus('completed', currentJobId);
          console.log(`✅ Resume management marked as COMPLETED by job ${currentJobId} - other applications can now proceed`);
        } else if (resumeStatus.state === 'processing') {
          console.log(`⚠️ Resume being processed by different job ${resumeStatus.processingJobId}`);
        }
      } catch (statusError) {
        console.error('❌ Error updating resume status:', statusError);
      }
      
      // Now handle next button click
      await new Promise(resolve => setTimeout(resolve, 1000));
      {
        // Auto-click next in apply mode, manual in autofill mode
        if (shouldAutoClickNext()) {
          console.log('🤖 Apply mode - auto-clicking Next');
          const { clickNextButton } = await import('../utils/seekHelpers.js');
          await clickNextButton();
        } else {
          console.log('✅ Autofill mode - first page filled, ending flow (user will manually continue if needed)');
          // End flow after first page in autofill mode
          await endFlowForJob(currentJobId);
          console.log('🏁 Autofill flow ended - user can manually click Next to continue');
        }
      }
    } else {
      errorProgress(`Failed: ${apiResult.error}`);
      const jobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
      if (jobId) await endFlowForJob(jobId);
    }
  } catch (error) {
    console.error('❌ Documents error:', error);
    errorProgress(`Error: ${error.message}`);
    
    // CRITICAL: Clear resume status if this job was processing it
    const jobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
    if (jobId) {
      try {
        const resumeStatus = await ResumeManager.getResumeStatus();
        if (resumeStatus.state === 'processing' && resumeStatus.processingJobId === jobId) {
          await ResumeManager.clearResumeStatus();
          console.log('🧹 Cleared stuck resume status due to error');
        }
      } catch (e) {
        console.error('❌ Error clearing resume status:', e);
      }
      
      await endFlowForJob(jobId);
    }
  }
}

async function handleQuestions() {
  console.log('❓ Processing questions page');
  
  // Validate job ID match before processing
  const jobIdMatch = await validateJobIdMatch();
  if (!jobIdMatch) {
    console.log('🚫 Job ID mismatch - skipping autofill on this tab');
    return;
  }
  
  // Wait a moment to ensure page has fully transitioned
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Double-check we're on application page
  const hasStepIndicator = document.querySelector('[aria-current="step"]');
  if (!hasStepIndicator) {
    console.log('🚫 No step indicator found - not on application page yet, skipping');
    return;
  }
  
  startProgress(currentFlowMode, 'Answer employer questions', 'filling');

  try {
    const form = document.getElementsByTagName('form')[0]?.children[0];
    if (!form) {
      console.error('❌ Form not found');
      errorProgress('Form not found');
      return;
    }

    await handleQuestionAnswering(form);
    
    updateProgress('Answer employer questions', 'finished');

    // Auto-click next in apply mode, manual in autofill mode
    if (shouldAutoClickNext()) {
      console.log('🤖 Apply mode - auto-clicking Next');
      await new Promise(resolve => setTimeout(resolve, 500));
      {
        const { clickNextButton } = await import('../utils/seekHelpers.js');
        await clickNextButton();
      }
    } else {
      console.log('✅ Autofill mode - waiting for user to click Next');
    }
  } catch (error) {
    console.error('❌ Questions error:', error);
    errorProgress(`Error: ${error.message}`);
    const jobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
    if (jobId) await endFlowForJob(jobId);
  }
}

async function handleProfile() {
  console.log('👤 Processing profile page');
  
  // Validate job ID match before processing
  const jobIdMatch = await validateJobIdMatch();
  if (!jobIdMatch) {
    console.log('🚫 Job ID mismatch - skipping autofill on this tab');
    return;
  }
  
  // Wait a moment to ensure page has fully transitioned
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Double-check we're on application page
  const hasStepIndicator = document.querySelector('[aria-current="step"]');
  if (!hasStepIndicator) {
    console.log('🚫 No step indicator found - not on application page yet, skipping');
    return;
  }
  
  startProgress(currentFlowMode, 'Update SEEK Profile', 'filling');

  // In apply mode, attempt to remove stale career entries from the SEEK profile.
  // "Found in resumé" suggestion cards (auto-detected by SEEK from the uploaded PDF)
  // do NOT have delete controls — they are filtered out to avoid false errors.
  if (shouldAutoClickNext()) {
    try {
      const { getSeekProfileCareerCards, deleteSeekCareerCard } = await import('../utils/seekHelpers.js');
      const cards = getSeekProfileCareerCards();
      const failures = [];

      for (const entry of cards) {
        updateProgress('Update SEEK Profile', 'filling', { message: 'Removing stale career role…' });
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

  updateProgress('Update SEEK Profile', 'finished');

  // Auto-click next in apply mode, manual in autofill mode
  if (shouldAutoClickNext()) {
    console.log('🤖 Apply mode - auto-clicking Next');
    const { clickNextButton } = await import('../utils/seekHelpers.js');
    await clickNextButton();
  } else {
    console.log('✅ Autofill mode - waiting for user to click Next');
  }
}

async function handleReview() {
  console.log('👀 Processing review page');
  
  // Validate job ID match before processing
  const jobIdMatch = await validateJobIdMatch();
  if (!jobIdMatch) {
    console.log('🚫 Job ID mismatch - skipping autofill on this tab');
    return;
  }
  
  // Wait a moment to ensure page has fully transitioned
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Double-check we're on application page
  const hasStepIndicator = document.querySelector('[aria-current="step"]');
  if (!hasStepIndicator) {
    console.log('🚫 No step indicator found - not on application page yet, skipping');
    return;
  }
  
  startProgress(currentFlowMode, 'Review and submit', 'filling');

  const submitButton = document.querySelector('button[data-testid="review-submit-application"]');
  
  if (submitButton) {
    console.log('🎯 Submit button found');
    
    if (!shouldAutoClickNext()) {
      updateProgress('Review and submit', 'finished');
      return;
    }
    updateProgress('Application', 'submitting', { message: 'Waiting for SEEK to confirm submission…' });
    try {
      await submitSeekApplication(submitButton);
      updateProgress('Application', 'submitted');
    } catch (error) {
      errorProgress(error.message);
      const jobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
      if (jobId) await endFlowForJob(jobId);
    }
  } else {
    console.log('⚠️ Submit button not found');
    errorProgress('Submit button not found');
    const jobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
    if (jobId) await endFlowForJob(jobId);
  }
}

async function handleSuccess() {
  console.log('🎉 Processing success page');

  const isSuccess = hasSeekSubmissionConfirmation();

  if (isSuccess) {
    console.log('✅ Success confirmed');
    updateProgress('Application', 'submitted');

    try {
      const { showSuccessPopup } = await import('../components/SuccessPopup.js');
      showSuccessPopup();
    } catch (error) {
      console.log('❌ Popup error:', error);
    }

    const jobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
    if (jobId) {
      // Submit successful application outcome to JobGen.AI
      try {
        const { submitJobApplicationOutcome } = await import('../services/apiService.js');
        
        // Use clean URL format
        const cleanJobUrl = `https://au.seek.com/job/${jobId}`;
        console.log(`📍 Using clean job URL for outcome API: ${cleanJobUrl}`);
        
        const outcomeResult = await submitJobApplicationOutcome({
          application_status: "Applied",
          job_id: `${jobId}`,
          job_portal: "SEEK",
          job_url: cleanJobUrl
        });
        
        if (outcomeResult && outcomeResult.success) {
          console.log('📊 Successfully submitted application outcome to JobGen.AI');
        } else {
          console.error('❌ Failed to submit application outcome:', outcomeResult?.error);
        }
      } catch (error) {
        console.error('❌ Error submitting application outcome:', error);
      }
      
      // Update jobgen_job_status to "Applied" in seek_job_match_{jobId}
      console.log('💾 [APPLY_SUCCESS] Updating jobgen_job_status to "Applied"...');
      try {
        const matchStorageKey = `seek_job_match_${jobId}`;
        const matchResult = await chrome.storage.local.get([matchStorageKey]);
        console.log('💾 [APPLY_SUCCESS] Match data:', matchResult[matchStorageKey]);
        
        if (matchResult[matchStorageKey]) {
          const updatedMatchData = {
            ...matchResult[matchStorageKey],
            jobgen_job_status: "Applied"
          };
          await chrome.storage.local.set({ [matchStorageKey]: updatedMatchData });
          console.log(`✅ [APPLY_SUCCESS] Updated jobgen_job_status to "Applied" for job ${jobId}`);
        } else {
          console.log(`⚠️ [APPLY_SUCCESS] No match data found for ${matchStorageKey}`);
        }
      } catch (error) {
        console.error('❌ [APPLY_SUCCESS] Error updating jobgen_job_status:', error);
      }
      
      // If this was the first application handling resume management, clear the status
      try {
        const { ResumeManager } = await import('../utils/resumeManager.js');
        const resumeStatus = await ResumeManager.getResumeStatus();
        if (resumeStatus.state === 'completed' && resumeStatus.processingJobId === jobId) {
          await ResumeManager.clearResumeStatus();
          console.log('🧹 Cleared resume management status after first application completed');
        }
      } catch (error) {
        console.error('❌ Error clearing resume status:', error);
      }
      
      await endFlowForJob(jobId);
      console.log(`🔄 Flow reset for job ${jobId} - ready for next job`);
    }
  }
}

// === SIMPLE MONITORING ===
export function startSimpleSeekMonitoring() {
  if (!window.location.href.includes('seek.com')) return;

  console.log('🔄 Starting simple Seek monitoring');

  // Check for continuation after refresh first
  setTimeout(async () => {
    try {
      const { ResumeManager } = await import('../utils/resumeManager.js');
      const continuation = await ResumeManager.checkForContinuation();
      
      if (continuation && continuation.shouldContinue) {
        console.log('🔄 Continuing autofill after refresh for job', continuation.jobId);
        // Continue the autofill process after resume selection
        setTimeout(() => autofillSeekSimple(), 1000);
        return;
      }
    } catch (error) {
      console.error('❌ Error checking for continuation:', error);
    }
  }, 1000);

  const monitor = setInterval(async () => {
    try {
      if (currentlyProcessing) {
        console.log('⚠️ Currently processing, monitor waiting...');
        return;
      }

      // Check if current page has an active flow for its job ID
      const urlMatch = window.location.href.match(/\/job\/(\d+)/);
      const currentJobId = urlMatch ? urlMatch[1] : null;
      
      if (currentJobId) {
        const isActive = await isFlowActiveForJob(currentJobId);
        
        if (isActive) {
          // Check if page changed since last monitor run
          const currentPage = detectCurrentPage();
          const pageChanged = (currentPage !== lastProcessedPage);
          
          if (pageChanged || !lastProcessedPage) {
            console.log(`🔍 Flow active for job ${currentJobId}, page changed to:`, currentPage, '(was:', lastProcessedPage, ')');
            await autofillSeekSimple();
          } else {
            console.log(`✅ Same page for job ${currentJobId}, waiting for navigation...`);
          }
        } else {
          // No active flow - wait for user to click Apply/Autofill button
          // Don't auto-trigger on listing pages - let user actions handle that
          const now = Date.now();
          if (!window.lastMonitorLog || (now - window.lastMonitorLog) > 10000) {
            console.log(`💤 No active flow for job ${currentJobId}, monitor idle`);
            window.lastMonitorLog = now;
          }
        }
      } else {
        // Not on a job page
        const now = Date.now();
        if (!window.lastMonitorLog || (now - window.lastMonitorLog) > 10000) {
          console.log('💤 Not on a job page, monitor idle');
          window.lastMonitorLog = now;
        }
      }
    } catch (error) {
      console.error('❌ Monitor error:', error);
      // Try to clean up current job flow if possible
      const urlMatch = window.location.href.match(/\/job\/(\d+)/);
      const currentJobId = urlMatch ? urlMatch[1] : null;
      if (currentJobId) {
        await endFlowForJob(currentJobId);
      }
    }
  }, 3000);

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    console.log('🧹 Page unloading - clearing monitor');
    clearInterval(monitor);
    
    const urlMatch = window.location.href.match(/\/job\/(\d+)/);
    const currentJobId = urlMatch ? urlMatch[1] : null;
    
    if (!currentJobId) return;
    
    // If on APPLY page → always delete flow (user closing/leaving application)
    if (window.location.href.includes('/apply')) {
      console.log(`🗑️ On apply page - deleting flow for job ${currentJobId}`);
      endFlowForJob(currentJobId).catch(console.error);
    }
    // If on LISTING/DETAIL page → keep flow (might be navigating to apply page)
    else {
      console.log(`✅ On listing page - preserving flow for job ${currentJobId}`);
    }
  });

  console.log('✅ Simple monitoring started (3s intervals)');
}

// === MANUAL RESET ===
export async function resetSeekFlow() {
  console.log('🔄 Manual reset for current job');
  
  const urlMatch = window.location.href.match(/\/job\/(\d+)/);
  const currentJobId = urlMatch ? urlMatch[1] : null;
  
  if (currentJobId) {
    await endFlowForJob(currentJobId);
    console.log(`✅ Reset complete for job ${currentJobId}`);
  } else {
    console.log('⚠️ No job ID found, cannot reset specific flow');
  }
}

// === RESET ALL APPLICATIONS ===
export async function resetAllSeekFlows() {
  console.log('🔄 Resetting all SEEK flows and resume management');
  
  try {
    // Clear all flow states and resume management
    const result = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(result).filter(key => 
      key.startsWith('seek_flow_') || 
      key === 'seek_shared_resume' ||
      key === 'seek_resume_status' ||
      key === 'seek_resume_lock' ||
      key.startsWith('seek_refresh_continue_')
    );
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log('✅ Cleared all flows and resume management:', keysToRemove);
    }
    
    // Also clear resume status using ResumeManager
    await ResumeManager.clearResumeStatus();
    
    // Clear global flags
    currentlyProcessing = false;
    lastProcessedPage = null;
    lastProcessedTime = 0;
    currentFlowMode = 'autofill';
    
    console.log('✅ All Seek flows and resume queue reset complete');
  } catch (error) {
    console.error('❌ Error resetting all flows:', error);
  }
}

// === DIAGNOSTIC TOOLS ===
export async function diagnoseSeekQueue() {
  console.log('🔍 === SEEK QUEUE DIAGNOSTIC ===');
  
  // Check resume queue
  await ResumeManager.diagnoseResumeQueue();
  
  // Check active flows
  try {
    const result = await chrome.storage.local.get(null);
    const activeFlows = Object.keys(result)
      .filter(key => key.startsWith('seek_flow_'))
      .map(key => ({
        jobId: result[key].jobId,
        mode: result[key].mode,
        active: result[key].active,
        age: Math.round((Date.now() - result[key].startTime) / 1000) + 's'
      }));
    
    console.log('  Active flows:', activeFlows);
    console.log('  Currently processing:', currentlyProcessing);
  } catch (error) {
    console.error('❌ Error checking flows:', error);
  }
  
  console.log('=== END DIAGNOSTIC ===');
}

// Expose diagnostic tools globally for debugging
if (typeof window !== 'undefined') {
  window.diagnoseSeekQueue = diagnoseSeekQueue;
  window.resetAllSeekFlows = resetAllSeekFlows;
  window.clearResumeStatus = () => ResumeManager.clearResumeStatus();
}