// Resume Manager
// Queue-based resume management for multiple applications

export class ResumeManager {
  static lockKey = 'seek_resume_lock';
  static statusKey = 'seek_resume_status';

  // Check if resume management is in progress or completed
  static async getResumeStatus() {
    try {
      const result = await chrome.storage.local.get([this.statusKey]);
      const status = result[this.statusKey];
      
      if (!status) {
        return { state: 'not_started', processingJobId: null };
      }
      
      // Check if status is stale (2 minutes for processing, 5 minutes for completed)
      const elapsed = Date.now() - status.timestamp;
      const maxAge = status.state === 'processing' ? 2 * 60 * 1000 : 5 * 60 * 1000;
      
      if (elapsed > maxAge) {
        console.log(`📄 Resume status expired (${Math.round(elapsed/1000)}s old, state: ${status.state}), auto-clearing`);
        await this.clearResumeStatus();
        return { state: 'not_started', processingJobId: null };
      }
      
      // Log status for debugging
      console.log(`📄 Resume status: ${status.state} (job: ${status.processingJobId}, age: ${Math.round(elapsed/1000)}s)`);
      
      return status;
    } catch (error) {
      console.error('❌ Error getting resume status:', error);
      return { state: 'not_started', processingJobId: null };
    }
  }

  // Set resume management status
  static async setResumeStatus(state, processingJobId = null) {
    try {
      const status = {
        state: state, // 'processing', 'completed', 'not_started'
        processingJobId: processingJobId,
        timestamp: Date.now()
      };
      
      await chrome.storage.local.set({
        [this.statusKey]: status
      });
      
      console.log(`📄 Resume status set to: ${state} (job: ${processingJobId})`);
    } catch (error) {
      console.error('❌ Error setting resume status:', error);
    }
  }

  // Store info about uploaded resume for reuse
  static async storeSharedResume(resumeUrl, jobId) {
    try {
      const sharedResumeData = {
        resumeUrl: resumeUrl,
        uploadTime: Date.now(),
        firstJobId: jobId,
        usedByJobs: [jobId]
      };
      
      await chrome.storage.local.set({
        [this.storageKey]: sharedResumeData
      });
      
      console.log(`📄 Stored shared resume for reuse:`, sharedResumeData);
    } catch (error) {
      console.error('❌ Error storing shared resume:', error);
    }
  }

