import { setSessionToken, isExpiredToken } from '../services/session.js';
import { broadcastAutofill } from './autofillBroadcast.js';

// background.js
// Background script for JobGen.AI Chrome extension

self.addEventListener('install', (_event) => {
  console.log('SW installing');
});

self.addEventListener('activate', (_event) => {
  console.log('SW activated');
});

chrome.runtime.onInstalled.addListener(details => {
  console.log('Extension installed or updated:', details.reason, details.previousVersion);
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Browser/profile startup – background worker waking');
});

const _refreshAttemptsByTab = {};
const JOBGEN_HOSTNAME = 'candidates.jobgen.ai';
const JWT_COOKIE_NAME = 'jobgen_session';
const JOBGEN_COOKIE_URL = `https://${JOBGEN_HOSTNAME}/`;

// Cookie may be set by the Render backend (cross-origin) or a custom subdomain
const COOKIE_LOOKUP_URLS = [
  'https://jobgen-b2c-api.onrender.com',
  'https://api.jobgen.ai',
  'https://candidates.jobgen.ai',
  'https://jobgen.ai'
];

// Try each URL in sequence until a cookie is found
const tryGetCookieFromUrls = (urls, index, callback) => {
    if (index >= urls.length) {
        callback(null);
        return;
    }
    chrome.cookies.get({ url: urls[index], name: JWT_COOKIE_NAME }, (cookie) => {
        if (chrome.runtime.lastError) {
            console.warn(`⚠️ Background: Error querying ${urls[index]}:`, chrome.runtime.lastError.message);
            tryGetCookieFromUrls(urls, index + 1, callback);
            return;
        }
        if (cookie && cookie.value && !isExpiredToken(cookie.value)) {
            console.log(`✅ Background: Found ${JWT_COOKIE_NAME} cookie at ${urls[index]}`);
            callback(cookie);
        } else {
            tryGetCookieFromUrls(urls, index + 1, callback);
        }
    });
};

// Primary: search all accessible domains for the cookie, then fall back to URL-specific lookup
const findSessionCookie = (callback) => {
    chrome.cookies.getAll({ name: JWT_COOKIE_NAME }, (cookies) => {
        if (chrome.runtime.lastError) {
            console.warn('⚠️ Background: getAll error:', chrome.runtime.lastError.message);
            tryGetCookieFromUrls(COOKIE_LOOKUP_URLS, 0, callback);
            return;
        }
        cookies = (cookies || []).filter(cookie => isJobgenJWTCookie(cookie) && !isExpiredToken(cookie.value));
        if (cookies.length > 0) {
            console.log(`✅ Background: getAll found ${cookies.length} cookie(s):`,
                cookies.map(c => ({ domain: c.domain, httpOnly: c.httpOnly, len: c.value.length })));
            callback(cookies[0]);
        } else {
            console.log('⚠️ Background: getAll found nothing, trying URL-specific lookup...');
            tryGetCookieFromUrls(COOKIE_LOOKUP_URLS, 0, callback);
        }
    });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getJWTCookie") {
        console.log("🍪 Background: Getting JWT cookie from JobGen.AI...");
        const maxAttempts = 2; // fast fail — LoginView polls every 2s anyway
        const retryDelayMs = 800;
        let remainingAttempts = maxAttempts;
        let responseSent = false;

        const attemptGetCookie = () => {
            findSessionCookie((cookie) => {
                if (responseSent) {
                    return;
                }

                if (cookie && cookie.value && !isExpiredToken(cookie.value)) {
                    console.log('✅ Background: Found jobgen_jwt cookie');
                    console.log('🔍 Background: Cookie details:', {
                        name: cookie.name,
                        domain: cookie.domain,
                        httpOnly: cookie.httpOnly,
                        secure: cookie.secure,
                        valueLength: cookie.value.length
                    });
                    
                    // Store in extension storage
                    setSessionToken(cookie.value).then(saved => {
                        responseSent = true;
                        sendResponse(saved ? { success: true, jwt: cookie.value } :
                            { success: false, error: 'Session expired' });
                    }).catch(() => {
                        responseSent = true;
                        sendResponse({ success: false, error: 'Could not store session' });
                    });
                } else if (remainingAttempts > 0) {
                    remainingAttempts -= 1;
                    console.log(`⌛ Background: Waiting for jobgen_jwt cookie (${remainingAttempts} attempts left)...`);
                    setTimeout(attemptGetCookie, retryDelayMs);
                } else {
                    console.log('❌ Background: jobgen_jwt cookie not found after waiting');
                    responseSent = true;
                    sendResponse({ success: false, error: 'Background: JWT cookie not found after waiting.' });
                }
            });
        };
        
        attemptGetCookie();
        return true; // Required for async response
    }
    
    if (message.action === "JOBGEN_AUTH_DETECTED") {
        console.log("✅ Background: JobGen auth detected on candidates.jobgen.ai tab");
        const jobgenTabId = sender?.tab?.id ?? null;

        // Broadcast AUTH_SUCCESS to all other tabs so LoginView can react
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                if (tab.id !== jobgenTabId) {
                    chrome.tabs.sendMessage(tab.id, { action: 'AUTH_SUCCESS' }, () => {
                        // Ignore errors — most tabs won't have the content script
                        if (chrome.runtime.lastError) { /* Optional operation; preserve the existing fallback. */ }
                    });
                }
            });
        });

        // Close the jobgen tab after a short delay so the page finishes rendering
        if (jobgenTabId) {
            setTimeout(() => chrome.tabs.remove(jobgenTabId), 1500);
        }
        return false;
    }

    if (message.action === "BROADCAST_AUTOFILL") {
        broadcastAutofill(message.data, sender).then(sendResponse);

        return true; // Required for async response
    }
});

