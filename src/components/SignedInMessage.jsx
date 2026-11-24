import React, { useState, useEffect } from 'react';

const cardStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  background: '#2B6BF5',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '14px 18px',
  gap: '12px',
  boxSizing: 'border-box',
};

const accentBar = {
  width: '4px',
  background: '#fff',
  borderRadius: '10px',
  flexShrink: 0,
  // Make it span both text lines
  alignSelf: 'stretch'
};

const textContainer = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  lineHeight: '1.4',
  color: '#fff',
  fontWeight: 600,
  fontSize: '14px',
};

const containerStyle = (visible) => ({
  transition: 'transform 0.6s ease, opacity 0.6s ease',
  transform: visible ? 'translateX(0)' : 'translateX(100%)',
  opacity: visible ? 1 : 0,
  pointerEvents: visible ? 'auto' : 'none',
});

const SignedInMessage = ({ onDismiss }) => {
  const [visible, setVisible] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, 3000);
    const removeTimer = setTimeout(() => {
      setShouldRender(false);
      if (typeof onDismiss === 'function') {
        onDismiss();
      }
    }, 3200);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [onDismiss]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div style={containerStyle(visible)}>
      <div style={cardStyle}>
        <div style={accentBar}></div>
        <div style={textContainer}>
          <div>Extension connected</div>
          <div>— ready for use.</div>
        </div>
      </div>
    </div>
  );
};

export default SignedInMessage;
