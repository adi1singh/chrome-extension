/**
 * Utility functions for creating and managing autofill progress indicators
 * Extracted from microsoft.js to be reusable across different autofill implementations
 */

/**
 * Creates and displays an autofill progress section with spinner, logo, and close button
 * @param {string} currentPage - The current step/page in the application process (e.g., "Answer employer questions", "Update SEEK Profile")
 * @param {string} platform - The platform being used (e.g., "SEEK", "Microsoft", "LinkedIn")
 * @returns {HTMLElement} The created progress section element
 */
export function createAutofillProgressSection(currentPage = 'Application', platform = 'JobGen') {
  // Remove existing progress section if any
  const existingProgress = document.getElementById('autofillProgressSection');
  if (existingProgress) {
    existingProgress.remove();
  }

  const progressSection = document.createElement('div');
  progressSection.id = 'autofillProgressSection';
  progressSection.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 25px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    z-index: 2147483648;
    width: 320px;
    text-align: center;
    font-family: 'Inter', sans-serif;
    opacity: 0;
    animation: slideInRight 0.3s ease-in-out forwards;
  `;

  progressSection.innerHTML = `
    <!-- Close Button -->
    <button id="closeAutofillProgress" style="
      position: absolute;
      top: 10px;
      right: 10px;
      width: 25px;
      height: 25px;
      border: none;
      background: #f0f0f0;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: #666;
      z-index: 2147483649;
    ">×</button>
    
    <!-- Header with Logo and Current Page -->
    <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px; padding-top: 5px;">
      <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="JobGen Logo" style="
        width: 32px;
        height: 32px;
        margin-right: 10px;
        border-radius: 6px;
      ">
      <div style="text-align: left;">
        <h3 style="color: #3f6afd; margin: 0; font-size: 16px; font-weight: 600;">JobGen.AI</h3>
        <p style="color: #888; margin: 0; font-size: 12px;">${platform}: ${currentPage}</p>
      </div>
    </div>
    
    <div style="margin-bottom: 20px;">
      <div id="autofillProgressSpinner" style="
        width: 50px;
        height: 50px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #3f6afd;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 15px;
      "></div>
      <h4 id="autofillProgressTitle" style="color: #3f6afd; margin: 0 0 8px 0; font-size: 16px; font-weight: 500;">Processing...</h4>
      <p id="autofillProgressMessage" style="color: #666; margin: 0; font-size: 13px; line-height: 1.4;">Preparing autofill...</p>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @keyframes slideOutRight {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(100%);
        }
      }
      #closeAutofillProgress:hover {
        background: #e0e0e0;
        color: #333;
      }
    </style>
  `;

  document.body.appendChild(progressSection);
  
  // Add close button functionality
  const closeButton = document.getElementById('closeAutofillProgress');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      progressSection.style.animation = 'slideOutRight 0.3s ease-in-out forwards';
      setTimeout(() => {
        progressSection.remove();
      }, 300);
    });
  }
  
  return progressSection;
}

/**
 * Updates the progress message for the current autofill operation
 * @param {string} questionName - The name/description of the current step being processed
 */
export function updateAutofillProgress(questionName) {
  const progressSection = document.getElementById('autofillProgressSection');
  if (!progressSection) return;

  const progressMessage = document.getElementById('autofillProgressMessage');
  if (progressMessage) {
    progressMessage.textContent = `Autofilling: ${questionName}`;
  }
}

/**
 * Shows the success state of the autofill process with a checkmark and completion message
 * Does NOT auto-close - must be manually closed using closeAutofillProgress()
 * @param {string} currentPage - The current step/page in the application process (e.g., "Answer employer questions", "Update SEEK Profile")
 * @param {string} platform - The platform being used (e.g., "SEEK", "Microsoft", "LinkedIn")
 */
export function showAutofillSuccessState(currentPage = 'Application', platform = 'JobGen') {
  const progressSection = document.getElementById('autofillProgressSection');
  if (!progressSection) return;

  progressSection.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <!-- Header with Logo and Current Page -->
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="JobGen Logo" style="
          width: 32px;
          height: 32px;
          margin-right: 10px;
          border-radius: 6px;
        ">
        <div style="text-align: left;">
          <h3 style="color: #4caf50; margin: 0; font-size: 16px; font-weight: 600;">JobGen.AI</h3>
          <p style="color: #888; margin: 0; font-size: 12px;">${platform}: ${currentPage}</p>
        </div>
      </div>
      
      <div style="
        width: 80px;
        height: 80px;
        background: #4caf50;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
        animation: scaleIn 0.5s ease-out;
      ">
        <span style="font-size: 40px; color: white;">✅</span>
      </div>
      <h3 style="color: #4caf50; margin: 0 0 10px 0; font-size: 20px;">Autofill Complete!</h3>
      <p style="color: #666; margin: 0 0 20px 0; font-size: 14px;">Autofill finished: ${currentPage}. Review the form before submitting.</p>
      <button id="closeAutofillProgress" style="
        padding: 10px 20px;
        background: #3f6afd;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
      ">Close</button>
    </div>
    <style>
      @keyframes scaleIn {
        from { transform: scale(0); }
        to { transform: scale(1); }
      }
    </style>
  `;

  const closeButton = document.getElementById('closeAutofillProgress');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      progressSection.style.animation = 'slideOutRight 0.3s ease-in-out forwards';
      setTimeout(() => {
        progressSection.remove();
      }, 300);
    });
  }

  // Note: No auto-close - must be manually closed using closeAutofillProgress()
}

