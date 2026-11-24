import React, { useState } from 'react';

const CARD_PADDING_TOP = 15; // px
const CARD_PADDING_BOTTOM = 15; // px
const CARD_PADDING_HORIZONTAL = 12; // px
const CARD_MARGIN = '16px auto';
const CARD_WIDTH = 360; // px
const CARD_HEIGHT = 120; // px
const CARD_BORDER_RADIUS = 10; // px

const SECTION_SPACING = 10; // px

const BUTTON_WIDTH = 100; // px
const BUTTON_HEIGHT = 30; // px
const BUTTON_BORDER_RADIUS = 10; // px
const BUTTON_FONT_SIZE = '11px';
const BUTTON_GAP = '40px';

const GenerateSubscriptionReminder = ({
    onSubscribe,
    onRefresh,
    isVisible = true,
    onClose,
}) => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    if (!isVisible) {
        return null;
    }

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            // Keep the loading state for a minimum time to show the animation
            setTimeout(() => {
                setIsRefreshing(false);
            }, 500);
        }
    };

    return (
        <div
            id="generateSubscriptionReminderCard"
            style={{
                padding: `${CARD_PADDING_TOP}px ${CARD_PADDING_HORIZONTAL}px ${CARD_PADDING_BOTTOM}px`,
                margin: CARD_MARGIN,
                width: `${CARD_WIDTH}px`,
                height: `${CARD_HEIGHT}px`,
                background: 'linear-gradient(135deg, #5BA0F0 0%, #4A90E2 60%, #2E5AA0 100%)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: `${CARD_BORDER_RADIUS}px`,
                boxShadow: '0 4px 12px rgba(46, 90, 160, 0.3)',
                textAlign: 'center',
                position: 'relative',
                zIndex: 0
            }}
        >
            {/* Close button */}
            <button
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose?.();
                }}
                style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '20px',
                    height: '20px',
                    lineHeight: '30px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'rgba(0, 0, 0, 0.05)',
                    color: '#666',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    transition: 'all 0.2s ease',
                    padding: 0,
                    pointerEvents: 'auto',
                    boxSizing: 'border-box',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    zIndex: 10,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.1)';
                    e.currentTarget.style.color = '#333';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                    e.currentTarget.style.color = '#666';
                }}
                aria-label="Close"
            >
                ✕
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${SECTION_SPACING}px`, width: '100%' }}>
                <div style={{ lineHeight: 1.2, fontSize: '17px', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    Subscribe to generate headshots.
                </div>
                <div style={{ lineHeight: 1.3, fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)', fontWeight: 400, whiteSpace: 'nowrap' }}>
                    After purchase, click Refresh Extension to activate.
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: BUTTON_GAP, width: '100%' }}>
                    <button
                        onClick={onSubscribe}
                        style={{
                            width: `${BUTTON_WIDTH}px`,
                            height: `${BUTTON_HEIGHT}px`,
                            background: 'linear-gradient(180deg, #FFD600 0%, #FFB300 100%)',
                            color: '#000000',
                            border: 'none',
                            borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: BUTTON_FONT_SIZE,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Subscribe Now
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        style={{
                            width: `${BUTTON_WIDTH}px`,
                            height: `${BUTTON_HEIGHT}px`,
                            backgroundColor: 'rgba(255, 255, 255, 0.15)',
                            color: '#FFFFFF',
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                            borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                            cursor: isRefreshing ? 'not-allowed' : 'pointer',
                            fontWeight: 500,
                            fontSize: BUTTON_FONT_SIZE,
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            opacity: isRefreshing ? 0.7 : 1,
                            transition: 'opacity 0.2s ease'
                        }}
                    >
                        {isRefreshing && (
                            <div
                                style={{
                                    width: '12px',
                                    height: '12px',
                                    border: '2px solid rgba(255, 255, 255, 0.3)',
                                    borderTopColor: '#FFFFFF',
                                    borderRadius: '50%',
                                    animation: 'refresh-spin 0.8s linear infinite'
                                }}
                            />
                        )}
                        {isRefreshing ? 'Refreshing...' : 'Refresh Extension'}
                    </button>
                </div>
            </div>

            <style>
                {`
          @keyframes refresh-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
            </style>
        </div>
    );
};

export default GenerateSubscriptionReminder;
