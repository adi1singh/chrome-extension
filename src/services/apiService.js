import { apiFetch } from './httpClient.js';
import { getSessionToken, setSessionToken, clearSession, readStorage } from './session.js';

// API service functions for Bubble.io integration

// Failure per spec sometimes returns { status:"success", response:{ error:"403" } }
function handleForbiddenResponse(apiName, data) {
  if (data?.response?.status === "403") {
    console.error(`❌ ${apiName} token invalid / user not found (403)`, data);
    chrome.storage.local.remove(["jobgen_session_token", "jobgen_jwt_token"]);
    return true;
  }
  return false;
}

// Combined JWT function that handles fetching, validation, and storage
export async function getJWT() {
  try { return await getSessionToken(); } catch { return null; }
}


export async function sendLinkedinDetailsToBubble(profileDescription, providedProfileUrl) {
  try {
    const jwt = await getJWT();
    if (!jwt) {
      return null;
    }

    const profileUrl = (() => {
      if (typeof providedProfileUrl === 'string' && providedProfileUrl.trim().length > 0) {
        return providedProfileUrl.trim();
      }
      return window.location.href;
    })();

    // const body = JSON.stringify({
    //   profile_url: "https://linkedin.com/in/kushbhatia",
    //   description: "We are hiring an admin support officer...",
    // });

    const body = JSON.stringify({
      profile_url: profileUrl,
      description: profileDescription
    });

    console.log('=== linkedin_data API payload:', JSON.parse(body));
    const response = await apiFetch(
      "https://candidates.jobgen.ai/api/1.1/wf/jobgen_linkedin_data",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json"
        },
        body: body
      }
    );

    const data = await response.json();
    // const data = {
    //   "status": "success",
    //   "response": {
    //       "answer": "{\n  \"Short Summary\": \"The profile currently lacks clarity and detail, significantly limiting its appeal to recruiters. Alice's background as a student at UNSW offers a foundation for growth, but it requires a stronger presentation of skills and experiences. Immediate improvements are needed in the About section, experience clarity, and a focused skill set.\",\n  \"Profile Score\": \"35\",\n  \"Headline Suggestions\": [\n    \"Aspiring Professional | UNSW Student Specializing in [Field of Study]\",\n    \"Emerging Talent in [Relevant Industry] | Passionate Learner and Innovator\",\n    \"Future Leader | Building Skills in [Specific Skills/Technologies]\"\n  ],\n  \"Improved About Section\": \"Dedicated and motivated student at UNSW, pursuing a degree in [Field of Study]. Passionate about applying theoretical knowledge to real-world challenges, with a focus on [specific interest or project area]. Eager to leverage my skills in [specific skills] and contribute to innovative projects that drive meaningful change.\",\n  \"Experience Improvement\": [\n    \"Student at UNSW - No improvement needed\",\n    \"Add experience - Clarify and highlight relevant projects or roles undertaken during studies.\"\n  ],\n  \"Education Improvement\": [\n    \"Degree at UNSW - Specify major or concentration to highlight focus area and relevance.\"\n  ],\n  \"Skills Improvement\": [\n    \"Project Management\",\n    \"Data Analysis\",\n    \"Research Methodologies\",\n    \"Communication Skills\",\n    \"Team Collaboration\",\n    \"Critical Thinking\",\n    \"Time Management\",\n    \"Presentation Skills\",\n    \"Problem Solving\",\n    \"Technical Proficiency in [Relevant Software/Tools]\"\n  ]\n}",
    //       "status": "403",
    //       "profile_url": "https://www.linkedin.com/in/alice-baker-b72403371/"
    //   }
    // }
    console.log('=== linkedin_data API response:', structuredClone(data));

    if (handleForbiddenResponse('linkedin_data API', data)) {
      return null;
    }

    // Success: { status: "200", answer: "..." }
    if (response.ok && (data?.response?.status === "200") && data?.response?.answer) {
      let ans = data.response.answer;
      // If the API returns a JSON string, parse it
      if (typeof ans === "string") {
        try { ans = JSON.parse(ans); } catch { /* Optional operation; preserve the existing fallback. */  }
      }
      if (ans && typeof ans === "object") {
        ans.profileMismatch = "no";
        return ans;
      }
      return data.response.answer;
    }

    // 401: "Profile mismatch or unauthorized access."
    // Then add a profileMismatch field inside data?.response?.answer
    if (data?.response?.status === "401") {
      let ans = data.response;

      // If the API returns a JSON string, parse it
      if (typeof ans === "string") {
        try { ans = JSON.parse(ans); } catch { /* Optional operation; preserve the existing fallback. */  }
      }

      if (ans && typeof ans === "object") {
        ans.profileMismatch = "yes";
        return ans;
      }

      return ans; // fall back returning the original
    }
    console.warn("⚠️ Unexpected response format:", data);
    return null;
  } catch (error) {
    console.error("❌ API Error:", error);
    return null;
  }
}

