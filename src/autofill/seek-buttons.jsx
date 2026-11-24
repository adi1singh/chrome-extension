import React from 'react';
import { createRoot } from 'react-dom/client';
import ActionButtons from '../components/ActionButtons.jsx';
import { invokeActionButton } from '../utils/actionButtonsBridge.js';

const INJECT_ID = 'jobgen-seek-action-buttons';
const JOBGEN_ACTION_ROOT_ATTR = 'data-jobgen-seek-buttons';

let containerRef = null;
let rootRef = null;
let mountedTo = null;

// Check if we're on job detail page (not just listing/cards)
function isJobDetailPage() {
  // Job detail page has specific elements that job cards don't have
  const hasJobDescription = document.querySelector('[data-automation="jobAdDetails"]');
  const hasEmployerQuestions = document.querySelector('h2')?.textContent?.includes('Employer questions');
  const hasApplyButton = document.querySelector('[data-automation="job-detail-apply"]');
  
  // Must have job description section (only on detail page)
  return !!(hasJobDescription || (hasEmployerQuestions && hasApplyButton));
}

// Check if this is an external apply job (not Quick apply)
function isExternalApply() {
  const applyButton = document.querySelector('[data-automation="job-detail-apply"]');
  if (!applyButton) return false;
  
  const buttonText = applyButton.textContent?.trim() || '';
  // External apply if button says "Apply" but NOT "Quick apply"
  const isExternal = buttonText.includes('Apply') && !buttonText.includes('Quick');
  
  return isExternal;
}

// Find the Save button on Seek job detail page ONLY
function findSaveButton() {
  // Only look for Save button on job detail page, not job cards
  if (!isJobDetailPage()) {
    return null;
  }
  
  // Job detail page has data-testid="jdv-savedjob"
  const saveButton = document.querySelector('button[data-testid="jdv-savedjob"]');
  
  if (saveButton) {
    console.log('✅ [SEEK_BUTTONS] Found Save button on job detail page');
  }
  
  return saveButton;
}

// Find the container where we should inject our buttons (next to Save button)
function findHostContainer(saveButton) {
  if (!saveButton) return null;
  
  // The Save button parent element is where we'll inject our buttons
  // Structure: <div class="_1w86aev0 _143nxgx50..."><button data-testid="jdv-savedjob">Save</button></div>
  const parent = saveButton.parentElement;
  
  if (parent) {
    console.log('✅ [SEEK_BUTTONS] Found parent container for Save button');
    return parent;
  }
  
  console.warn('⚠️ [SEEK_BUTTONS] Could not find parent element for Save button');
  return null;
}

// Unmount and clean up
function unmount() {
  if (rootRef) {
    try {
      rootRef.unmount();
    } catch (error) {
      console.warn('⚠️ Error unmounting Seek action buttons:', error);
    }
    rootRef = null;
  }
  
  if (containerRef?.isConnected) {
    containerRef.remove();
  }
  
  containerRef = null;
  mountedTo = null;
}

