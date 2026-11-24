import { useStableCallback } from '../utils/useStableCallback.js';
// Simple floating status button - draggable and clickable
import React, { useState, useEffect, useRef } from 'react';
import SeekStatusPopup from './SeekStatusPopup';

const SeekFloatingStatus = () => {
  const [showPopup, setShowPopup] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 110 }); // Left bottom by default
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragDistance, setDragDistance] = useState(0);
  const buttonRef = useRef(null);

  // Check active applications
  useEffect(() => {
    const checkActive = async () => {
      try {
        const result = await chrome.storage.local.get(null);
        const active = Object.keys(result).filter(key => 
          key.startsWith('seek_flow_') && result[key]?.active
        ).length;
        setActiveCount(active);
      } catch (error) {
        console.error('Error checking active:', error);
      }
    };

    checkActive();
    const interval = setInterval(checkActive, 3000);
    return () => clearInterval(interval);
  }, []);

  // Only show on SEEK listing pages (check for job card container instead of search bar)
  const shouldShow = window.location.href.includes('seek.com') && 
                   !window.location.href.includes('/apply') &&
                   (document.querySelector('h1[data-automation="job-detail-title"]') ||
                    document.querySelector('article[data-job-id]') ||
                    document.querySelector('[data-automation="jobTitle"]'));

  // Drag handlers
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragDistance(0);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
      startX: e.clientX,
      startY: e.clientY
    });
  };

  const handleMouseMove = useStableCallback((e) => {
    if (isDragging) {
      const newPos = {
        x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragStart.x)),
        y: Math.max(0, Math.min(window.innerHeight - 90, e.clientY - dragStart.y))
      };
      setPosition(newPos);
      
      // Calculate drag distance
      const distance = Math.sqrt(
        Math.pow(e.clientX - dragStart.startX, 2) + 
        Math.pow(e.clientY - dragStart.startY, 2)
      );
      setDragDistance(distance);
    }
  });

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Global mouse events for dragging
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

  // Click handler - only if not dragged
  const handleClick = (e) => {
    if (dragDistance < 5) { // Only click if moved less than 5 pixels
      e.preventDefault();
      e.stopPropagation();
      setShowPopup(!showPopup);
    }
  };

  if (!shouldShow) return null;

  return (
    <>
      {/* Create portal-style element */}
      <div
        ref={buttonRef}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: '180px',
          height: '70px',
          background: 'white',
          border: '2px solid #ddd',
          borderRadius: '15px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          cursor: isDragging ? 'grabbing' : 'pointer',
          zIndex: 999999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          userSelect: 'none',
          pointerEvents: 'auto'
        }}
      >
        {/* Logo and text */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img 
            src={chrome.runtime.getURL("icons/icon48.png")}
            alt="JobGen"
            style={{ width: '28px', height: '28px', borderRadius: '6px' }}
          />
          <div>
            <div style={{ fontWeight: 'bold', color: '#333' }}>SEEK Status</div>
            <div style={{ fontSize: '11px', color: '#666' }}>
              {activeCount > 0 ? `${activeCount} Active` : 'No jobs'}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          background: activeCount > 0 ? '#4CAF50' : '#ccc',
          color: 'white',
          borderRadius: '12px',
          padding: '4px 8px',
          fontSize: '12px',
          fontWeight: 'bold',
          minWidth: '20px',
          textAlign: 'center'
        }}>
          {activeCount > 0 ? activeCount : '📊'}
        </div>
      </div>

      {/* Popup */}
      <SeekStatusPopup 
        isVisible={showPopup}
        onClose={() => setShowPopup(false)}
      />
    </>
  );
};

export default SeekFloatingStatus;