// TODO: remove sendJobDetailsToBubble after Indeed implement with getJobMatch instead of sendJobDetailsToBubble
export async function sendJobDetailsToBubble(jobTitle, company, jobDetails, jobId, jobPortal) {
  try {
    const jwt = await getJWT();
    if (!jwt) return null;
    const body = JSON.stringify({
      job_title: jobTitle,
      company: company,
      description: jobDetails,
      job_id: jobId,
      job_portal: jobPortal
    });
    console.log('=== job_match API payload:', JSON.parse(body));

    const response = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_job_match", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "Content-Type": "application/json"
      },
      body: body
    });
    const data = await response.json();
    console.log('=== job_match API response:', data);

    if (handleForbiddenResponse('job_match API', data)) {
      return null;
    }

    if (data && data.response?.status === "200") {
      return data.response;
    } else {
      console.warn("⚠️ Unexpected response format:", data);
      return null;
    }
  } catch (error) {
    console.error("❌ API Error:", error);
    return null;
  }
}

// Function to fetch user profile data
export async function fetchUserFAQData() {
  try {
    // Get JWT token for authentication
    const jwtToken = await getJWT();
    if (!jwtToken) {
      console.error("❌ No valid JWT token for FAQ data fetch");
      return null;
    }

    const body = JSON.stringify({});
    console.log('=== FAQ API payload:', JSON.parse(body));

    const res = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_faq", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwtToken}`,
        "Content-Type": "application/json"
      },
      body: body
    });

    const data = await res.json();
    console.log('=== FAQ API response:', data);

    // Success per spec: { status:"success", response:{...} }
    if (res.ok && data?.response?.status === "200") {
      chrome.storage.local.set(
        {
          user_faq_data: data.response,
          user_faq_timestamp: Date.now(),
          user_faq_session: jwtToken,
        },
        () => console.log("💾 FAQ data stored locally:", Object.keys(data.response))
      );
      return data.response;
    }

    if (handleForbiddenResponse('FAQ API', data)) {
      return null;
    }

    console.warn("⚠️ Unexpected response format:", data);
    return null;
  } catch (error) {
    console.error("❌ Error during FAQ data fetch:", error);
    return null;
  }
}

// Helper function to get stored FAQ data
export async function getStoredFAQData() {
  const token = await getJWT();
  if (!token) return null;
  const stored = await readStorage(['user_faq_data', 'user_faq_timestamp', 'user_faq_session']);
  if (stored.user_faq_session === token && Date.now() - stored.user_faq_timestamp < 5 * 60 * 1000) {
    return stored.user_faq_data;
  }
  return fetchUserFAQData();
}

// Helper function to clear stored FAQ data
export async function clearStoredFAQData() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['user_faq_data', 'user_faq_timestamp', 'user_faq_session'], () => {
      console.log("🗑️ Stored FAQ data cleared");
      resolve();
    });
  });
}

/**
 * Helper function to check if a value is empty
 */
function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' || trimmed.toLowerCase() === 'null';
  }
  return false;
}

/**
 * Check if FAQ data is complete and user has finished onboarding
 * This checks ALL fields in the FAQ data to ensure nothing is empty
 * @param {Object} faqData - The FAQ data object to check
 * @returns {Object} - { isComplete: boolean, missingFields: Array, emptyFieldCount: number }
 */
