// Debug utility for Seek continuous flow
// Run this in browser console to check flow status

async function debugSeekFlow() {
  console.log('🔍 Debugging Seek Continuous Flow...');
  
  try {
    const result = await chrome.storage.local.get([
      'seekFlowActive',
      'seekFlowState',
      'seekFlowStartTime',
      'seekFlowTabId',
      'seekFlowLastUpdate',
      'seekFlowProcessing',
      'seekJobInfo'
    ]);
    
    console.log('📊 Flow Status:', {
      active: result.seekFlowActive || false,
      state: result.seekFlowState || 'idle',
      processing: result.seekFlowProcessing || false,
      startTime: result.seekFlowStartTime ? new Date(result.seekFlowStartTime).toLocaleString() : 'N/A',
      tabId: result.seekFlowTabId || 'N/A',
      lastUpdate: result.seekFlowLastUpdate ? new Date(result.seekFlowLastUpdate).toLocaleString() : 'N/A',
      elapsed: result.seekFlowStartTime ? Math.round((Date.now() - result.seekFlowStartTime) / 1000) + 's' : 'N/A',
      jobTitle: result.seekJobInfo?.job_title || 'N/A',
      company: result.seekJobInfo?.company || 'N/A'
    });
    
    // Check current page elements
    const stepElement = document.querySelector('[aria-current="step"]');
    const applyButton = document.querySelector('[data-automation="job-detail-apply"]');
    const successElement = document.querySelector('#applicationSent');
    
    console.log('🎯 Current Page:', {
      url: window.location.href,
      hasStepElement: !!stepElement,
      currentStep: stepElement?.textContent?.trim() || 'N/A',
      hasApplyButton: !!applyButton,
      applyButtonText: applyButton?.textContent?.trim() || 'N/A',
      hasSuccessElement: !!successElement,
      isSeekSite: window.location.href.toLowerCase().includes('seek.com'),
      autofillInProgress: window.seekAutofillInProgress || false,
      lastAutofillTime: window.seekLastAutofillTime ? new Date(window.seekLastAutofillTime).toLocaleString() : 'N/A'
    });
    
  } catch (error) {
    console.error('❌ Error debugging flow:', error);
  }
}

async function _clearSeekFlow() {
  console.log('🧹 Clearing Seek flow...');
  
  try {
    await chrome.storage.local.remove([
      'seekFlowActive',
      'seekFlowState', 
      'seekJobInfo',
      'seekFlowStartTime',
      'seekFlowTabId',
      'seekFlowLastUpdate',
      'seekFlowProcessing'
    ]);
    
    console.log('✅ Flow cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing flow:', error);
  }
}

// Auto-run debug on load
debugSeekFlow();

console.log('🛠️ Debug utilities loaded:');
console.log('  - debugSeekFlow() - Check current flow status');
console.log('  - clearSeekFlow() - Clear/reset the flow');
