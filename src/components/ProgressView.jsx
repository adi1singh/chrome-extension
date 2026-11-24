import React from 'react';
import PanelHeader from './PanelHeader';

const CONTAINER_WIDTH = 400;
const CONTAINER_BORDER_RADIUS = 20;
const CONTENT_PADDING = 20;
const FOOTER_GAP = 10;
const BUTTON_BORDER_RADIUS = 10;
const BUTTON_PADDING = '8px 16px';
const BUTTON_WIDTH = '80px';
const BUTTON_HEIGHT = '36px';

const ProgressView = ({
  onBack,
  onMinimize,
  detailMessage = '',
  isError = false,
  onNext,
  onAutofill,
  disableAutofill = false,
  disableNext = false,
  mode = 'autofill',
  action = 'filling',
  nextButtonText = 'Next',
  hideAutofillButton = false
}) => {
  const helperText = 'Avoid clicking the job page until done.';
  const resolvedMessage = isError
    ? (detailMessage || 'Error: Please try again.')
    : (detailMessage || 'Filling…');
  const messageColor = isError ? '#D86A6A' : '#0B1F4E';
  const isActive = !isError && action !== 'finished' && action !== 'submitted';
  const isComplete = !isError && (action === 'finished' || action === 'submitted');

  return (
    <div
      id="jobgen-progress-view"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: `${CONTAINER_WIDTH}px`,
        maxWidth: `${CONTAINER_WIDTH}px`,
        borderRadius: `${CONTAINER_BORDER_RADIUS}px`,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
        backgroundColor: '#FFFFFF',
        color: '#0B1F4E',
        zIndex: 99999,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <PanelHeader
        onBack={onBack}
        onMinimize={onMinimize}
        showBackButton={true}
        showProfileButton={false}
      />

      <div
        style={{
        padding: `${CONTENT_PADDING}px`,
        paddingTop: `${CONTENT_PADDING - 4}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        flex: 1
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.13em', color: '#7B89A6', fontWeight: 600 }}>
            {mode === 'apply' ? 'Auto-apply running…' : 'Autofilling running…'}
          </span>
          <span style={{ fontSize: '17px', fontWeight: 700, color: messageColor, letterSpacing: '-0.01em' }}>
            {resolvedMessage}
          </span>
        </div>
      </div>

          <div
            style={{
              position: 'relative',
              height: '10px',
              // padding: '5px',
              backgroundColor: '#EDF1F9',
              borderRadius: '999px',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.08)'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: '999px',
                background: 'linear-gradient(90deg, rgba(15,111,255,0.18) 0%, rgba(15,111,255,0.5) 100%)',
                opacity: isComplete ? 1 : 0,
                transition: 'opacity 0.4s ease'
              }}
            />
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '-45%',
                  width: '45%',
                  height: '100%',
                  borderRadius: '999px',
                  background: 'linear-gradient(90deg, rgba(43,107,245,0.08) 0%, rgba(15,111,255,0.55) 45%, rgba(43,107,245,0.12) 100%)',
                  boxShadow: '0 0 16px rgba(15,111,255,0.22)',
                  animation: 'jobgen-progress-indeterminate 1.7s cubic-bezier(0.45, 0.05, 0.25, 1) infinite'
                }}
              />
            )}
            <style>
              {`
                @keyframes jobgen-progress-indeterminate {
                  0% { transform: translateX(0%); left: -45%; opacity: 0.45; }
                  50% { transform: translateX(0%); left: 30%; opacity: 0.95; }
                  100% { transform: translateX(0%); left: 100%; opacity: 0.45; }
                }
              `}
            </style>
          </div>

        {action !== 'submitted' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              // marginTop: '12px'
            }}
          >
            <span style={{ fontSize: '13px', color: '#5B6B88', fontWeight: 500 }}>{helperText}</span>

            <div style={{ display: 'flex', gap: `${FOOTER_GAP}px` }}>
              <button
                onClick={onNext}
                disabled={disableNext}
                style={{
                  padding: BUTTON_PADDING,
                  borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                  border: '1px solid #0F6FFF',
                  backgroundColor: disableNext ? 'rgba(15,111,255,0.08)' : '#0F6FFF',
                  color: disableNext ? '#9BA7C0' : '#FFFFFF',
                  cursor: disableNext ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  minWidth: BUTTON_WIDTH,
                  minHeight: BUTTON_HEIGHT,
                  fontSize: '13px',
                  transition: 'all 0.2s ease'
                }}
              >
                {nextButtonText}
              </button>

              {!hideAutofillButton && (
                <button
                  onClick={onAutofill}
                  disabled={disableAutofill}
                  style={{
                    padding: BUTTON_PADDING,
                    borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                    border: '1px solid #0F6FFF',
                    backgroundColor: disableAutofill ? 'rgba(15,111,255,0.08)' : '#0F6FFF',
                    color: disableAutofill ? '#9BA7C0' : '#FFFFFF',
                    cursor: disableAutofill ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    minWidth: BUTTON_WIDTH,
                    minHeight: BUTTON_HEIGHT,
                    fontSize: '13px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Autofill
                </button>
              )}
            </div>
          </div>
        )}

        {action === 'submitted' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              fontSize: '14px',
              color: '#4CAF50',
              fontWeight: 600
            }}
          >
            ✓ Application submitted successfully!
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressView;