export function checkOnboardingComplete(faqData) {
  if (!faqData || faqData.status !== "200") {
    return {
      isComplete: false,
      missingFields: ['All data'],
      emptyFieldCount: 0,
      message: 'FAQ data not loaded or status abnormal'
    };
  }

  const missingFields = [];
  let emptyFieldCount = 0;

  // Parse JSON strings helper
  const parseJSON = (str) => {
    if (!str || typeof str !== 'string') return null;
    try {
      return JSON.parse(str);
    } catch (_e) {
      console.warn('⚠️ Failed to parse JSON:', str);
      return null;
    }
  };

  // ============ Check Personal Info ============
  const personalInfo = parseJSON(faqData.personal_info);
  const missingPersonalFields = [];

  if (personalInfo) {
    const personalFields = [
      'salutation', 'first_name', 'last_name', 'date_of_birth',
      'email', 'phone', 'phone_country_code', 'citizenship', 'linkedin',
      ///'website_url', 'github'
    ];

    personalFields.forEach(field => {
      if (isEmptyValue(personalInfo[field])) {
        emptyFieldCount++;
        missingPersonalFields.push(field);
      }
    });

    // Check address (part of Personal Info)
    const address = personalInfo.user_address;
    if (address) {
      const addressFields = [//'street_no', 'street_name',
        'city', 'state', 'state_code', //'post_code', 
        'country', 'address'];
      addressFields.forEach(field => {
        if (isEmptyValue(address[field])) {
          emptyFieldCount++;
          missingPersonalFields.push(field);
        }
      });
    } else {
      emptyFieldCount += 8;
      missingPersonalFields.push('user_address');
    }

    if (missingPersonalFields.length > 0) {
      missingFields.push('Personal Info');
    }
  } else {
    emptyFieldCount += 20;
    missingFields.push('Personal Info');
    missingPersonalFields.push('all_personal_info');
  }

  // ============ Check Work Preferences ============
  const workPrefs = parseJSON(faqData.work_preferences);
  const missingWorkFields = [];

  if (workPrefs) {
    const workFields = [
      'job_title', 'industry', 'preferred_working_type', 'preferred_working_model',
      //'application_volume_preference', 
      'can_you_relocate', 'when_can_you_relocate',
      'willing_to_travel', 'when_available_to_start', 'current_notice_period',
      'salary_expectation', 'salary_currency_code', 'future_sponsorship_required',
      'legally_authorise_to_work', 'work_authorisation_status', 'residing_in_country'
    ];

    workFields.forEach(field => {
      // Skip when_can_you_relocate if can_you_relocate is "no"
      if (field === 'when_can_you_relocate') {
        const canRelocate = workPrefs['can_you_relocate'];
        if (canRelocate && typeof canRelocate === 'string' && canRelocate.trim().toLowerCase() === 'no') {
          // Skip checking when_can_you_relocate if can_you_relocate is "no"
          return;
        }
      }

      if (isEmptyValue(workPrefs[field])) {
        emptyFieldCount++;
        missingWorkFields.push(field);
      }
    });

    // Check search location
    const searchLocation = workPrefs.search_location;
    if (searchLocation) {
      if (isEmptyValue(searchLocation.city) || isEmptyValue(searchLocation.country)) {
        emptyFieldCount += 2;
        if (isEmptyValue(searchLocation.city)) missingWorkFields.push('search_location.city');
        if (isEmptyValue(searchLocation.country)) missingWorkFields.push('search_location.country');
      }
    } else {
      emptyFieldCount += 2;
      missingWorkFields.push('search_location');
    }

    if (missingWorkFields.length > 0) {
      missingFields.push('Work Preferences');
    }
  } else {
    emptyFieldCount += 18;
    missingFields.push('Work Preferences');
    missingWorkFields.push('all_work_preferences');
  }


  const isComplete = missingFields.length === 0 && emptyFieldCount === 0;
  const _hasRecommendedFields = false; // No longer checking recommended fields

  // missingBasicInfo is no longer used since we removed resume check
  const _missingBasicInfo = false;

  // missingDetailedInfo is true if personal_info (including address) or work_preferences has empty fields
  const missingDetailedInfo = missingFields.some(field =>
    field === 'Personal Info' ||
    field === 'Work Preferences'
  );

  console.log('🔍 Onboarding completeness check:', {
    isComplete,
    emptyFieldCount,
    missingFieldsCount: missingFields.length,
    missingFields,
    missingDetailedInfo
  });

  return {
    isComplete,
    missingFields,
    emptyFieldCount,
    missingPersonalFields,
    missingWorkFields,
    recommendedMissingFields: [],
    hasRecommendedFields: false,
    missingBasicInfo: false,
    missingDetailedInfo,
    message: isComplete ? 'Onboarding completed' : `Found ${emptyFieldCount} empty fields, onboarding required`
  };
}

/**
 * Get JWT token from JobGen.AI cookies using background script
 * @returns {Promise<string|null>} JWT token or null if not found
 */
export async function getJWTFromCookies() {
  try {
    console.log('🍪 Requesting JWT cookie from background script...');

    // Check if chrome.runtime is available
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.log('❌ Chrome runtime API not available');
      return null;
    }

    return new Promise((resolve) => {
      console.log('🔍 Sending message to background script...');
      chrome.runtime.sendMessage(
        { action: 'getJWTCookie' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('❌ Error communicating with background script:', chrome.runtime.lastError);
            resolve(null);
            return;
          }

          if (response && response.success) {
            console.log('✅ JWT cookie retrieved via background script');
            console.log('🔍 Cookie details:', response.cookie);
            console.log('🔍 JWT length:', response.jwt?.length);
            setSessionToken(response.jwt).then(valid => resolve(valid ? response.jwt : null)).catch(() => resolve(null));
          } else {
            console.log('❌ Failed to get JWT cookie:', response?.error || 'Unknown error');
            resolve(null);
          }
        }
      );
    });
  } catch (error) {
    console.error('❌ Error in getJWTFromCookies:', error);
    return null;
  }
}

/**
 * Check JWT in extension storage and handle authentication flow
 * @returns {Promise<Object>} Authentication status object
 */
export async function checkJWTAuthentication() {
  try {
    console.log('🔍 Checking JWT authentication...');

    // Check if chrome.storage is available
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      console.log('❌ Chrome storage API not available');
      return {
        isAuthenticated: false,
        hasJWT: false,
        message: 'Chrome storage API not available',
        error: true
      };
    }

    // Check both storage keys for backwards compatibility
    const jwtToken = await getJWT();

    if (jwtToken && jwtToken.length > 0) {
      console.log('✅ JWT found in storage - user is authenticated');
      return {
        isAuthenticated: true,
        hasJWT: true,
        message: 'User is authenticated'
      };
    }

    console.log('❌ No JWT found in storage - attempting cookie lookup via background...');

    const jwtFromCookies = await getJWTFromCookies();

    if (jwtFromCookies) {
      console.log('✅ JWT retrieved from cookies and saved');
      return {
        isAuthenticated: true,
        hasJWT: true,
        message: 'JWT retrieved from cookies and saved',
        fromCookies: true
      };
    } else {
      console.log('❌ JWT not found in cookies either');
      return {
        isAuthenticated: false,
        hasJWT: false,
        message: 'Please log in to JobGen.AI',
        needsLogin: true
      };
    }

  } catch (error) {
    console.error('❌ Error in JWT authentication check:', error);
    return {
      isAuthenticated: false,
      hasJWT: false,
      message: 'Error checking authentication: ' + error.message,
      error: true
    };
  }
}

