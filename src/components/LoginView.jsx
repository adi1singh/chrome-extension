import React, { useState, useEffect } from 'react';
import PanelHeader from './PanelHeader';

const BRAND = '#2B6BF5';
const BRAND_HOVER = '#1F56C9';
const BRAND_SOFT = '#E9F0FF';
const BRAND_BORDER = '#C7D7FF';

const LoginView = ({ onLogin, onMinimize }) => {
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);

  useEffect(() => {
    const handleMessage = (message) => {
      if (message.action === 'AUTH_SUCCESS') {
        setIsCheckingLogin(false);
        onLogin();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [onLogin]);

  const handleLoginClick = () => {
    if (isCheckingLogin) return;
    window.open('https://candidates.jobgen.ai/sign-up?ext_login=1', '_blank');
    startLoginCheck();
  };

  const startLoginCheck = () => {
    setIsCheckingLogin(true);
    const checkInterval = setInterval(async () => {
      try {
        const { checkJWTAuthentication } = await import('../services/apiService');
        const authResult = await checkJWTAuthentication();
        if (authResult.isAuthenticated) {
          clearInterval(checkInterval);
          setIsCheckingLogin(false);
          onLogin();
        }
      } catch (_e) { /* Optional operation; preserve the existing fallback. */ }
    }, 2000);
    setTimeout(() => { clearInterval(checkInterval); setIsCheckingLogin(false); }, 300000);
  };

  const features = [
    { icon: '⚡', label: 'One-click apply with AI autofill' },
    { icon: '📋', label: 'Track all applications in one place' },
    { icon: '🗺️', label: 'Personalised 12-week job search plan' },
  ];

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, height: '100%', width: '400px',
      backgroundColor: '#ffffff', borderRadius: '20px 0 0 20px',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.15)', zIndex: 99999,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <PanelHeader onMinimize={onMinimize} />

      {/* Hero section */}
      <div style={{
        background: `linear-gradient(145deg, ${BRAND} 0%, #1A4FC4 100%)`,
        padding: '40px 28px 56px',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}>
        <div style={{
          position: 'absolute', top: -50, right: -50,
          width: 180, height: 180, borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
        }} />
        <div style={{
          position: 'absolute', bottom: -30, left: -20,
          width: 130, height: 130, borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
        }} />
        <h1 style={{
          color: '#ffffff', fontSize: 26, fontWeight: 800,
          margin: '0 0 10px', lineHeight: 1.25, letterSpacing: '-0.4px',
          position: 'relative',
        }}>
          Welcome to JobGen.AI
        </h1>
        <p style={{
          color: 'rgba(255,255,255,0.78)', fontSize: 14,
          margin: 0, lineHeight: 1.55, position: 'relative',
          maxWidth: 280,
        }}>
          Your AI-powered career assistant for LinkedIn, Seek, Indeed & more.
        </p>
      </div>

      {/* Card */}
      <div style={{
        flex: 1, background: '#ffffff',
        borderRadius: '24px 24px 0 0',
        marginTop: -24, padding: '28px 24px 32px',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', overflowY: 'auto',
      }}>

        {/* Features */}
        <div style={{ marginBottom: 28 }}>
          {features.map(({ icon, label }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', borderRadius: 12,
              background: BRAND_SOFT, border: `1px solid ${BRAND_BORDER}`,
              marginBottom: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: BRAND,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0,
              }}>
                {icon}
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#0F172A' }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Sign in button */}
        <button
          onClick={handleLoginClick}
          disabled={isCheckingLogin}
          style={{
            width: '100%', padding: '15px',
            background: isCheckingLogin ? '#94A3B8' : BRAND,
            color: '#ffffff', border: 'none', borderRadius: 14,
            cursor: isCheckingLogin ? 'not-allowed' : 'pointer',
            fontSize: 16, fontWeight: 700, letterSpacing: '0.1px',
            boxShadow: isCheckingLogin ? 'none' : `0 4px 16px rgba(43,107,245,0.4)`,
            transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, marginBottom: 20,
          }}
          onMouseEnter={e => {
            if (!isCheckingLogin) {
              e.currentTarget.style.background = BRAND_HOVER;
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(43,107,245,0.5)';
            }
          }}
          onMouseLeave={e => {
            if (!isCheckingLogin) {
              e.currentTarget.style.background = BRAND;
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(43,107,245,0.4)';
            }
          }}
        >
          {isCheckingLogin ? (
            <>
              <span style={{
                width: 16, height: 16,
                border: '2px solid rgba(255,255,255,0.35)',
                borderTopColor: '#fff', borderRadius: '50%',
                display: 'inline-block',
                animation: 'jg-spin 0.8s linear infinite',
              }} />
              Waiting for login...
            </>
          ) : (
            'Sign in free'
          )}
        </button>

        <style>{`@keyframes jg-spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12, lineHeight: 1.6 }}>
          <span>By continuing, you agree to our </span>
          <a href="https://candidates.jobgen.ai/privacy" target="_blank" rel="noopener noreferrer"
            style={{ color: BRAND, textDecoration: 'none', fontWeight: 500 }}>
            Privacy Policy
          </a>
          <span> and </span>
          <a href="https://candidates.jobgen.ai/termsofservice" target="_blank" rel="noopener noreferrer"
            style={{ color: BRAND, textDecoration: 'none', fontWeight: 500 }}>
            Terms of Service
          </a>
          <span>.</span>
          <div style={{ marginTop: 10 }}>
            <a href="https://candidates.jobgen.ai" target="_blank" rel="noopener noreferrer"
              style={{ color: BRAND, textDecoration: 'none', fontWeight: 500 }}>
              Learn more about JobGen.AI →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