// Handle tab events for simple Seek flow
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && (tab.url?.includes('seek.com.au') || tab.url?.includes('au.seek.com'))) {
        // Check if there's an active simple flow
        chrome.storage.local.get(['simpleSeekFlow'], (result) => {
            if (result.simpleSeekFlow?.active) {
                console.log('🔄 Simple Seek flow active, continuing in tab:', tabId);
                
                // Send continue message
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'CONTINUE_SIMPLE_SEEK_FLOW'
                    }, (_response) => {
                        if (chrome.runtime.lastError) {
                            console.log('⚠️ Could not send continue message:', chrome.runtime.lastError.message);
                        } else {
                            console.log('✅ Continue message sent successfully');
                        }
                    });
                }, 1000);
            }
        });
    }
});

// Handle tab closure - cleanup flows and locks immediately
chrome.tabs.onRemoved.addListener((tabId, _removeInfo) => {
    console.log('🗑️ Tab closed:', tabId);
    
    // Simple cleanup for closed tab
    chrome.storage.local.get(['seekSimpleFlow'], (result) => {
        if (result.seekSimpleFlow?.active) {
            console.log('🧹 Cleaning up Seek flow for closed tab');
            chrome.storage.local.remove(['seekSimpleFlow'], () => {
                console.log('✅ Seek flow cleaned up for closed tab');
            });
        }
    });
});


// Handle extension sign-out if main website sign-out
function isJobgenJWTCookie(cookie) {
  if (!cookie) return false;
  if (cookie.name !== JWT_COOKIE_NAME) return false;
  if (!cookie.domain) return false;
  const domain = cookie.domain.replace(/^\./, '');
  return domain === 'jobgen.ai' || domain.endsWith('.jobgen.ai') || domain === 'jobgen-b2c-api.onrender.com';
}

function logOut(reason) {
  chrome.storage.local.clear(() => {
    if (chrome.runtime.lastError) {
      console.error('❌ Background: Error clearing local storage:', chrome.runtime.lastError);
      return;
    }
    console.log(`🚪 Background: Cleared local storage (${reason})`);
  });
}

chrome.cookies.onChanged.addListener((changeInfo) => {
    const { cookie, removed, cause } = changeInfo;
    if (!removed) {
        return;
    }
    if (!isJobgenJWTCookie(cookie)) {
        return;
    }

    chrome.storage.local.get(['jobgen_session_token', 'jobgen_jwt_token'], (result) => {
        const jobgen_session_token = result.jobgen_session_token || result.jobgen_jwt_token;
        if (!jobgen_session_token) {
            console.log('ℹ️ Background: jobgen_jwt removed but extension not signed in; ignoring');
            return;
        }

        findSessionCookie((existingCookie) => {
            if (existingCookie) {
                console.log('ℹ️ Background: jobgen_session cookie still present after change; no sign-out needed');
                return;
            }

            console.log(`🚪 Background: jobgen_session cookie removed (${cause}); signing extension out`);
            logOut('jobgen.ai session ended');
        });
    });
});