/**
 * Submit a job application and receive tailored resume and cover letter
 * @param {Object} jobApplicationData - The job application data
 * @param {string} jobApplicationData.job_url - URL of the job the user is applying to
 * @param {string} jobApplicationData.description - Full job description text
 * @param {string} jobApplicationData.cover_letter - Whether a cover letter is requested ("yes" or "no")
 * @param {string} jobApplicationData.company - Company name
 * @param {string} jobApplicationData.job_title - Job title
 * @param {string} jobApplicationData.job_url_id - The job id in the url
 * @param {string} jobApplicationData.job_portal - The portal job is being attempted to apply on
 * @returns {Promise<Object|null>} - Returns job application response or null if failed
 */
export async function submitJobApplication(jobApplicationData) {
  try {
    // Validate input data is not null/undefined
    if (!jobApplicationData || typeof jobApplicationData !== 'object') {
      console.error("❌ Invalid job application data: must be a non-null object");
      return { error: "INVALID_INPUT_DATA" };
    }


    // Get valid JWT token
    const jwtToken = await getJWT();
    if (!jwtToken) {
      console.error("❌ No valid JWT token available for job application");
      return { error: "TOKEN_INVALID" };
    }

    // Validate required fields
    const requiredFields = ['job_url', 'description', 'cover_letter', 'company', 'job_title', 'job_url_id', 'job_portal'];
    for (const field of requiredFields) {
      if (!jobApplicationData[field]) {
        console.error(`❌ Missing required field: ${field}`);
        return { error: `MISSING_FIELD_${field.toUpperCase()}` };
      }
    }

    // Validate cover_letter field
    if (!['yes', 'no'].includes(jobApplicationData.cover_letter.toLowerCase())) {
      console.error("❌ cover_letter must be 'yes' or 'no'");
      return { error: "INVALID_COVER_LETTER_VALUE" };
    }

    // Check tailored resume switch state
    let updatedResume = "no";
    try {
      const result = await chrome.storage.local.get(['tailored_resume_enabled']);
      const isTailoredEnabled = result.tailored_resume_enabled || false;
      updatedResume = isTailoredEnabled ? "yes" : "no";
      console.log(`📄 Tailored resume switch: ${isTailoredEnabled ? 'ON' : 'OFF'} → updated_resume: "${updatedResume}"`);
    } catch (error) {
      console.warn('⚠️ Could not check tailored resume switch, defaulting to "no":', error);
      updatedResume = "no";
    }

    const body = JSON.stringify({
      job_url: jobApplicationData.job_url,
      description: jobApplicationData.description,
      cover_letter: jobApplicationData.cover_letter,
      company: jobApplicationData.company,
      job_title: jobApplicationData.job_title,
      job_id: jobApplicationData.job_url_id,
      job_portal: jobApplicationData.job_portal,
      updated_resume: updatedResume
    })
    console.log('=== Apply API payload:', JSON.parse(body));
    // Make API request
    const response = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_apply", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwtToken}`,
        "Content-Type": "application/json"
      },
      body: body
    });

    if (!response.ok) {
      console.error("❌ Apply API HTTP Error:", response.status, response.statusText);
      return { error: "HTTP_ERROR", status: response.status };
    }

    const data = await response.json();
    console.log('=== Apply API response:', data);

    if (handleForbiddenResponse('Apply API', data)) {
      return { error: "TOKEN_INVALID" };
    }

    // Handle error responses
    if (data.error) {
      console.error("❌ Apply API returned error:", data.error);

      // Handle specific errors
      if (data.error === "TOKEN_INVALID") {
        console.log("🔄 Token invalid, requesting new one...");
        // Trigger token refresh
        await clearSession(jwtToken);
        await getJWTFromCookies();
      }

      return { error: data.error };
    }

    // Handle successful response - check for nested response structure
    if (data.status === "success" && data.response) {
      const responseData = data.response;

      if (responseData.resume) {
        return {
          success: true,
          resume: responseData.resume,
          cover_letter: responseData.cover_letter,
          job_id: responseData.job_id
        };
      }
    }

    // Handle direct response format (fallback)
    if (data.resume) {
      return {
        success: true,
        resume: data.resume,
        cover_letter: data.cover_letter,
        job_id: data.job_id
      };
    }

    // Unexpected response format
    console.warn("⚠️ Apply API Unexpected job application response format:", data);
    return { error: "UNEXPECTED_RESPONSE_FORMAT" };

  } catch (error) {
    console.error("❌ Apply API Error during job application submission:", error);
    return { error: error.code || "NETWORK_ERROR", details: error.message, status: error.status };
  }
}

