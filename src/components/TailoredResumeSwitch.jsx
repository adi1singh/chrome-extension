// TailoredResumeSwitch.jsx
import React, { useState } from 'react';

const BRAND_BLUE = '#2B6BF5';
const TAILORED_GREEN = '#2FA44F';
const TEXT_DARK = '#333';
const TEXT_MUTED = '#666';

const CONTROL_ROW_HEIGHT = 40;
const ICON_COLUMN_WIDTH = 20;
const SWITCH_WIDTH = 40;
const SWITCH_HEIGHT = 20;
const CHIP_HEIGHT = 20;
const SECTION_HEIGHT = 72;
const SWITCH_HANDLE_SIZE = 16;
const ROW_GAP = 6;

const TargetSVG = ({ size = 16, color = BRAND_BLUE }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2" />
    <circle cx="12" cy="12" r="5.25" fill="none" stroke={color} strokeWidth="2" />
    <circle cx="12" cy="12" r="2" fill={color} />
  </svg>
);

// Neutral “info” icon with subtle ring and centre glyph
const InfoCircleSVG = ({ size = 16, color = '#9A6A12' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="#FFFAF0" stroke={color} strokeWidth="1.6" />
    <rect x="11.25" y="10.2" width="1.5" height="6" rx="0.75" fill={color} />
    <circle cx="12" cy="8" r="1.1" fill={color} />
  </svg>
);

// Reusable, MV3-safe tooltip that shows ABOVE the trigger
function Tooltip({ children }) {
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 10px)', // show above
        right: 0,
        maxWidth: 480,
        minWidth: 220,
        background: '#3B3B3B',
        color: '#F9FAFB',
        fontSize: 12,
        lineHeight: 1.4,
        padding: '8px 16px',
        borderRadius: 12,
        boxShadow: '0 14px 34px rgba(0,0,0,0.28)',
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );
}

// Slim pill with shared tooltip behaviour
function ModeChip({ variant, tip }) {
  const [hover, setHover] = useState(false);
  const isTailored = variant === 'tailored';

  const theme = isTailored
    ? { bg: '#E8F6EC', border: TAILORED_GREEN, text: '#1F6C39' } // green
    : { bg: '#EEF4FF', border: BRAND_BLUE, text: '#0B3EA8' };     // blue

  const label = isTailored ? 'Tailored mode' : 'Parallel mode';

  return (
    <div
      style={{ position: 'relative', flexShrink: 0, marginLeft: 16 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '1px 8px',
          height: CHIP_HEIGHT,                    // compact
          borderRadius: 999,
          border: `1px solid ${theme.border}`,
          background: theme.bg,
          color: theme.text,
          fontSize: 12,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          maxWidth: 128,                 // slightly smaller so title truncates less
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
          cursor: 'default'
        }}
      >
        <span
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: theme.border, display: 'inline-block'
          }}
        />
        <span>{label}</span>
      </div>

      {hover && <Tooltip>{tip}</Tooltip>}
    </div>
  );
}

export default function TailoredResumeSwitch({
  enabled,
  onToggle,
  isExternalApply,
  activeApplicationCount = 0
}) {
  const [showExternalTip, setShowExternalTip] = useState(false);
  const [internalEnabled, setInternalEnabled] = React.useState(enabled);

  // Listen for storage changes to sync switch state
  React.useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.tailored_resume_enabled) {
        const newValue = changes.tailored_resume_enabled.newValue;
        console.log('🔄 Tailored resume setting changed in storage:', newValue);
        setInternalEnabled(newValue || false);
      }
    };

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    return () => {
      if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, []);

  // Update internal state when prop changes
  React.useEffect(() => {
    setInternalEnabled(enabled);
  }, [enabled]);
  // ---------- External condition ----------
  if (isExternalApply) {
    const hover =
      "This job requires applying on an external website. JobGen.AI doesn't support that site yet, so autofill and tailored-resume features are unavailable. Please apply manually.";

    return (
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #eee',
          background: '#f9f8f4',
          height: SECTION_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}
      >
        <div
          style={{
            width: ICON_COLUMN_WIDTH,
            height: CONTROL_ROW_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <TargetSVG color="#BC810C" />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 15,
              fontWeight: 600,
              color: TEXT_DARK,
              maxWidth: '100%'
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              External Application Detected
            </span>
            <span
              style={{ display: 'flex', alignItems: 'center', position: 'relative' }}
              onMouseEnter={() => setShowExternalTip(true)}
              onMouseLeave={() => setShowExternalTip(false)}
            >
              <InfoCircleSVG />
              {showExternalTip && <Tooltip>{hover}</Tooltip>}
            </span>
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.4, maxWidth: '100%', marginTop: ROW_GAP }}>
            This job routes to an external site. Please apply manually.
          </div>
        </div>
      </div>
    );
  }

  // ---------- Normal state ----------
  const tip = internalEnabled
    ? (activeApplicationCount > 0
        ? `Tailored mode can run only one application until the current one finishes (${activeApplicationCount} active).`
        : 'Ready to process one job with a tailored resume for maximum relevance.')
    : (activeApplicationCount > 0
        ? `Supporting multiple simultaneous applications with your shared resume (${activeApplicationCount} active).`
        : 'Ready to process multiple jobs simultaneously using your default resume.');

  const handleToggle = (checked) => {
    setInternalEnabled(checked);
    onToggle(checked);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ tailored_resume_enabled: checked });
        console.log('💾 Saved tailored resume setting:', checked);
      }
    } catch (e) {
      console.error('❌ Error saving setting:', e);
    }
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        borderTop: '1px solid #eee',
        background: '#f9f9f9',
        height: SECTION_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}
    >
      {/* Left: centred icon + text */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <div
          style={{
            width: ICON_COLUMN_WIDTH,
            height: CONTROL_ROW_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <TargetSVG />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 12 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: TEXT_DARK,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1
              }}
              title="Enable Customization"
            >
              Enable Customization
            </div>

            <ModeChip variant={internalEnabled ? 'tailored' : 'parallel'} tip={tip} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: ROW_GAP, gap: 12 }}>
            <div style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.45, flex: 1 }}>
              Customize resume for each application
            </div>
            <label
              style={{
                position: 'relative',
                width: SWITCH_WIDTH,
                height: SWITCH_HEIGHT,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <input
                type="checkbox"
                checked={internalEnabled}
                onChange={(e) => handleToggle(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: internalEnabled ? '#35A853' : '#ccc',
                  borderRadius: 999,
                  transition: '0.25s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: SWITCH_HANDLE_SIZE,
                    width: SWITCH_HANDLE_SIZE,
                    left: internalEnabled ? SWITCH_WIDTH - SWITCH_HANDLE_SIZE - 2 : 2,
                    top: 2,
                    backgroundColor: '#fff',
                    borderRadius: '50%',
                    transition: '0.25s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                  }}
                />
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
