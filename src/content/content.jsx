import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { showSuccessPopup } from '../components/SuccessPopup.js';
// Removed seekFlowManager - using simple state management in seek_simple.js
import '../styles/extension.css';
import { LinkedInExtractor } from '../utils/siteExtractors.js';

// Check if we're in the main frame (not iframe)
const isMainFrame = window.top === window.self;

console.log(`🔍 JobGen Extension loaded in ${isMainFrame ? 'main frame' : 'iframe'}`);

// Inject the React app into the page (only in main frame)
function injectApp() {
  // Only render React UI in the main frame
  if (!isMainFrame) {
    console.log('📋 Skipping React UI injection in iframe');
    return;
  }

  console.log('🚀 Injecting React UI in main frame');
  
  // Create a container for our React app
  const container = document.createElement('div');
  container.id = 'jobgen-react-app';
  container.classList.add('jobgen-root');
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;
  
  // Append to body
  document.body.appendChild(container);
  
  // Create React root and render app
  const root = createRoot(container);
  // strictmode will unmount and mount to test during run development
  // run production will remove strict mode automatiicaly
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// Initialize field logic (runs in all frames)
function initializeFieldLogic() {
  console.log(`🔧 Initializing field logic in ${isMainFrame ? 'main frame' : 'iframe'}`);
  
  // Listen for autofill messages from the main frame
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`📨 [${isMainFrame ? 'MAIN FRAME' : 'IFRAME'}] Received message:`, message);
    console.log(`📨 [${isMainFrame ? 'MAIN FRAME' : 'IFRAME'}] Sender:`, sender);
    console.log(`📨 [${isMainFrame ? 'MAIN FRAME' : 'IFRAME'}] Current URL:`, window.location.href);
    
    if (message.action === 'AUTOFILL_FRAME') {
      console.log(`🎯 [${isMainFrame ? 'MAIN FRAME' : 'IFRAME'}] Processing AUTOFILL_FRAME message`);
      handleAutofillRequest(message.data);
      sendResponse({ success: true, frame: isMainFrame ? 'main' : 'iframe', url: window.location.href });
    } else {
      console.log(`⚠️ [${isMainFrame ? 'MAIN FRAME' : 'IFRAME'}] Unknown message action: ${message.action}`);
    }
    
    return true; // Required for async sendResponse
  });
  
  // Set up mutation observer to detect dynamically loaded fields
  setupFieldObserver();
  
  // FIX FOR JOB DETAIL PAGES ONLY: Intercept SEEK apply button to create flow before redirect
  if (window.location.href.includes('seek.com') && window.location.href.match(/\/job\/\d+$/) && !window.location.href.includes('/apply')) {
    console.log('🔧 Job detail page detected - installing SEEK button interceptor');
    
    document.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-automation="job-detail-apply"]');
      if (!target) return;
      
      console.log('🎯 SEEK button clicked on detail page - intercepting');
      e.preventDefault();
      e.stopImmediatePropagation();
      
      const urlMatch = window.location.href.match(/\/job\/(\d+)/);
      const jobId = urlMatch ? urlMatch[1] : null;
      
      if (jobId) {
        // Check which mode (Autofill or Apply button clicked)
        const modeCheck = await chrome.storage.local.get(['seek_button_clicked']);
        const mode = modeCheck.seek_button_clicked || 'apply';
        console.log(`📍 Creating flow for job ${jobId} with mode: ${mode}`);
        
        const flowKey = `seek_flow_${jobId}`;
        await new Promise(resolve => {
          chrome.storage.local.set({
            [flowKey]: { active: true, startTime: Date.now(), jobId, mode },
            current_listing_job_id: jobId
          }, resolve);
        });
        
        console.log(`✅ Flow created, navigating to apply page`);
        window.location.href = target.href || `/job/${jobId}/apply`;
      }
    }, true);
    
    console.log('✅ Detail page interceptor installed');
  }
}

// Handle autofill request in current frame
function handleAutofillRequest(data) {
  console.log(`🎯 Handling autofill request in ${isMainFrame ? 'main frame' : 'iframe'}:`, data);
  
  // Check if this frame has form fields
  const formElements = document.querySelectorAll('input, select, textarea');
  console.log(`📝 Found ${formElements.length} form elements in current frame`);
  
  // Always trigger autofill logic for seek.com, regardless of form elements
  const currentUrl = window.location.href.toLowerCase();
  if (currentUrl.includes('seek.com')) {
    console.log('🎯 Seek.com detected - triggering autofill logic regardless of form elements');
    triggerAutofillLogic(data);
  } else if (formElements.length > 0) {
    // Trigger the appropriate autofill logic based on the site
    triggerAutofillLogic(data);
  } else {
    console.log('⚠️ No form elements found and not on seek.com - skipping autofill');
  }
}