/**
 * Check whether the current authenticated user has access to apply/autofill features.
 * This reuses the apply API and interprets HTTP 402 as "subscription required".
 *
 * @returns {Promise<{subscribed: boolean, status?: number, error?: string, details?: string}>}
 */
export async function checkUserSubscriptionStatus() {
  try {
    const jwtToken = await getJWT();
    if (!jwtToken) {
      console.warn("⚠️ Cannot verify subscription without JWT token");
      return { subscribed: false, error: "TOKEN_INVALID" };
    }

    // The company must provide a side-effect-free entitlement endpoint.
    // Unknown entitlement must not be represented as an unsubscribed user.
    const endpoint = import.meta.env?.VITE_SUBSCRIPTION_URL;
    if (!endpoint) return { subscribed: null, error: 'SUBSCRIPTION_CHECK_UNAVAILABLE' };
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' || !['candidates.jobgen.ai', 'api.jobgen.ai', 'jobgen-b2c-api.onrender.com'].includes(parsed.hostname)) {
      return { subscribed: null, error: 'INVALID_SUBSCRIPTION_ENDPOINT' };
    }
    const response = await apiFetch(endpoint, {
      method: 'GET', headers: { Authorization: `Bearer ${jwtToken}` }
    });

    if (response.status === 402) {
      console.warn("🔒 Subscription required (HTTP 402) while checking apply access");
      return { subscribed: false, status: 402 };
    }

    if (!response.ok) {
      console.error("❌ Subscription check HTTP error:", response.status, response.statusText);
      return { subscribed: false, status: response.status, error: "HTTP_ERROR" };
    }

    let data = null;
    try {
      data = await response.json();
    } catch (parseError) {
      console.warn("⚠️ Subscription check response is not JSON", parseError);
    }

    if (data && handleForbiddenResponse('Subscription check (apply API)', data)) {
      return { subscribed: false, status: 403, error: "TOKEN_INVALID" };
    }

    const nestedStatus = data?.response?.status ?? data?.status;
    const normalizedStatus = typeof nestedStatus === 'string' ? nestedStatus.trim() : nestedStatus;

    if (normalizedStatus === 402 || normalizedStatus === "402") {
      console.warn("🔒 Subscription required (Bubble payload status 402)", data?.response || data);
      return {
        subscribed: false,
        status: 402,
        reason: data?.response?.reason || data?.reason || 'Subscription inactive'
      };
    }

    const subscribed = data?.subscribed ?? data?.response?.subscribed;
    if (typeof subscribed !== 'boolean') return { subscribed: null, error: 'INVALID_SUBSCRIPTION_RESPONSE' };
    return { subscribed };
  } catch (error) {
    console.error("❌ Subscription check failed:", error);
    return { subscribed: error.code === "SUBSCRIPTION_REQUIRED" ? false : null, error: error.code || "NETWORK_ERROR", details: error.message, status: error.status };
  }
}

/**
 * Submit job application outcome to JobGen.AI for analytics tracking
 * @param {Object} outcomeData - The outcome data object
 * @param {string} outcomeData.application_status - Status: "Applied", "Failed", "Withdrawn", "Need review"
 * @param {string} outcomeData.job_id - Internal job ID from database
 * @param {string} outcomeData.error_code - Optional error code for failures
 * @param {string} outcomeData.job_portal - Platform name (e.g., "SEEK", "LinkedIn")
 * @returns {Promise<Object|null>} - Returns outcome response or null if failed
 */
export async function submitJobApplicationOutcome(outcomeData) {
  try {
    // Validate input data
    if (!outcomeData || typeof outcomeData !== 'object') {
      console.error("❌ Invalid outcome data: must be a non-null object");
      return { error: "INVALID_INPUT_DATA" };
    }

    // Get valid JWT token
    const jwtToken = await getJWT();
    if (!jwtToken) {
      console.error("❌ No valid JWT token available for outcome submission");
      return { error: "TOKEN_INVALID" };
    }

    // Validate required fields
    const requiredFields = ['application_status', 'job_id', 'job_portal'];
    for (const field of requiredFields) {
      if (!outcomeData[field]) {
        console.error(`❌ Missing required field: ${field}`);
        return { error: `MISSING_FIELD_${field.toUpperCase()}` };
      }
    }

    // Validate application_status values
    const validStatuses = ['Applied', 'Failed', 'Withdrawn', 'Need review'];
    if (!validStatuses.includes(outcomeData.application_status)) {
      console.error(`❌ Invalid application_status: ${outcomeData.application_status}. Must be one of: ${validStatuses.join(', ')}`);
      return { error: "INVALID_APPLICATION_STATUS" };
    }
    const body = JSON.stringify({
      application_status: outcomeData.application_status,
      job_id: outcomeData.job_id,
      error: outcomeData.error_code || "",
      job_portal: outcomeData.job_portal
    })
    console.log('=== outcome API payload:', JSON.parse(body));
    // Make API request
    const response = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_apply_outcome", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwtToken}`,
        "Content-Type": "application/json"
      },
      body: body
    });

    if (!response.ok) {
      console.error("❌ Outcome HTTP Error:", response.status, response.statusText);
      return { error: "HTTP_ERROR", status: response.status };
    }

    const responseData = await response.json();
    console.log('=== Outcome API response:', responseData);

    if (handleForbiddenResponse('Outcome API', responseData)) {
      return { error: "TOKEN_INVALID" };
    }

    return {
      success: true,
      status: responseData.status,
      data: responseData
    };

  } catch (error) {
    console.error("❌ Error submitting job application outcome:", error);
    return { error: error.code || "NETWORK_ERROR", details: error.message, status: error.status };
  }
}

