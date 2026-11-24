import React, { useState, useRef, useEffect } from 'react';

const IconButton = ({ onClick, position, onPositionChange }) => {
  const [localPosition, setLocalPosition] = useState(position);

  // Update local position when prop changes
  useEffect(() => {
    setLocalPosition(position);
  }, [position]);
  const buttonRef = useRef(null);
  const isDraggingRef = useRef(false);
  const offsetRef = useRef({ y: 0 });

  const handleMouseDown = (e) => {
    const rect = buttonRef.current.getBoundingClientRect();
    const startY = e.clientY;
    offsetRef.current = {
      y: e.clientY - rect.top
    };

    const handleMouseMove = (e) => {
      // Only consider it dragging if mouse moved more than 5 pixels
      if (Math.abs(e.clientY - startY) > 5) {
        isDraggingRef.current = true;
        const topPosition = e.clientY - offsetRef.current.y;
        const newPosition = {
          top: `${topPosition}px`,
          right: '0'
        };
        setLocalPosition(newPosition);
        onPositionChange(newPosition);
      }
    };

    const handleMouseUp = () => {
      // Reset dragging state immediately if no significant movement occurred
      if (!isDraggingRef.current) {
        // This was just a click, not a drag
      } else {
        // This was a drag, reset after a small delay
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleClick = (_e) => {
    if (!isDraggingRef.current) {
      onClick();
    }
  };

  return (
    <button
      aria-label="Open JobGen"
      ref={buttonRef}
      id="IconButton"
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: localPosition.top,
        right: localPosition.right,
        transform: localPosition.top === '50%' ? 'translateY(-50%)' : 'none',
        backgroundColor: '#2b6bf5',
        border: 'none',
        padding: '0',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        zIndex: '99999',
        width: '50px',
        height: '50px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <img 
        src={chrome.runtime.getURL('icons/icon48.png')} 
        alt="Icon" 
        style={{ width: '40px', height: '40px'}} 
        draggable={false}
      />
    </button>
  );
};

export default IconButton;
