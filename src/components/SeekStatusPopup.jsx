import { useStableCallback } from '../utils/useStableCallback.js';
// SeekStatusPopup.jsx
// Shows current SEEK job application status

import React, { useState, useEffect, useRef } from 'react';

const SeekStatusPopup = ({ isVisible, onClose }) => {
  const [applicationStatus, setApplicationStatus] = useState({
    activeApplications: []
  });
  
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const popupRef = useRef(null);

  // Refresh status every 2 seconds
  useEffect(() => {
    if (!isVisible) return;

    const refreshStatus = async () => {
      try {
        // Get all seek flow and job data from storage
        const result = await chrome.storage.local.get(null);
        
        const activeFlows = [];
        
        // Parse all storage keys for active flows only
        Object.keys(result).forEach(key => {
          if (key.startsWith('seek_flow_')) {
            const jobId = key.replace('seek_flow_', '');
            const flowData = result[key];
            
            if (flowData && flowData.active) {
              // Get job info for this active flow
              const jobInfoKey = `seek_job_${jobId}`;
              const jobInfo = result[jobInfoKey];
              
              activeFlows.push({
                jobId,
                jobTitle: jobInfo?.job_title || 'Unknown Job',
                company: jobInfo?.company || 'Unknown Company',
                startTime: flowData.startTime,
                duration: Math.round((Date.now() - flowData.startTime) / 1000)
              });
            }
          }
        });

        setApplicationStatus({
          activeApplications: activeFlows
        });

      } catch (error) {
        console.error('❌ Error refreshing status:', error);
      }
    };

    // Initial load
    refreshStatus();

    // Refresh every 2 seconds
    const interval = setInterval(refreshStatus, 2000);

    return () => clearInterval(interval);
  }, [isVisible]);

  // Drag functionality
  const handleMouseDown = (e) => {
    if (e.target.closest('.drag-handle')) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = useStableCallback((e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  });

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);

  useEffect(() => {
    console.log('🔍 SeekStatusPopup visibility changed:', isVisible);
  }, [isVisible]);

  if (!isVisible) {
    console.log('🚫 SeekStatusPopup not visible, returning null');
    return null;
  }

  console.log('✅ SeekStatusPopup rendering with isVisible:', isVisible);

  return (
    <div 
      ref={popupRef}
      style={{
        position: 'fixed',
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: '380px',
        background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
        borderRadius: '20px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        zIndex: '2147483647 !important', // Maximum z-index with !important
        color: '#333',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '14px',
        maxHeight: '80vh',
        overflowY: 'auto',
        border: '1px solid rgba(0,0,0,0.1)',
        cursor: isDragging ? 'grabbing' : 'default',
        pointerEvents: 'auto' // Ensure popup is clickable
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header with JobGen AI Logo */}
      <div 
        className="drag-handle"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 20px 15px 20px',
          borderBottom: '1px solid rgba(0,0,0,0.1)',
          cursor: 'grab',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img 
            src={chrome.runtime.getURL("icons/icon48.png")}
            alt="JobGen AI"
            style={{ width: '32px', height: '32px', borderRadius: '8px' }}
          />
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#333' }}>
            SEEK Application Status
          </h3>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('❌ Close button clicked');
            onClose();
          }}
          style={{
            background: 'rgba(0,0,0,0.1)',
            border: 'none',
            color: '#666',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2147483647,
            pointerEvents: 'auto',
            position: 'relative'
          }}
        >
          ×
        </button>
      </div>

      {/* Active Applications Summary */}
      <div style={{
        padding: '20px',
        textAlign: 'center',
        borderBottom: '1px solid rgba(0,0,0,0.1)'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #4CAF50, #45a049)',
          padding: '20px',
          borderRadius: '15px',
          color: 'white',
          boxShadow: '0 4px 15px rgba(76, 175, 80, 0.3)'
        }}>
          <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>
            {applicationStatus.activeApplications.length}
          </div>
          <div style={{ fontSize: '16px', opacity: 0.9 }}>
            {applicationStatus.activeApplications.length === 1 ? 'Active Application' : 'Active Applications'}
          </div>
        </div>
      </div>

      {/* Active Applications */}
      {applicationStatus.activeApplications.length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '15px' }}>
          <h4 style={{ 
            margin: '0 0 15px 0', 
            fontSize: '16px', 
            fontWeight: '600',
            color: '#333',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{
              background: 'linear-gradient(135deg, #4CAF50, #45a049)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: '12px',
              fontSize: '12px'
            }}>
              {applicationStatus.activeApplications.length}
            </span>
            Currently Applying
          </h4>
          {applicationStatus.activeApplications.map((app, _index) => (
            <div key={app.jobId} style={{
              background: '#f8f9fa',
              border: '1px solid rgba(0,0,0,0.1)',
              padding: '15px',
              borderRadius: '12px',
              marginBottom: '10px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}>
              <div style={{ 
                fontWeight: '600', 
                marginBottom: '6px',
                color: '#333',
                fontSize: '15px'
              }}>
                {app.jobTitle}
              </div>
              <div style={{ 
                fontSize: '13px', 
                color: '#666', 
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{app.company}</span>
                <span style={{ 
                  fontSize: '11px',
                  background: 'rgba(0,0,0,0.05)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  ID: {app.jobId}
                </span>
              </div>
              <div style={{ 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{
                  fontSize: '12px',
                  color: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  ⏱️ {app.duration}s
                </span>
                <span style={{
                  background: 'linear-gradient(135deg, #4CAF50, #45a049)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '500'
                }}>
                  Processing...
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Active Applications */}
      {applicationStatus.activeApplications.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#666'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '15px', opacity: 0.5 }}>💤</div>
          <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
            No active job applications
          </div>
          <div style={{ fontSize: '13px', opacity: 0.7 }}>
            Click "Apply" on any job to start autofill
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div style={{
        borderTop: '1px solid rgba(0,0,0,0.1)',
        padding: '20px',
        display: 'flex',
        gap: '12px'
      }}>
        <button
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔄 Reset All button clicked');
            
            // Use the new reset function that also clears shared resume
            try {
              const { resetAllSeekFlows } = await import('../autofill/seek_simple.js');
              await resetAllSeekFlows();
            } catch (error) {
              console.error('❌ Error importing reset function:', error);
              // Fallback to direct storage clear
              chrome.storage.local.get(null, (result) => {
                const keysToRemove = Object.keys(result).filter(key => 
                  key.startsWith('seek_flow_') || key === 'seek_shared_resume'
                );
                if (keysToRemove.length > 0) {
                  chrome.storage.local.remove(keysToRemove, () => {
                    console.log('🧹 Reset all active flows and shared resume');
                  });
                }
              });
            }
          }}
          style={{
            background: 'linear-gradient(135deg, #f4f4f4, #e0e0e0)',
            border: '1px solid rgba(0,0,0,0.1)',
            color: '#333',
            padding: '10px 15px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            flex: 1,
            transition: 'all 0.2s ease',
            zIndex: 2147483647,
            pointerEvents: 'auto',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'linear-gradient(135deg, #e0e0e0, #d0d0d0)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'linear-gradient(135deg, #f4f4f4, #e0e0e0)';
          }}
        >
          🔄 Reset All
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔄 Refresh button clicked');
            window.location.reload();
          }}
          style={{
            background: 'linear-gradient(135deg, #f4f4f4, #e0e0e0)',
            border: '1px solid rgba(0,0,0,0.1)',
            color: '#333',
            padding: '10px 15px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            flex: 1,
            transition: 'all 0.2s ease',
            zIndex: 2147483647,
            pointerEvents: 'auto',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'linear-gradient(135px, #e0e0e0, #d0d0d0)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'linear-gradient(135deg, #f4f4f4, #e0e0e0)';
          }}
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
};

export default SeekStatusPopup;
