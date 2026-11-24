// Test submit button detection on Seek review page
// Run this in browser console on the review page to test button detection

function testSubmitButtonDetection() {
  console.log('🔍 Testing submit button detection on review page...');
  
  // Look for various submit button selectors (same as in the extension)
  const submitSelectors = [
    'button[data-automation="application-submit-button"]',
    'button[data-automation*="submit"]',
    'button[type="submit"]',
    '[data-automation*="submit"]',
    '[data-testid*="submit"]',
    'input[type="submit"]',
    'button[class*="submit"]',
    'button[class*="Submit"]'
  ];
  
  let submitButton = null;
  
  // Try each selector
  for (const selector of submitSelectors) {
    submitButton = document.querySelector(selector);
    if (submitButton) {
      console.log(`✅ Found submit button with selector: ${selector}`);
      break;
    }
  }
  
  // If standard selectors don't work, look for buttons with submit-related text
  if (!submitButton) {
    console.log('🔍 No submit button found with standard selectors, trying text-based detection...');
    
    const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    for (const button of allButtons) {
      const text = button.textContent?.trim().toLowerCase() || button.value?.toLowerCase() || '';
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
      
      if (text.includes('submit') || text.includes('send application') || 
          text.includes('apply now') || text.includes('complete application') ||
          ariaLabel.includes('submit') || ariaLabel.includes('send')) {
        submitButton = button;
        console.log(`✅ Found submit button by text: "${button.textContent?.trim() || button.value}"`);
        break;
      }
    }
  }
  
  if (submitButton) {
    console.log('🎯 Submit button found!');
    console.log('📋 Button details:', {
      element: submitButton,
      text: submitButton.textContent?.trim() || submitButton.value || 'No text',
      id: submitButton.id || 'No ID',
      className: submitButton.className || 'No class',
      type: submitButton.type || 'No type',
      'data-automation': submitButton.getAttribute('data-automation') || 'None',
      'data-testid': submitButton.getAttribute('data-testid') || 'None',
      disabled: submitButton.disabled,
      visible: submitButton.offsetParent !== null
    });
    
    // Highlight the button
    const originalStyle = submitButton.style.cssText;
    submitButton.style.cssText += 'border: 3px solid red !important; background-color: yellow !important;';
    
    setTimeout(() => {
      submitButton.style.cssText = originalStyle;
    }, 3000);
    
    console.log('🔴 Submit button highlighted in red border for 3 seconds');
    
  } else {
    console.log('❌ Submit button not found!');
    console.log('🔍 All buttons on page:');
    
    // Log all buttons for debugging
    const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    allButtons.forEach((btn, index) => {
      console.log(`Button ${index + 1}:`, {
        element: btn,
        text: btn.textContent?.trim() || btn.value || 'No text',
        id: btn.id || 'No ID',
        className: btn.className || 'No class',
        type: btn.type || 'No type',
        'data-automation': btn.getAttribute('data-automation') || 'None',
        'data-testid': btn.getAttribute('data-testid') || 'None',
        disabled: btn.disabled,
        visible: btn.offsetParent !== null
      });
    });
  }
  
  // Also check current page step
  const stepElement = document.querySelector('[aria-current="step"]');
  const currentStep = stepElement?.textContent?.trim();
  console.log('📍 Current page step:', currentStep);
  
  return submitButton;
}

// Auto-run the test
const foundButton = testSubmitButtonDetection();

console.log('🛠️ Test function available: testSubmitButtonDetection()');
console.log('📋 Found submit button:', !!foundButton);
