import React from 'react';

const LoadingState = ({
  title = 'Just a moment...',
  message = 'We are preparing your personalised insights.',
  tip
}) => {
  return (
    <div
      style={{
        padding: '32px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        color: '#1f2933',
        background: 'linear-gradient(180deg, #fff 0%, #f8faff 100%)',
        borderRadius: '16px',
        boxShadow: '0 12px 30px rgba(37, 99, 235, 0.08)'
      }}
    >
      <div style={{ position: 'relative', width: '64px', height: '64px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at center, rgba(37, 99, 235, 0.18), transparent 65%)',
            position: 'absolute',
            top: 0,
            left: 0,
            animation: 'pulse-glow 1.8s ease-in-out infinite'
          }}
        ></div>
        <div
          style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e2e8f0',
            borderTopColor: '#2563eb',
            borderRadius: '50%',
            margin: '8px',
            animation: 'loading-spin 1s linear infinite',
            background: '#fff'
          }}
        ></div>
      </div>

      <div>
        <h3
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: '#1f2937'
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: '14px',
            color: '#4b5563',
            lineHeight: 1.6,
            maxWidth: '280px'
          }}
        >
          {message}
        </p>
        {tip && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: '#eef2ff',
              color: '#3730a3',
              borderRadius: '10px',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span role="img" aria-label="Tip" style={{ fontSize: '16px' }}>💡</span>
            <span>{tip}</span>
          </div>
        )}
      </div>

      <style>
        {`
          @keyframes loading-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @keyframes pulse-glow {
            0%, 100% { opacity: 0.35; transform: scale(0.95); }
            50% { opacity: 0.75; transform: scale(1); }
          }
        `}
      </style>
    </div>
  );
};

export default LoadingState;
