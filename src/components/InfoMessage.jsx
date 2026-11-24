import React from 'react';

const InfoMessage = ({ 
  title, 
  message, 
  type = 'info', // 'info', 'warning', 'error', 'success'
  icon,
  style = {}
}) => {
  // Color schemes for different types
  const colorSchemes = {
    info: {
      background: '#d1ecf1',
      border: '#17a2b8',
      text: '#0c5460'
    },
    warning: {
      background: '#fff3cd',
      border: '#ffc107',
      text: '#856404'
    },
    error: {
      background: '#f8d7da',
      border: '#dc3545',
      text: '#721c24'
    },
    success: {
      background: '#d4edda',
      border: '#28a745',
      text: '#155724'
    }
  };

  // Default icons for each type
  const defaultIcons = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅'
  };

  const colors = colorSchemes[type] || colorSchemes.info;
  const displayIcon = icon || defaultIcons[type];

  return (
    <div style={{
      margin: '10px 30px 15px 30px',
      padding: '16px',
      backgroundColor: colors.background,
      border: `1px solid ${colors.border}`,
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      ...style
    }}>
      {displayIcon && (
        <span style={{ fontSize: '20px', flexShrink: 0 }}>
          {displayIcon}
        </span>
      )}
      <div style={{ flex: 1 }}>
        {title && (
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: colors.text,
            marginBottom: '6px'
          }}>
            {title}
          </div>
        )}
        <div style={{
          fontSize: '13px',
          color: colors.text,
          lineHeight: '1.5'
        }}>
          {message}
        </div>
      </div>
    </div>
  );
};

export default InfoMessage;
