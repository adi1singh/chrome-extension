// SuccessPopup.js
// Reusable success popup component for job application success

export class SuccessPopup {
  constructor() {
    this.popupId = 'jobgen-success-popup';
    this.styleId = 'jobgen-success-popup-styles';
  }

  // Show the success popup
  show() {
    console.log('🎉 Showing application success popup');
    
    // Check if popup already exists to prevent duplicates
    if (document.getElementById(this.popupId)) {
      console.log('Success popup already exists, skipping');
      return;
    }
    
    this.createPopup();
  }

  // Create and display the popup
  createPopup() {
    // Create the popup overlay
    const overlay = document.createElement('div');
    overlay.id = this.popupId;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // Create the popup content
    const popup = document.createElement('div');
    popup.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      width: 90%;
      position: relative;
      animation: popupSlideIn 0.3s ease-out;
    `;
    
    // Add animation styles
    this.addAnimationStyles();
    
    // Set popup content
    popup.innerHTML = this.getPopupHTML();
    
    // Add event listeners
    this.addEventListeners(popup, overlay);
    
    // Append to DOM
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    
    // Auto-close after 5 seconds
    setTimeout(() => {
      this.close();
    }, 5000);
    
    console.log('✅ Application success popup displayed');
  }

  // Get the HTML content for the popup
  getPopupHTML() {
    return `
      <div style="color: white;">
        <div style="font-size: 60px; margin-bottom: 20px;">🎉</div>
        <h2 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 600; color: white;">
          Application Submitted Successfully!
        </h2>
        <p style="margin: 0 0 25px 0; font-size: 16px; opacity: 0.9; line-height: 1.5;">
          Your job application has been sent successfully. Good luck with your application!
        </p>
        <button id="jobgen-success-close" style="
          background: white;
          color: #667eea;
          border: none;
          padding: 12px 30px;
          border-radius: 25px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(255, 255, 255, 0.3);
        ">
          Awesome! 🚀
        </button>
      </div>
    `;
  }

  // Add animation styles to the document
  addAnimationStyles() {
    // Check if styles already exist
    if (document.getElementById(this.styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      @keyframes popupSlideIn {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.9);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      @keyframes popupSlideOut {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-20px) scale(0.9);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Add event listeners to the popup
  addEventListeners(popup, overlay) {
    const closeButton = popup.querySelector('#jobgen-success-close');
    
    // Add hover effects to button
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.transform = 'translateY(-2px)';
      closeButton.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.4)';
    });
    
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.transform = 'translateY(0)';
      closeButton.style.boxShadow = '0 4px 15px rgba(255, 255, 255, 0.3)';
    });
    
    // Close on button click
    closeButton.addEventListener('click', () => {
      this.close();
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });
  }

  // Close the popup with animation
  close() {
    const overlay = document.getElementById(this.popupId);
    if (!overlay) return;

    overlay.style.animation = 'popupSlideOut 0.3s ease-in forwards';
    
    setTimeout(() => {
      // Remove popup
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      
      // Remove styles if no other popups exist
      const existingPopups = document.querySelectorAll(`[id^="${this.popupId}"]`);
      if (existingPopups.length === 0) {
        const style = document.getElementById(this.styleId);
        if (style && style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }
    }, 300);
  }

  // Static method to show popup (for easy usage)
  static show() {
    const popup = new SuccessPopup();
    popup.show();
  }
}

// Export both the class and a convenience function
export function showSuccessPopup() {
  SuccessPopup.show();
}

// Default export
export default SuccessPopup;