/**
 * Get user's job application history/progress from JobGen.AI
 * @returns {Promise<Object|null>} - Returns progress data or null if failed
 */
function parseProgressHistory(rawHistory) {
  if (!rawHistory) return [];

  if (Array.isArray(rawHistory)) {
    return rawHistory.flatMap(item => parseProgressHistory(item));
  }

  if (typeof rawHistory === 'object') {
    if ('progress_data' in rawHistory) {
      return parseProgressHistory(rawHistory.progress_data);
    }

    const keys = Object.keys(rawHistory);
    const values = Object.values(rawHistory);

    const isNumericKeyContainer = keys.length > 0 && keys.every((key, index) => String(index) === key);
    if (isNumericKeyContainer) {
      return values.flatMap(item => parseProgressHistory(item));
    }

    return [rawHistory];
  }

  if (typeof rawHistory === 'string') {
    const trimmed = rawHistory.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      return parseProgressHistory(parsed);
    } catch (_error) {
      const normalised = trimmed
        .replace(/\r/g, '')
        .replace(/\n\s*,/g, ',')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join(',');

      const wrapped = `[${normalised}]`;
      try {
        const parsed = JSON.parse(wrapped);
        return parseProgressHistory(parsed);
      } catch (secondaryError) {
        console.error('❌ Unable to parse progress history string:', secondaryError, trimmed);
        return [];
      }
    }
  }

  return [];
}

export async function getJobProgress() {
  try {
    console.log("📊 Fetching job application progress from JobGen.AI...");

    // Get valid JWT token
    const jwtToken = await getJWT();
    if (!jwtToken) {
      console.error("❌ No valid JWT token available for progress request");
      return { error: "TOKEN_INVALID" };
    }

    // Make API request
    const body = JSON.stringify({});
    console.log('=== History API payload:', JSON.parse(body));

    const response = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_history", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwtToken}`,
        "Content-Type": "application/json"
      },
      body: body
    });

    if (!response.ok) {
      console.error("❌ Job progress HTTP Error:", response.status, response.statusText);
      return { error: "HTTP_ERROR", status: response.status };
    }

    const responseData = await response.json();
    console.log('=== History API response:', responseData);

    if (handleForbiddenResponse('History API', responseData)) {
      return { error: "TOKEN_INVALID" };
    }

    // Handle different response formats
    let jobData = [];

    // Check if response has history field as string (actual format)
    if (responseData.status === "success" && responseData.response?.history) {
      console.log("📊 Found history field, parsing string data...");
      jobData = parseProgressHistory(responseData.response.history);
      console.log("✅ Successfully parsed history data:", jobData);
    }
    // Check if response is wrapped in progress_data (alternative format)
    else if (responseData.status === "success" && responseData.response?.progress_data) {
      jobData = parseProgressHistory(responseData.response.progress_data);
    }
    // Check if response is direct array
    else if (Array.isArray(responseData)) {
      jobData = responseData;
    }
    // Check if response is string (needs parsing)
    else if (typeof responseData === 'string') {
      jobData = parseProgressHistory(responseData);
    }
    // Special case: API reports success with 200 but no history yet
    else if (responseData.status === "success" && responseData.response?.status === "200") {
      console.log("ℹ️ History API indicates no activity yet (status 200 without history).");
      return {
        success: true,
        data: [],
        raw: responseData,
        meta: { noActivity: true }
      };
    }
    // Unknown format
    else {
      console.error("❌ Unknown response format:", responseData);
      return { error: "UNKNOWN_FORMAT", details: responseData };
    }

    return {
      success: true,
      data: jobData,
      raw: responseData
    };

  } catch (error) {
    console.error("❌ Error fetching job application progress:", error);
    return { error: error.code || "NETWORK_ERROR", details: error.message, status: error.status };
  }
}

/**
 * Get job match analysis from JobGen.AI with job ID validation
 * @param {Object} jobMatchData - The job match request data
 * @param {string} jobMatchData.description - Job description text
 * @param {string} jobMatchData.company - Company name
 * @param {string} jobMatchData.job_title - Job title
 * @param {string} jobMatchData.job_id - Job ID for validation
 * @param {string} jobMatchData.job_portal - Platform name (e.g., "SEEK", "LinkedIn")
 * @returns {Promise<Object|null>} - Returns job match data or null if failed
 */
