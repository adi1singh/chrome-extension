import React, { useState, useEffect } from 'react';

const StarRating = ({ onRatingChange, initialRating = 3 }) => {
  const [rating, setRating] = useState(initialRating);

  useEffect(() => {
    // Set global rating for compatibility with original extension
    window.selectedStarRating = rating;
    if (onRatingChange) {
      onRatingChange(rating);
    }
  }, [rating, onRatingChange]);

  const handleStarClick = (value) => {
    setRating(value);
    console.log('User selected rating:', value);
  };

  return (
    <div id="starRating" style={{ 
      display: 'flex', 
      alignItems: 'center',
      height: '24px', // Fixed height like other text elements
      minHeight: '24px',
      overflow: 'hidden'
    }}>
      <span style={{ marginRight: '8px', fontWeight: 'bold', color: 'black' }}>Excitement:</span>
      {[1, 2, 3, 4, 5].map((value) => (
        <span
          key={value}
          className="star"
          data-value={value}
          style={{
            fontSize: '20px',
            cursor: 'pointer',
            color: 'gold'
          }}
          onClick={() => handleStarClick(value)}
        >
          {value <= rating ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
};

export default StarRating;