  // Mark that a job used the shared resume
  static async markResumeUsed(jobId) {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const sharedResume = result[this.storageKey];
      
      if (sharedResume) {
        if (!sharedResume.usedByJobs.includes(jobId)) {
          sharedResume.usedByJobs.push(jobId);
          await chrome.storage.local.set({
            [this.storageKey]: sharedResume
          });
          console.log(`📄 Marked shared resume as used by job ${jobId}`);
        }
      }
    } catch (error) {
      console.error('❌ Error marking resume used:', error);
    }
  }

  // Get shared resume info
  static async getSharedResumeInfo() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      return result[this.storageKey] || null;
    } catch (error) {
      console.error('❌ Error getting shared resume info:', error);
      return null;
    }
  }

  // Wait for resume management to complete
  static async waitForResumeCompletion(maxWaitTime = 60000) {
    console.log('⏳ Waiting for resume management to complete...');
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getResumeStatus();
      
      if (status.state === 'completed') {
        console.log('✅ Resume management completed, proceeding');
        return true;
      } else if (status.state === 'processing') {
        console.log(`⏳ Resume being processed by job ${status.processingJobId}, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      } else {
        console.log('❌ Resume management not started');
        return false;
      }
    }
    
    console.log('⏰ Timeout waiting for resume management');
    return false;
  }

  // Refresh page and mark for autofill continuation
  static async refreshAndSelectNewestResume() {
    try {
      console.log('🔄 Refreshing page to see updated resume list...');
      
      // Mark that we need to continue autofill after refresh
      const currentJobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
      if (currentJobId) {
        // Preserve the flow state and mark for continuation
        const flowKey = `seek_flow_${currentJobId}`;
        const flowData = await chrome.storage.local.get([flowKey]);
        
        await chrome.storage.local.set({
          [`seek_refresh_continue_${currentJobId}`]: {
            needsContinuation: true,
            timestamp: Date.now(),
            preservedFlowData: flowData[flowKey] // Preserve the original flow data
          }
        });
        console.log('📝 Marked for autofill continuation after refresh with preserved flow state');
      }
      
      // Refresh the page
      window.location.reload();
      return true;
    } catch (error) {
      console.error('❌ Error refreshing page:', error);
      return false;
    }
  }

  // Select newest resume without refresh (for first application)
  static async selectNewestResumeDirectly() {
    try {
      console.log('📄 Selecting newest resume directly...');
      
      // Ensure "Select a resumé" radio is selected
      const selectResumeRadio = document.querySelector('input[data-testid="resume-method-change"]');
      if (selectResumeRadio && !selectResumeRadio.checked) {
        selectResumeRadio.click();
        console.log('✅ Selected "Select a resumé" option');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Find and select from dropdown
      const resumeDropdown = document.querySelector('select[data-testid="select-input"]');
      if (resumeDropdown && resumeDropdown.options.length > 1) {
        resumeDropdown.selectedIndex = 1; // First option after "Please select"
        resumeDropdown.dispatchEvent(new Event('change', { bubbles: true }));
        
        const selectedOption = resumeDropdown.options[1];
        console.log('✅ Selected newest resume directly:', selectedOption.text);
        return true;
      }
      
      console.log('⚠️ No resume dropdown found or empty');
      return false;
    } catch (error) {
      console.error('❌ Error selecting newest resume:', error);
      return false;
    }
  }

  // Check if page needs autofill continuation after refresh
  static async checkForContinuation() {
    try {
      const currentJobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
      if (!currentJobId) return null;

      const continueKey = `seek_refresh_continue_${currentJobId}`;
      const result = await chrome.storage.local.get([continueKey]);
      const continueData = result[continueKey];

      if (continueData && continueData.needsContinuation) {
        // Check if continuation is recent (prevent infinite loops)
        const timeSinceMarked = Date.now() - continueData.timestamp;
        if (timeSinceMarked > 30000) { // 30 seconds timeout
          console.log('⏰ Continuation marker too old, cleaning up');
          await chrome.storage.local.remove([continueKey]);
          return null;
        }
        
        console.log('🔄 Found continuation marker for job', currentJobId);
        
        // Restore the flow state if it was preserved
        if (continueData.preservedFlowData) {
          const flowKey = `seek_flow_${currentJobId}`;
          await chrome.storage.local.set({
            [flowKey]: continueData.preservedFlowData
          });
          console.log('🔄 Restored flow state for job', currentJobId);
        }
        
        // Clean up the continuation marker
        await chrome.storage.local.remove([continueKey]);
        
        // Select newest resume after refresh
        const success = await this.selectNewestResumeAfterRefresh();
        if (success) {
          console.log('✅ Resume selected after refresh, ready to continue autofill');
          return { jobId: currentJobId, shouldContinue: true };
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error checking for continuation:', error);
      return null;
    }
  }

  // Select newest resume after page refresh
  static async selectNewestResumeAfterRefresh() {
    try {
      console.log('📄 Selecting newest resume after refresh...');
      
      // Wait for page to be fully loaded
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Ensure "Select a resumé" radio is selected
      const selectResumeRadio = document.querySelector('input[data-testid="resume-method-change"]');
      if (selectResumeRadio && !selectResumeRadio.checked) {
        selectResumeRadio.click();
        console.log('✅ Selected "Select a resumé" option');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Find and select from dropdown
      const resumeDropdown = document.querySelector('select[data-testid="select-input"]');
      if (resumeDropdown && resumeDropdown.options.length > 1) {
        resumeDropdown.selectedIndex = 1; // First option after "Please select"
        resumeDropdown.dispatchEvent(new Event('change', { bubbles: true }));
        
        const selectedOption = resumeDropdown.options[1];
        console.log('✅ Selected newest resume after refresh:', selectedOption.text);
        return true;
      }
      
      console.log('⚠️ No resume dropdown found after refresh');
      return false;
    } catch (error) {
      console.error('❌ Error selecting resume after refresh:', error);
      return false;
    }
  }

  // Clear all resume management data
  static async clearResumeStatus() {
    try {
      // Get current status for logging
      const result = await chrome.storage.local.get([this.statusKey]);
      const oldStatus = result[this.statusKey];
      
      await chrome.storage.local.remove([this.statusKey, this.lockKey]);
      
      // Also clear any continuation markers
      const allData = await chrome.storage.local.get(null);
      const continuationKeys = Object.keys(allData).filter(key => key.startsWith('seek_refresh_continue_'));
      if (continuationKeys.length > 0) {
        await chrome.storage.local.remove(continuationKeys);
      }
      
      console.log('🧹 Cleared resume management status and continuation markers');
      if (oldStatus) {
        console.log(`   Previous status: ${oldStatus.state} (job: ${oldStatus.processingJobId})`);
      }
    } catch (error) {
      console.error('❌ Error clearing resume status:', error);
    }
  }
  
  // Diagnostic tool: Check current resume queue state
  static async diagnoseResumeQueue() {
    try {
      const status = await this.getResumeStatus();
      const activeCount = await this.getActiveApplicationCount();
      
      console.log('🔍 Resume Queue Diagnostic:');
      console.log('  Status:', status);
      console.log('  Active applications:', activeCount);
      
      if (status.state === 'processing') {
        const elapsed = Date.now() - status.timestamp;
        console.log(`  ⚠️ STUCK: Job ${status.processingJobId} has been processing for ${Math.round(elapsed/1000)}s`);
        console.log(`  Recommendation: Clear with ResumeManager.clearResumeStatus()`);
      }
      
      return { status, activeCount };
    } catch (error) {
      console.error('❌ Error diagnosing queue:', error);
      return null;
    }
  }

  // Get count of active applications
  static async getActiveApplicationCount() {
    try {
      const result = await chrome.storage.local.get(null);
      const activeFlows = Object.keys(result).filter(key => 
        key.startsWith('seek_flow_') && result[key]?.active
      );
      return activeFlows.length;
    } catch (error) {
      console.error('❌ Error getting active application count:', error);
      return 0;
    }
  }

  // Check if tailored resume is enabled for a specific job
  static async isTailoredResumeEnabled(_jobId) {
    try {
      // Get the switch state from the UI component
      // For now, we'll check a storage key, but this could be enhanced
      const result = await chrome.storage.local.get(['tailored_resume_enabled']);
      return result.tailored_resume_enabled || false;
    } catch (error) {
      console.error('❌ Error checking tailored resume setting:', error);
      return false; // Default to false (shared resume)
    }
  }
}

export default ResumeManager;
