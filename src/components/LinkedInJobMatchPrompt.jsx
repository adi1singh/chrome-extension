import React from 'react';

const CARD_WIDTH = '100%';
const CARD_MAX_WIDTH = 360;
const CARD_PADDING = '24px';
const CARD_RADIUS = 16;

const LinkedInJobMatchPrompt = ({ onNavigateToJobs }) => {
  return (
    <div
      style={{
        width: CARD_WIDTH,
        maxWidth: `${CARD_MAX_WIDTH}px`,
        margin: '0 auto',
        padding: CARD_PADDING,
        borderRadius: `${CARD_RADIUS}px`,
        background: 'linear-gradient(180deg, #ffffff 0%, #fff5f4 100%)',
        border: '1px solid #fbd0d0',
        boxShadow: '0 12px 30px rgba(255, 92, 92, 0.18)',
        textAlign: 'center',
        color: '#8f2a2a',
        position: 'relative'
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(180deg, #ff6060 0%, #e62020 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontSize: '28px',
          margin: '0 auto 16px',
          boxShadow: '0 10px 24px rgba(232, 32, 32, 0.35)'
        }}
      >
        !
      </div>

      <h3
        style={{
          margin: '0 0 12px',
          fontSize: '20px',
          fontWeight: 700,
          color: '#9c1f1f'
        }}
      >
        Not Available on Profile Pages
      </h3>

      <p
        style={{
          margin: '0 auto 20px',
          fontSize: '14px',
          lineHeight: 1.6,
          color: '#7b3d3d',
          maxWidth: '280px'
        }}
      >
        Navigate to a job listing to use this feature.
      </p>

      <button
        onClick={onNavigateToJobs}
        style={{
          padding: '12px 20px',
          background: 'linear-gradient(180deg, #ff5e5e 0%, #e32626 100%)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '999px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          width: '100%',
          maxWidth: '220px',
          margin: '0 auto',
          boxShadow: '0 10px 20px rgba(226, 38, 38, 0.25)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 14px 26px rgba(226, 38, 38, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 10px 20px rgba(226, 38, 38, 0.25)';
        }}
      >
        Browse Jobs
      </button>

      <div
        style={{
          marginTop: '18px',
          fontSize: '13px',
          color: '#a24a4a'
        }}
      >
        💡 Switch to the LinkedIn Optimizer tab to optimize your profile.
      </div>
    </div>
  );
};

export default LinkedInJobMatchPrompt;

