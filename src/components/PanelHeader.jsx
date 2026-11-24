import React from 'react';

// UI Constants
const HEADER_PADDING = 15;
const BUTTON_SIZE = 20;
const BUTTON_PADDING = 5;
const HEADER_HEIGHT = 70;
const HEADER_BORDER_RADIUS = 10;
const BUTTON_BORDER_RADIUS = 10;

const PanelHeader = ({ 
  onProfileClick, 
  onMinimize, 
  onBack, 
  showProfileButton = false, 
  showBackButton = false,
  statusMessage: _statusMessage = '',
  onViewProgress,
  showProgressButton = false
}) => {
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 99999
    }}>
      <div style={{
        backgroundColor: '#2b6bf5',
        padding: `${HEADER_PADDING}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between', // This spreads content across the header
        width: '100%',
        boxSizing: 'border-box',
        height: `${HEADER_HEIGHT}px`,
        borderTopLeftRadius: `${HEADER_BORDER_RADIUS}px`,
        borderTopRightRadius: `${HEADER_BORDER_RADIUS}px`
      }}>
        {/* Left side - Logo and Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <img 
            src={chrome.runtime.getURL('icons/icon48.png')} 
            alt="Logo" 
            style={{ width: '40px', height: '40px'}}
            draggable={false} 
          />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '26px',
                fontWeight: 700,
                display: 'flex',
                fontFamily: 'Inter, Segoe UI, sans-serif',
                letterSpacing: '0.5px'
              }}
            >
              <span style={{ color: 'white', fontWeight: 700 }}>JOB</span>
              <span style={{ color: 'white', fontWeight: 300 }}>GEN.AI</span>
            </h3>
          </div>
        </div>

        {/* Right side - Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '-3px' }}>
          {/* Back Button - for profile/login views */}
          {showBackButton && onBack && (
            <button
              aria-label="Back"
              onClick={onBack}
              style={{
                padding: `${BUTTON_PADDING}px`,
                backgroundColor: '#2b6bf5',
                border: 'none',
                borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: `${BUTTON_SIZE + BUTTON_PADDING * 2}px`,
                height: `${BUTTON_SIZE + BUTTON_PADDING * 2}px`
              }}
            >
              <img 
                src={chrome.runtime.getURL('icons/cross.png')} 
                alt="Back" 
                style={{ 
                  width: `${BUTTON_SIZE}px`, 
                  height: `${BUTTON_SIZE}px`,
                  transform: 'scaleX(-1)'
                }}
                draggable={false} 
              />
            </button>
          )}

          {/* View Progress Button - shows when progress is active but user navigated away */}
          {showProgressButton && onViewProgress && (
            <button
              aria-label="View application progress"
              onClick={onViewProgress}
              style={{
                padding: `${BUTTON_PADDING}px`,
                backgroundColor: '#2b6bf5',
                border: 'none',
                borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: `${BUTTON_SIZE + BUTTON_PADDING * 2}px`,
                height: `${BUTTON_SIZE + BUTTON_PADDING * 2}px`
              }}
              title="Return to progress view"
            >
              <span style={{ 
                color: '#2b6bf5', 
                fontSize: '16px', 
                fontWeight: 'bold',
                fontFamily: 'Inter, Segoe UI, sans-serif',
                width: `${BUTTON_SIZE}px`,
                height: `${BUTTON_SIZE}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'white',
                borderRadius: '50%'
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#2b6bf5" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 4 L8 8 L11 8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            </button>
          )}

          {/* Profile Button - for main view */}
          {showProfileButton && onProfileClick && (
            <button
              id="profileButton"
              aria-label="Open profile"
              onClick={onProfileClick}
              style={{
                padding: `${BUTTON_PADDING}px`,
                backgroundColor: '#2b6bf5',
                border: 'none',
                borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: `${BUTTON_SIZE + BUTTON_PADDING * 2 + 10}px`,
                height: `${BUTTON_SIZE + BUTTON_PADDING * 2 + 10}px`
              }}
            >
              <span style={{ 
                color: '#ffffff', 
                fontSize: '20px', 
                fontWeight: 'bold',
                fontFamily: 'Inter, Segoe UI, sans-serif',
                width: `${BUTTON_SIZE + 10}px`,
                height: `${BUTTON_SIZE + 10}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#2b6bf5',
                borderRadius: '50%'
              }}>
                <svg width="20" height="20" viewBox="0 0 16 16" fill="#ffffff">
                  <circle cx="8" cy="5" r="3"/>
                  <path d="M3 14c0-3 2-5 5-5s5 2 5 5"/>
                </svg>
              </span>
            </button>
          )}

          {/* Minimize Button - always present */}
          <button
            id="minimizeButton"
            aria-label="Minimise JobGen"
            onClick={onMinimize}
            style={{
              padding: `${BUTTON_PADDING}px`,
              backgroundColor: '#2b6bf5',
              border: 'none',
              borderRadius: `${BUTTON_BORDER_RADIUS}px`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${BUTTON_SIZE + BUTTON_PADDING * 2}px`,
              height: `${BUTTON_SIZE + BUTTON_PADDING * 2}px`
            }}
          >
            <img 
              src={chrome.runtime.getURL('icons/cross.png')} 
              alt="Minimize" 
              style={{ width: `${BUTTON_SIZE}px`, height: `${BUTTON_SIZE}px` }}
              draggable={false} 
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PanelHeader;
