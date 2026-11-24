import React, { useState } from 'react';

const OnboardingReminder = ({ 
  emptyFieldCount: _emptyFieldCount, 
  onStartOnboarding: _onStartOnboarding,
  missingDetailedInfo = false, // true if missing personal_info, work_preferences
  missingPersonalFields = [], // array of missing personal fields
  missingWorkFields = [], // array of missing work preference fields
}) => {
  const hasRequiredFields = missingDetailedInfo;
  const [isVisible, setIsVisible] = useState(true);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false); // default fold
  
  if (!isVisible) {
    return null;
  }
  
  return (
    <div
      style={{
        padding: '16px 24px',
        margin: '16px 16px 16px 16px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        color: '#1f2933',
        background: hasRequiredFields ? 'linear-gradient(180deg, #fff 0%, #fef9f2 100%)' : 'linear-gradient(180deg, #fff 0%, #f0f9ff 100%)',
        borderRadius: '16px',
        boxShadow: hasRequiredFields ? '0 4px 12px rgba(245, 158, 11, 0.1)' : '0 4px 12px rgba(59, 130, 246, 0.1)',
        border: hasRequiredFields ? '1px solid #fed7aa' : '1px solid #bfdbfe',
        position: 'relative',
        zIndex: 0
      }}
    >
      {/* Close button */}
      <button
        onClick={() => setIsVisible(false)}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '24px',
          height: '24px',
          borderRadius: '6px',
          border: 'none',
          background: 'rgba(0, 0, 0, 0.05)',
          color: '#666',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          transition: 'all 0.2s ease',
          padding: 0
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(0, 0, 0, 0.1)';
          e.target.style.color = '#333';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'rgba(0, 0, 0, 0.05)';
          e.target.style.color = '#666';
        }}
        aria-label="Close"
      >
        ✕
      </button>

      {/* Title and description */}
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: hasRequiredFields ? '#d97706' : '#2563eb'
          }}
        >
          {hasRequiredFields ? 'Your onboarding is unfinished' : 'Enhance your profile'}
        </h3>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '13px',
            color: '#6b7280',
            lineHeight: 1.5,
            maxWidth: '320px'
          }}
        >
          {hasRequiredFields ? 'Please complete the profile for full functionality.' : 'We recommend completing these optional sections for better results.'}
        </p>
        
        {/* Missing fields information - */}
        {hasRequiredFields && (missingPersonalFields.length > 0 || missingWorkFields.length > 0) && (
          <div style={{ marginTop: '8px', width: '100%', maxWidth: '320px' }}>
            {/* fold/expand button */}
            <button
              onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
              style={{
                margin: '0 auto',
                padding: '4px 12px',
                fontSize: '12px',
                color: hasRequiredFields ? '#d97706' : '#2563eb',
                background: 'transparent',
                border: `1px solid ${hasRequiredFields ? '#fed7aa' : '#bfdbfe'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease',
                fontWeight: '500'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = hasRequiredFields ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)';
                e.target.style.borderColor = hasRequiredFields ? '#f59e0b' : '#3b82f6';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent';
                e.target.style.borderColor = hasRequiredFields ? '#fed7aa' : '#bfdbfe';
              }}
            >
              <span style={{
                transform: isDetailsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                display: 'inline-block'
              }}>
                ▼
              </span>
              {isDetailsExpanded ? 'Hide' : 'Show'} Missing Fields
            </button>
            
            {/* Detailed information - expandable/collapsible */}
            {isDetailsExpanded && (
              <div style={{ 
                marginTop: '10px', 
                fontSize: '12px', 
                color: '#4b5563',
                textAlign: 'left'
              }}>
                {missingPersonalFields.length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>Personal Info:</div>
                    {missingPersonalFields.slice(0, 3).map((field, index) => (
                      <div key={index} style={{ marginLeft: '8px' }}>
                        • {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                    ))}
                    {missingPersonalFields.length > 3 && (
                      <div style={{ marginLeft: '8px', fontStyle: 'italic' }}>
                        ... and {missingPersonalFields.length - 3} more
                      </div>
                    )}
                  </div>
                )}
                
                {missingWorkFields.length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ fontWeight: '500', marginBottom: '2px' }}>Work Preferences:</div>
                    {missingWorkFields.slice(0, 3).map((field, index) => (
                      <div key={index} style={{ marginLeft: '8px' }}>
                        • {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                    ))}
                    {missingWorkFields.length > 3 && (
                      <div style={{ marginLeft: '8px', fontStyle: 'italic' }}>
                        ... and {missingWorkFields.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Complete Profile button */}
      <button
        onClick={() => window.open('https://candidates.jobgen.ai/ai_apply', '_blank')}
        style={{
          padding: '8px 18px',
          backgroundColor: hasRequiredFields ? '#f59e0b' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          transition: 'all 0.2s ease',
          boxShadow: hasRequiredFields ? '0 2px 8px rgba(245, 158, 11, 0.2)' : '0 2px 8px rgba(59, 130, 246, 0.2)',
          minWidth: '180px'
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = hasRequiredFields ? '#d97706' : '#2563eb';
          e.target.style.transform = 'translateY(-1px)';
          e.target.style.boxShadow = hasRequiredFields ? '0 4px 12px rgba(245, 158, 11, 0.3)' : '0 4px 12px rgba(59, 130, 246, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = hasRequiredFields ? '#f59e0b' : '#3b82f6';
          e.target.style.transform = 'translateY(0)';
          e.target.style.boxShadow = hasRequiredFields ? '0 2px 8px rgba(245, 158, 11, 0.2)' : '0 2px 8px rgba(59, 130, 246, 0.2)';
        }}
      >
        <span>✏️</span>
        Complete Profile
      </button>
    </div>
  );
};

export default OnboardingReminder;