// Trigger autofill logic based on site type
function triggerAutofillLogic(data) {
  const currentUrl = window.location.href.toLowerCase();
  // Detemerine running autofill or apply
  const action = data?.action || 'apply'; // Default to continuous flow

  console.log(`🔄 Triggering autofill for URL: ${currentUrl}`);
  console.log(`📊 Autofill data received:`, data);
  
  // Import and execute the appropriate autofill logic
  // linkedin
  if (currentUrl.includes('linkedin.com')) {
    console.log('🔗 LinkedIn detected - importing linkedin.js');
    import('../autofill/linkedin.js').then(module => {
      console.log('✅ LinkedIn module imported:', module);
      if (action === 'autofill') { // autofill button
        console.log('🚀 Calling autofillLinkedin()');
        module.autofillLinkedin();
      } else { // apply button
        console.log('🚀 Calling autoApplyLinkedin()');
        module.autoApplyLinkedin();
      }
    }).catch(error => {
      console.error('❌ Error importing linkedin.js:', error);
    });
  // indeed
  } else if (currentUrl.includes('indeed.com')) {
    console.log('🔍 Indeed detected - importing indeed.js');
    if (data.action == 'autofill') {
      import('../autofill/indeed.js').then(module => {
      console.log('✅ Indeed module imported:', module);
      if (module.autofillIndeed) {
        console.log('🚀 Calling autofillIndeed()');
        module.autofillIndeed();
      } else {
        console.error('❌ autofillIndeed function not found in module');
      }
    }).catch(error => {
      console.error('❌ Error importing indeed.js:', error);
    });
    } else if (data.action == 'apply') {
      import('../autofill/indeed.js').then(module => {
      console.log('✅ Indeed module imported:', module);
      if (module.applyIndeed) {
        console.log('🚀 Calling applyIndeed()');
        module.applyIndeed();
      } else {
        console.error('❌ autofillIndeed function not found in module');
      }
    }).catch(error => {
      console.error('❌ Error importing indeed.js:', error);
    });
    }
    
  } else if (currentUrl.includes('seek.com')) {
    if (action === 'autofill') {
      // Manual autofill (old version)
      console.log('🔧 Seek detected - importing seek_autodill.js (manual version)');
      import('../autofill/seek_autodill.js').then(module => {
        console.log('✅ Seek manual module imported:', module);
        if (module.autofillSeek) {
          console.log('🚀 Calling manual autofillSeek()');
          module.autofillSeek();
        } else {
          console.error('❌ autofillSeek function not found in manual module');
        }
      }).catch(error => {
        console.error('❌ Error importing seek_autodill.js:', error);
      });
    } else {
      // Continuous flow (apply mode)
      console.log('🎯 Seek detected - importing seek_simple.js in APPLY mode');
      
      // Store the mode so the flow knows it's in apply mode
      chrome.storage.local.set({ 'seek_flow_mode': 'apply' }, () => {
        console.log('📝 Stored flow mode: apply');
        
        import('../autofill/seek_simple.js').then(module => {
          console.log('✅ Seek simple module imported:', module);
          if (module.autofillSeekSimple) {
            console.log('🚀 Calling simple continuous autofill in APPLY mode');
            module.autofillSeekSimple();
          } else {
            console.error('❌ autofillSeekSimple function not found');
          }
        }).catch(error => {
          console.error('❌ Error importing seek_simple.js:', error);
        });
      });
    }
  } else if (currentUrl.includes('glassdoor.com') || currentUrl.includes('icims.com')) {
    const site = currentUrl.includes('glassdoor.com') ? 'glassdoor' : 'icims';
    import('../autofill/standardForm.js').then(module => module.autofillStandardForm(site))
      .catch(error => console.error('Application autofill failed:', error));
  } else if (currentUrl.includes('microsoft.com')) {
    console.log('🏢 Microsoft detected - importing microsoft.js');
    import('../autofill/microsoft.js').then(module => {
      console.log('✅ Microsoft module imported:', module);
      if (module.autofillMicrosoft) {
        console.log('🚀 Calling autofillMicrosoft()');
        module.autofillMicrosoft();
      } else {
        console.error('❌ autofillMicrosoft function not found in module');
      }
    }).catch(error => {
      console.error('❌ Error importing microsoft.js:', error);
    });
  } else {
    console.log('⚠️ No matching site detected for autofill');
  }
}

// Setup mutation observer to detect dynamically loaded fields and success state
function setupFieldObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const formElements = node.querySelectorAll?.('input, select, textarea') || [];
          if (formElements.length > 0) {
            console.log(`🔍 Detected ${formElements.length} new form elements in ${isMainFrame ? 'main frame' : 'iframe'}`);
          }
          
          // Check for success state when new elements are added (for SPAs)
          if (isMainFrame && window.location.href.toLowerCase().includes('seek.com')) {
            // Check if the new node contains success indicators
            const successElement = node.querySelector?.('#applicationSent') || 
                                 (node.id === 'applicationSent' ? node : null);
            const successHeading = node.querySelector?.('h1#applicationSent') ||
                                 (node.tagName === 'H1' && node.id === 'applicationSent' ? node : null);
            
            if (successElement || successHeading) {
              console.log('🎉 Success elements detected via mutation observer');
              setTimeout(() => {
                detectSeekSuccessfulState();
              }, 500);
            }
          }
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize when page loads
const initFlag = '__JOBGEN_INIT__'; // prevent multiple init on iframe