// Render the action buttons
function renderButtons() {
  console.log('🔍 [SEEK_BUTTONS] renderButtons() called');
  
  // Check if we're on job detail page
  if (!isJobDetailPage()) {
    console.log('⏸ [SEEK_BUTTONS] Not on job detail page, skipping injection');
    unmount();
    return;
  }
  
  console.log('✅ [SEEK_BUTTONS] On job detail page');
  
  // Check if external apply - don't inject buttons for external jobs
  if (isExternalApply()) {
    console.log('🚫 [SEEK_BUTTONS] External apply job - not injecting buttons');
    unmount();
    return;
  }
  
  console.log('✅ [SEEK_BUTTONS] Quick apply job detected');
  
  const saveBtn = findSaveButton();
  
  if (!saveBtn) {
    console.log('⚠️ [SEEK_BUTTONS] Save button not found on detail page');
    unmount();
    return;
  }
  
  console.log('✅ [SEEK_BUTTONS] Save button found');
  
  const host = findHostContainer(saveBtn);
  
  if (!host) {
    console.log('⚠️ [SEEK_BUTTONS] Host container not found');
    unmount();
    return;
  }
  
  console.log('✅ [SEEK_BUTTONS] Host container found');
  
  // If already mounted to this container, skip
  if (mountedTo === host && containerRef?.isConnected) {
    // console.log('✓ [SEEK_BUTTONS] Already mounted to this container');
    return;
  }
  
  // Clean up old mount
  unmount();
  
  // Create new container that matches Seek's flex item styling
  containerRef = document.createElement('div');
  containerRef.id = INJECT_ID;
  containerRef.setAttribute(JOBGEN_ACTION_ROOT_ATTR, 'true');
  
  // Add Seek's button wrapper classes to match native styling
  containerRef.className = '_1w86aev0 _143nxgx50 _143nxgxs _143nxgxi0 _143nxgxi4 _143nxgxb4 _143nxgxbd';
  
  // Match Seek's button container styling with proper vertical centering
  containerRef.style.cssText = `
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 auto !important;
    flex-direction: row !important;
    flex-shrink: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    vertical-align: middle !important;
  `;
  
  // Insert after the Save button's parent div
  saveBtn.parentElement.insertAdjacentElement('afterend', containerRef);
  
  console.log('✅ [SEEK_BUTTONS] Injecting JobGen action buttons');
  
  // Add style override for Seek to ensure proper vertical alignment
  const styleId = 'jobgen-seek-alignment-fix';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #${INJECT_ID} .jg-actions {
        display: inline-flex !important;
        vertical-align: middle !important;
        align-items: center !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      #${INJECT_ID} .jg-actions .jg-container {
        margin: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Get the height of the Save button to match it
  let buttonHeight = 40; // default
  try {
    const saveButtonStyles = window.getComputedStyle(saveBtn);
    const computedHeight = parseFloat(saveButtonStyles.height);
    if (computedHeight > 0) {
      buttonHeight = Math.round(computedHeight);
      console.log(`📏 [SEEK_BUTTONS] Detected Save button height: ${buttonHeight}px`);
    }
  } catch (error) {
    console.warn('⚠️ [SEEK_BUTTONS] Could not detect Save button height, using default:', error);
  }
  
  // Get current job ID and status
  const getCurrentJobStatus = async () => {
    try {
      const result = await chrome.storage.local.get(['current_listing_job_id']);
      const currentJobId = result.current_listing_job_id;
      
      if (!currentJobId) {
        console.log('⚠️ [SEEK_BUTTONS] No current_listing_job_id found');
        return { jobId: null, status: null, hasActiveFlow: false };
      }
      
      // Get job status from seek_job_match_{jobId}
      const matchKey = `seek_job_match_${currentJobId}`;
      const matchResult = await chrome.storage.local.get([matchKey]);
      const matchData = matchResult[matchKey];
      const jobStatus = matchData?.jobgen_job_status;
      
      console.log(`📊 [SEEK_BUTTONS] Job ${currentJobId} match data:`, matchData);
      console.log(`📊 [SEEK_BUTTONS] Job ${currentJobId} status: "${jobStatus}" (type: ${typeof jobStatus})`);
      
      // Check if there's an active flow
      const flowKey = `seek_flow_${currentJobId}`;
      const flowResult = await chrome.storage.local.get([flowKey]);
      const hasActiveFlow = !!flowResult[flowKey];
      
      console.log(`📊 [SEEK_BUTTONS] Job ${currentJobId} hasActiveFlow: ${hasActiveFlow}`);
      
      // Return status as-is (could be undefined, "None", "Saved", "Applied")
      return { jobId: currentJobId, status: jobStatus, hasActiveFlow };
    } catch (error) {
      console.error('❌ [SEEK_BUTTONS] Error getting job status:', error);
      return { jobId: null, status: null, hasActiveFlow: false };
    }
  };
  
  // Action handler
  const onAction = async (action) => {
    console.log(`🎯 [SEEK_BUTTONS] Action triggered: ${action}`);
    
    // Try to invoke registered handler from JobContainer
    if (invokeActionButton(action)) {
      console.log(`✅ [SEEK_BUTTONS] Handler invoked for ${action}`);
      return;
    }
    
    console.warn(`⚠️ [SEEK_BUTTONS] No handler registered for ${action}`);
  };
  
  // Get initial status and render
  getCurrentJobStatus().then(({ jobId, status, hasActiveFlow }) => {
    console.log(`📊 [SEEK_BUTTONS] Initial render - Job ${jobId} status: ${status}, hasActiveFlow: ${hasActiveFlow}`);
    
    // Store the current job ID to track which job these buttons are for
    let buttonJobId = jobId;
    
    // Create React root and render
    rootRef = createRoot(containerRef);
    rootRef.render(
      <ActionButtons
        onAction={onAction}
        onApply={() => onAction('apply')}
        platformKey="seek"
        customHeight={buttonHeight}
        currentJobId={jobId}
        jobStatus={status}
        hasActiveFlow={hasActiveFlow}
      />
    );
    
    // Listen for storage changes to update status
    const handleStorageChange = async (changes, area) => {
      if (area !== 'local') return;
      
      // Get the CURRENT job being viewed
      const currentJobId = (await chrome.storage.local.get(['current_listing_job_id'])).current_listing_job_id;
      if (!currentJobId) return;
      
      // If user switched to a different job, update our tracked ID and re-render
      if (currentJobId !== buttonJobId) {
        console.log(`🔄 [SEEK_BUTTONS] Job switched from ${buttonJobId} to ${currentJobId}`);
        buttonJobId = currentJobId;
        const newStatus = await getCurrentJobStatus();
        
        rootRef.render(
          <ActionButtons
            onAction={onAction}
            onApply={() => onAction('apply')}
            platformKey="seek"
            customHeight={buttonHeight}
            currentJobId={newStatus.jobId}
            jobStatus={newStatus.status}
            hasActiveFlow={newStatus.hasActiveFlow}
          />
        );
        return;
      }
      
      const matchKey = `seek_job_match_${currentJobId}`;
      const flowKey = `seek_flow_${currentJobId}`;
      
      // Re-render ONLY if status or flow changed for THIS specific job
      if (changes[matchKey] || changes[flowKey]) {
        const newStatus = await getCurrentJobStatus();
        console.log(`🔄 [SEEK_BUTTONS] Job ${currentJobId} status updated: ${newStatus.status}, hasActiveFlow: ${newStatus.hasActiveFlow}`);
        
        rootRef.render(
          <ActionButtons
            onAction={onAction}
            onApply={() => onAction('apply')}
            platformKey="seek"
            customHeight={buttonHeight}
            currentJobId={newStatus.jobId}
            jobStatus={newStatus.status}
            hasActiveFlow={newStatus.hasActiveFlow}
          />
        );
      }
      
      // Also check if current_listing_job_id changed (user switched jobs)
      if (changes['current_listing_job_id']) {
        const newCurrentJobId = changes['current_listing_job_id'].newValue;
        if (newCurrentJobId && newCurrentJobId !== buttonJobId) {
          console.log(`🔄 [SEEK_BUTTONS] current_listing_job_id changed to ${newCurrentJobId}`);
          buttonJobId = newCurrentJobId;
          const newStatus = await getCurrentJobStatus();
          
          rootRef.render(
            <ActionButtons
              onAction={onAction}
              onApply={() => onAction('apply')}
              platformKey="seek"
              customHeight={buttonHeight}
              currentJobId={newStatus.jobId}
              jobStatus={newStatus.status}
              hasActiveFlow={newStatus.hasActiveFlow}
            />
          );
        }
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
  });
  
  mountedTo = host;
  console.log('✅ [SEEK_BUTTONS] Action buttons setup complete');
}

// Debounced re-evaluation
let rafId = null;
function scheduleRender() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(renderButtons);
}

// Main setup function - call this to initialize
export function setupSeekJobGenButtons() {
  console.log('🔧 [SEEK_BUTTONS] Setting up Seek JobGen action buttons...');
  
  // Initial render
  scheduleRender();
  
  // Watch for DOM changes
  const observer = new MutationObserver(() => {
    scheduleRender();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Re-evaluate on URL changes (for SPA navigation)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('🔄 [SEEK_BUTTONS] URL changed, re-evaluating...');
      scheduleRender();
    }
  }, 1000);
  
  console.log('✅ [SEEK_BUTTONS] Setup complete');
}

// Clean up function
export function removeSeekJobGenButtons() {
  unmount();
  console.log('🧹 [SEEK_BUTTONS] Buttons removed');
}

