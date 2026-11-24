import React, { useState } from 'react';

const CollapsibleSection = ({ title, items = [], id, defaultExpanded = true }) => {
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const sectionId = id || title.toLowerCase().replace(/\s+/g, '') + 'Section';

  return (
    <>
      <h4
        className={`section-title ${isCollapsed ? 'collapsed' : ''}`}
        onClick={toggleCollapse}
        style={{
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'black',
          fontWeight: 'bold',
          padding: '10px 0'
        }}
      >
        {title}
        <span
          className="dropdown-icon"
          style={{
            color: '#2B6BF5',
            fontSize: '14px',
            transition: 'transform 0.3s',
            transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'
          }}
        >
          ▼
        </span>
      </h4>

      <ul
        id={sectionId}
        className="jobgen-bullet-list"
        style={{
          display: isCollapsed ? 'none' : 'block',
          paddingLeft: '9px',
          color: 'black'
        }}
      >
        {items.map((item, index) => (
          <li
            key={index}
            style={{
              marginBottom: '8px',
              lineHeight: '1.2'
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </>
  );
};

export default CollapsibleSection;