export async function getJobMatch(jobMatchData) {
  try {
    // Validate input data
    if (!jobMatchData || typeof jobMatchData !== 'object') {
      console.error("❌ Invalid job match data: must be a non-null object");
      return { error: "INVALID_INPUT_DATA" };
    }

    console.log("🎯 Requesting job match analysis:", {
      job_title: jobMatchData.job_title,
      company: jobMatchData.company,
      job_id: jobMatchData.job_id,
      job_portal: jobMatchData.job_portal
    });

    // Get valid JWT token
    const jwtToken = await getJWT();
    if (!jwtToken) {
      console.error("❌ No valid JWT token available for job match request");
      return { error: "TOKEN_INVALID" };
    }

    // Validate required fields
    const requiredFields = ['description', 'company', 'job_title', 'job_id', 'job_portal'];
    for (const field of requiredFields) {
      if (!jobMatchData[field]) {
        console.error(`❌ Missing required field: ${field}`);
        return { error: `MISSING_FIELD_${field.toUpperCase()}` };
      }
    }

    const body = JSON.stringify({
      description: jobMatchData.description,
      company: jobMatchData.company,
      job_title: jobMatchData.job_title,
      job_id: jobMatchData.job_id,
      job_portal: jobMatchData.job_portal
    });
    console.log('=== job_match API payload:', JSON.parse(body));

    // Make API request
    const response = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_job_match", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwtToken}`,
        "Content-Type": "application/json"
      },
      body: body
    });

    if (!response.ok) {
      console.error("❌ Job match HTTP Error:", response.status, response.statusText);
      return { error: "HTTP_ERROR", status: response.status };
    }

    const responseData = await response.json();
    console.log('=== job_match API response:', responseData);

    if (handleForbiddenResponse('job_match API', responseData)) {
      return { error: "TOKEN_INVALID" };
    }

    // Check for API-level errors
    if (responseData.status !== "success") {
      console.error("❌ API returned error status:", responseData);
      return { error: "API_ERROR", details: responseData };
    }

    // Debug the full response structure to find job ID
    console.log(`🔍 Full API response structure:`, responseData);
    console.log(`🔍 Response object keys:`, Object.keys(responseData.response || {}));

    // Try different possible job ID field names
    const responseJobId = responseData.response?.Job_id ||
      responseData.response?.job_id ||
      responseData.response?.jobId ||
      jobMatchData.job_id; // Fallback to request ID

    console.log(`🔍 API Response job ID validation:`, {
      requestJobId: jobMatchData.job_id,
      responseJobId: responseJobId,
      requestType: typeof jobMatchData.job_id,
      responseType: typeof responseJobId,
      idsMatch: responseJobId === jobMatchData.job_id,
      foundInResponse: !!responseData.response?.Job_id || !!responseData.response?.job_id || !!responseData.response?.jobId
    });

    if (String(responseJobId) !== String(jobMatchData.job_id)) {
      return { error: 'JOB_ID_MISMATCH' };
    }
    // Since API might not return job_id, use request job_id for validation
    const validatedJobId = responseJobId || jobMatchData.job_id;

    return {
      success: true,
      job_data: responseData.response?.job_data,
      job_found: responseData.response?.job_found,
      jobgen_job_status: responseData.response?.jobgen_job_status,
      job_id: validatedJobId,
      raw: responseData
    };

  } catch (error) {
    console.error("❌ Error requesting job match analysis:", error);
    return { error: error.code || "NETWORK_ERROR", details: error.message, status: error.status };
  }
}

/**
 * Save a job to user's dashboard in JobGen.AI
 * @param {Object} jobSaveData - The job save data object
 * @param {string} jobSaveData.job_url - Direct link to the job
 * @param {string} jobSaveData.job_id - Unique job identifier
 * @param {string} jobSaveData.job_title - Title of the job
 * @param {string} jobSaveData.company - Company name
 * @param {string} jobSaveData.job_portal - Platform (e.g., "SEEK", "LinkedIn")
 * @param {string} jobSaveData.excitement - User excitement level (1-5)
 * @param {string} jobSaveData.description - Job description text
 * @returns {Promise<Object|null>} - Returns save response or null if failed
 */