/**
 * Manually close the autofill progress section
 * Can be imported and called from any page to close the progress bar
 */
export function closeAutofillProgress() {
  const progressSection = document.getElementById('autofillProgressSection');
  if (progressSection && progressSection.parentNode) {
    console.log('🔒 Manually closing autofill progress');
    progressSection.style.animation = 'slideOutRight 0.3s ease-in-out forwards';
    setTimeout(() => {
      progressSection.remove();
      console.log('✅ Autofill progress closed');
    }, 300);
  }
}

/**
 * Shows the error state of the autofill process with an error icon and message
 * Auto-closes after 8 seconds
 * @param {string} errorMessage - The error message to display to the user
 * @param {string} currentPage - The current step/page in the application process (e.g., "Answer employer questions", "Update SEEK Profile")
 * @param {string} platform - The platform being used (e.g., "SEEK", "Microsoft", "LinkedIn")
 */
export function showAutofillErrorState(errorMessage, currentPage = 'Application', platform = 'JobGen') {
  const progressSection = document.getElementById('autofillProgressSection');
  if (!progressSection) return;

  progressSection.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <!-- Header with Logo and Current Page -->
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="JobGen Logo" style="
          width: 32px;
          height: 32px;
          margin-right: 10px;
          border-radius: 6px;
        ">
        <div style="text-align: left;">
          <h3 style="color: #f44336; margin: 0; font-size: 16px; font-weight: 600;">JobGen.AI</h3>
          <p style="color: #888; margin: 0; font-size: 12px;">${platform}: ${currentPage}</p>
        </div>
      </div>
      
      <div style="
        width: 80px;
        height: 80px;
        background: #f44336;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
        animation: shake 0.5s ease-in-out;
      ">
        <span style="font-size: 40px; color: white;">❌</span>
      </div>
      <h3 style="color: #f44336; margin: 0 0 10px 0; font-size: 20px;">Autofill Failed</h3>
      <p style="color: #666; margin: 0 0 20px 0; font-size: 14px;">${errorMessage}</p>
      <button id="closeAutofillProgress" style="
        padding: 10px 20px;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
      ">Close</button>
    </div>
    <style>
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
      }
    </style>
  `;

  const closeButton = document.getElementById('closeAutofillProgress');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      progressSection.style.animation = 'slideOutRight 0.3s ease-in-out forwards';
      setTimeout(() => {
        progressSection.remove();
      }, 300);
    });
  }

  // Auto-close after 8 seconds
  setTimeout(() => {
    if (progressSection.parentNode) {
      progressSection.style.animation = 'slideOutRight 0.3s ease-in-out forwards';
      setTimeout(() => {
        progressSection.remove();
      }, 300);
    }
  }, 8000);
}

/**
 * Removes the progress section from the DOM if it exists
 */
export function removeAutofillProgress() {
  const progressSection = document.getElementById('autofillProgressSection');
  if (progressSection) {
    progressSection.style.animation = 'slideOutRight 0.3s ease-in-out forwards';
    setTimeout(() => {
      progressSection.remove();
    }, 300);
  }
}
