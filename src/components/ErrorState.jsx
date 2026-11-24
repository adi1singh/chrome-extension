import React from 'react';

const ErrorState = ({
  title = 'Something went wrong',
  message = 'We encountered an issue while loading your data.',
  actionText = 'Try Again',
  onAction,
  showAction = true,
  secondaryMessage = null
}) => {
  return (
    <div
      style={{
        padding: '32px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        color: '#1f2933',
        background: 'linear-gradient(180deg, #fff 0%, #fef2f2 100%)',
        borderRadius: '16px',
        boxShadow: '0 12px 30px rgba(220, 38, 38, 0.08)',
        border: '1px solid #fecaca'
      }}
    >
      {/* Error Icon */}
      <div style={{ position: 'relative', width: '64px', height: '64px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at center, rgba(220, 38, 38, 0.15), transparent 65%)',
            position: 'absolute',
            top: 0,
            left: 0,
            animation: 'error-pulse 2s ease-in-out infinite'
          }}
        ></div>
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '3px solid #fecaca',
            borderRadius: '50%',
            margin: '8px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 1
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            !
          </div>
        </div>
      </div>

      {/* Error Content */}
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: '#dc2626'
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: '14px',
            color: '#6b7280',
            lineHeight: 1.6,
            maxWidth: '280px'
          }}
        >
          {message}
        </p>
      </div>

      {/* Retry Button */}
      {showAction && onAction && (
        <button
          aria-label={actionText}
          onClick={onAction}
          style={{
            padding: '10px 20px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 8px rgba(220, 38, 38, 0.2)'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#dc2626';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#ef4444';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 8px rgba(220, 38, 38, 0.2)';
          }}
        >
          <span style={{ fontSize: '16px' }}>↻</span>
          {actionText}
        </button>
      )}

      {/* Help Text */}
      {secondaryMessage ? (
        <div style={{ marginTop: '8px', maxWidth: '280px', textAlign: 'center' }}>
          {secondaryMessage}
        </div>
      ) : (
        <div
          style={{
            marginTop: '8px',
            padding: '10px 14px',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: '10px',
            fontSize: '13px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            maxWidth: '280px'
          }}
        >
          <span role="img" aria-label="Help" style={{ fontSize: '16px' }}>💡</span>
          <span>If the problem persists, try refreshing the page or contact support.</span>
        </div>
      )}

      <style>
        {`
          @keyframes error-pulse {
            0%, 100% { opacity: 0.3; transform: scale(0.95); }
            50% { opacity: 0.6; transform: scale(1); }
          }
        `}
      </style>
    </div>
  );
};

export default ErrorState;
