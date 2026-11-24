import React from 'react';

const RingGraph = ({ percentage, size = 80, id = "scoreText" }) => {
  return (
    <div style={{ flex: '0 0 100px', textAlign: 'center' }}>
      <div
        className="ring-graph"
        style={{
          '--percent': percentage,
          width: `${size}px`,
          height: `${size}px`
        }}
      >
        <div className="percentage-text" id={id}>
          {percentage}%
        </div>
      </div>
    </div>
  );
};

export default RingGraph;