export async function saveJob(jobSaveData) {
  try {
    // Validate input data
    if (!jobSaveData || typeof jobSaveData !== 'object') {
      console.error("❌ Invalid job save data: must be a non-null object");
      return { error: "INVALID_INPUT_DATA" };
    }

    console.log("💾 Saving job to dashboard:", {
      job_url: jobSaveData.job_url,
      job_title: jobSaveData.job_title,
      company: jobSaveData.company,
      job_id: jobSaveData.job_id,
      job_portal: jobSaveData.job_portal,
      excitement: jobSaveData.excitement,
      description: jobSaveData.description ? jobSaveData.description.substring(0, 100) + '...' : 'No description'
    });

    // Get valid JWT token
    const jwtToken = await getJWT();
    if (!jwtToken) {
      console.error("❌ No valid JWT token available for job save");
      return { error: "TOKEN_INVALID" };
    }

    // Validate required fields
    const requiredFields = ['job_url', 'job_id', 'job_title', 'company', 'job_portal'];
    for (const field of requiredFields) {
      if (!jobSaveData[field]) {
        console.error(`❌ Missing required field: ${field}`);
        return { error: `MISSING_FIELD_${field.toUpperCase()}` };
      }
    }

    const body = JSON.stringify({
      job_url: jobSaveData.job_url,
      job_id: jobSaveData.job_id,
      job_title: jobSaveData.job_title,
      company: jobSaveData.company,
      job_portal: jobSaveData.job_portal,
      excitement: jobSaveData.excitement || "3",
      description: jobSaveData.description || "default description"
    });
    console.log('=== Save API payload:', JSON.parse(body));

    // Make API request
    const response = await apiFetch("https://candidates.jobgen.ai/api/1.1/wf/jobgen_save", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${jwtToken}`,
        "Content-Type": "application/json"
      },
      body: body
    });

    if (!response.ok) {
      console.error("❌ Job save HTTP Error:", response.status, response.statusText);
      return { error: "HTTP_ERROR", status: response.status };
    }

    const responseData = await response.json();
    console.log('=== Save API response:', responseData);

    if (handleForbiddenResponse('Save API', responseData)) {
      return { error: "TOKEN_INVALID" };
    }

    return {
      success: true,
      message: responseData.message,
      job_id: responseData.job_id,
      data: responseData
    };

  } catch (error) {
    console.error("❌ Error saving job:", error);
    return { error: error.code || "NETWORK_ERROR", details: error.message, status: error.status };
  }
}

/**
 * Convert an image URL to a base64 string.
 * @param {string} imageUrl - The image URL to convert
 * @param {Object} options - Optional options object { withCredentials: boolean }
 * @returns {Promise<{ mimeType: string, imageBase64: string }|{ error: string }>}
 */
export async function convertUrlToBase64(imageUrl, options = {}) {
  try {
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      console.error('❌ convertUrlToBase64: imageUrl missing or invalid');
      return { error: "MISSING_URL" };
    }
    const { withCredentials = false } = options;
    const fetchOptions = {};
    if (withCredentials) {
      fetchOptions.credentials = 'include';
    }
    const res = await fetch(imageUrl, fetchOptions);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const mimeType = blob.type || 'image/jpeg';
    const imageBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          // reader.result is like "data:image/jpeg;base64,...."
          const result = reader.result;
          const base64 = result.replace(/^data:.*;base64,/, '');
          resolve(base64);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(blob);
    });
    return { mimeType, imageBase64 };
  } catch (error) {
    console.error('❌ convertUrlToBase64 failed:', error);
    return { error: error.message };
  }
}

export async function generateProfileHeadshots({ imageUrl, withCredentials = false, style_option = 'Startup' }) {
  if (!['Corporate', 'Executive', 'Professional', 'Startup'].includes(style_option)) return { error: 'INVALID_STYLE' };
  try {
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      console.error("❌ Photo generator missing imageUrl");
      return { error: "MISSING_URL" };
    }

    // Convert image URL to base64 and infer mime type
    const result = await convertUrlToBase64(imageUrl, { withCredentials });
    if (result?.error) {
      console.error('❌ Failed to convert image URL to base64:', result.error);
      return { error: result.error };
    }

    const { mimeType, imageBase64 } = result || {};
    if (!mimeType || !imageBase64) {
      console.error("❌ Photo generator missing mimeType or image data after conversion");
      return { error: "MISSING_INPUT" };
    }

    const sanitizedImage = imageBase64.replace(/\s/g, '');

    const payload = {
      mime_type: mimeType,
      style_option: style_option,
      image_base64: sanitizedImage
    };

    console.log('=== photo generator API payload:', {
      mime_type: payload.mime_type,
      style_option: payload.style_option,
      image_base64_length: payload.image_base64.length
    });

    const endpoint = "https://api.jobgen.ai/api/nanobanana/generate";

    let lastError = null;

    try {
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      let data = null;
      try {
        data = await response.json();
      } catch (parseError) {
        console.warn("⚠️ Photo generator response not JSON:", parseError);
      }

      console.log('=== photo generator API response', structuredClone(data));

      if (response.ok && data?.status === "success" && data?.image_base64) {
        // Convert single image response to match expected format
        const styleKey = style_option.toLowerCase();
        return {
          success: true,
          data: {
            status: "200",
            [styleKey]: data.image_base64
          }
        };
      }

      return {
        error: data?.error || data?.message || "API_ERROR",
        details: data
      };
    } catch (error) {
      console.error(`❌ Photo generator network error (${endpoint}):`, error);
      lastError = error;
    }

    return {
      error: "NETWORK_ERROR",
      details: lastError
    };
  } catch (error) {
    console.error("❌ Unexpected photo generator error:", error);
    return {
      error: "UNEXPECTED_ERROR",
      details: error.message
    };
  }
}