if (window[initFlag]) {
  console.log('♻️ JobGen content script already initialized, skipping re-run');
} else {
  window[initFlag] = true;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectApp();
      initializeFieldLogic();
      
      // Check for success state on initial load
      setTimeout(() => {
        detectSeekSuccessfulState();
      }, 1000);
      
      // Setup simple Seek flow monitoring
      setupSimpleSeekFlow();
    });
  } else {
    injectApp();
    initializeFieldLogic();
    
    // Check for success state on initial load
    setTimeout(() => {
      detectSeekSuccessfulState();
    }, 1000);
    
    // Setup simple Seek flow monitoring
    setupSimpleSeekFlow();
  }
}

// Function to detect Seek application success state
function detectSeekSuccessfulState() {
  const currentUrl = window.location.href.toLowerCase();
  
  // Only run on Seek.com
  if (!currentUrl.includes('seek.com')) {
    return false;
  }
  
  console.log('🔍 Checking for Seek success state...');
  
  // Check if we're on the application success page
  const successElement = document.querySelector('#applicationSent');
  const successHeading = document.querySelector('h1#applicationSent');
  const successMessages = document.querySelectorAll('span');
  
  // Look for success indicators
  let isSuccessPage = false;
  
  if (successElement) {
    console.log('✅ Found #applicationSent element');
    isSuccessPage = true;
  }
  
  if (successHeading && successHeading.textContent.includes('Good luck')) {
    console.log('✅ Found "Good luck" heading');
    isSuccessPage = true;
  }
  
  // Check all span elements for success message
  for (const span of successMessages) {
    if (span.textContent.includes('application has been sent')) {
      console.log('✅ Found "application has been sent" message');
      isSuccessPage = true;
      break;
    }
  }
  
  if (isSuccessPage) {
    console.log('🎉 Seek application success page detected!');
    
    // Submit successful application outcome to JobGen.AI
    const jobId = window.location.href.match(/\/job\/(\d+)/)?.[1];
    if (jobId) {
      import('../services/apiService.js').then(async (apiModule) => {
        try {
          const outcomeResult = await apiModule.submitJobApplicationOutcome({
            application_status: "Applied",
            job_id: jobId,
            job_portal: "SEEK"
          });
          
          if (outcomeResult && outcomeResult.success) {
            console.log('📊 Successfully submitted application outcome to JobGen.AI');
          } else {
            console.error('❌ Failed to submit application outcome:', outcomeResult?.error);
          }
          
          // Update jobgen_job_status to "Applied"
          console.log('💾 [SUCCESS_HANDLER] Updating jobgen_job_status to "Applied"...');
          try {
            const matchStorageKey = `seek_job_match_${jobId}`;
            const matchResult = await chrome.storage.local.get([matchStorageKey]);
            console.log('💾 [SUCCESS_HANDLER] Match data:', matchResult[matchStorageKey]);
            
            if (matchResult[matchStorageKey]) {
              const updatedMatchData = {
                ...matchResult[matchStorageKey],
                jobgen_job_status: "Applied"
              };
              await chrome.storage.local.set({ [matchStorageKey]: updatedMatchData });
              console.log(`✅ [SUCCESS_HANDLER] Updated jobgen_job_status to "Applied" for job ${jobId}`);
            } else {
              console.log(`⚠️ [SUCCESS_HANDLER] No match data found for ${matchStorageKey}`);
            }
          } catch (statusError) {
            console.error('❌ [SUCCESS_HANDLER] Error updating jobgen_job_status:', statusError);
          }
        } catch (error) {
          console.error('❌ Error submitting application outcome:', error);
        }
      }).catch(error => {
        console.error('❌ Error importing API service for outcome:', error);
      });
    }
    
    showSuccessPopup();
    return true;
  }
  
  return false;
}


// Setup simple Seek flow monitoring
function setupSimpleSeekFlow() {
  if (!window.location.href.toLowerCase().includes('seek.com')) return;

  console.log('🔄 Setting up simple Seek flow monitoring...');

  // Import the simple flow functions
  import('../autofill/seek_simple.js').then(module => {
    if (module.startSimpleSeekMonitoring) {
      module.startSimpleSeekMonitoring();
      console.log('✅ Simple Seek monitoring started');
    }
  }).catch(error => {
    console.error('❌ Error setting up simple monitoring:', error);
  });
}

// Handle messages for continuing simple flows in new tabs/pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'CONTINUE_SIMPLE_SEEK_FLOW') {
    console.log('📨 Received continue simple flow message');
    
    // Small delay then trigger simple autofill
    setTimeout(() => {
      import('../autofill/seek_simple.js').then(module => {
        if (module.autofillSeekSimple) {
          console.log('🚀 Continuing simple Seek flow in new tab/page');
          module.autofillSeekSimple();
        }
      });
    }, 1000);
    
    sendResponse({ success: true });
  }
});

// Note: URL change handling is now managed within the App component
// to preserve panel state across navigation
