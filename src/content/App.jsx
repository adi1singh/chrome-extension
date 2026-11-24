import { FlowStop } from '../utils/flowGuard.js';
import { platformCapabilities } from '../utils/platformCapabilities.js';
import { apiFetch } from '../services/httpClient.js';
import { useStableCallback } from '../utils/useStableCallback.js';
import { setSessionToken } from '../services/session.js';
import { submitSeekApplication } from '../utils/seekSubmission.js';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import IconButton from '../components/IconButton';
import JobContainer from '../components/JobContainer';
import ProgressView from '../components/ProgressView';
import SeekFloatingStatus from '../components/SeekFloatingStatus';
import OnboardingReminder from '../components/OnboardingReminder';
import { LinkedInExtractor, IndeedExtractor, SeekExtractor } from '../utils/siteExtractors.js';
import * as apiService from '../services/apiService';
import { checkJWTAuthentication } from '../services/apiService';
import LoginView from '../components/LoginView';
import ProfileView from '../components/ProfileView';
import { subscribeToProgressEvents, createProgressEventHandler } from '../utils/progressBridge.js';
import { setupIndeedJobGenButtons} from '../autofill/indeed-buttons.jsx';
import * as linkedinHelpers from '../utils/linkedinHelpers.js';

const resolveProgressLabel = (mode, explicitLabel) => {
  if (explicitLabel) return explicitLabel;
  return mode === 'apply' ? 'Auto-apply running…' : 'Autofilling running…';
};

const App = () => {
  // Unified panel state management
  useEffect(() => {
    console.log('🟢 App mounted', performance.now());
    return () => console.log('🔴 App unmounted', performance.now());
  }, []);

  const [panelState, setPanelState] = useState({
    isVisible: false,
    currentView: 'main', // 'main' | 'profile' | 'login'
    isMinimized: true
  });
  const [iconButtonPosition, seticonButtonPosition] = useState({ top: '25%', right: '0px' });
  const [jobInfo, setJobInfo] = useState({
    jobTitle: '',
    companyName: '',
    jobLocation: '',
    companyLogoUrl: chrome?.runtime?.getURL ? chrome.runtime.getURL('icons/icon48.png') : ''
  });
  const [jobData, setJobData] = useState(null);
  const [hasLinkedInSelection, setHasLinkedInSelection] = useState(false);
  const [saveData, setSaveData] = useState('');
  const [currentSite, setCurrentSite] = useState('');
  const [currentUrl, setCurrentUrl] = useState(window.location.href);
  const [currentJobId, setCurrentJobId] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false); // long-lasting and sync hook for authetication
  const [authCheckComplete, setAuthCheckComplete] = useState(false); // Track if auth check has completed
  const [isSubscribed, setIsSubscribed] = useState(null);
  const [loadingJobId, setLoadingJobId] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(true); // Default to true to not block UI
  const [faqDataLoading, setFaqDataLoading] = useState(false);
  const [emptyFieldCount, setEmptyFieldCount] = useState(0);
  const [missingBasicInfo, setMissingBasicInfo] = useState(false);
  const [missingDetailedInfo, setMissingDetailedInfo] = useState(false);
  const [missingPersonalFields, setMissingPersonalFields] = useState([]);
  const [missingWorkFields, setMissingWorkFields] = useState([]);
  const [hasRecommendedFields, setHasRecommendedFields] = useState(false);
  const [recommendedMissingFields, setRecommendedMissingFields] = useState([]);
  const [progressState, setProgressState] = useState({
    mode: 'autofill',
    status: 'idle',
    label: '',
    message: '',
    error: null,
    currentPage: '',
    action: null
  });
  const [linkedinSubmitStage, setLinkedinSubmitStage] = useState(false);
  const progressAutoCloseRef = useRef(null);
  const latestLinkedInJobIdRef = useRef(null);
  const linkedinSearchPageSelectUrlRef = useRef(null);

  const refreshSubscriptionStatus = useCallback(async () => {
    try {
      const result = await apiService.checkUserSubscriptionStatus();
      const subscribed = typeof result?.subscribed === 'boolean' ? result.subscribed : null;
      setIsSubscribed(subscribed);

      if (chrome?.storage?.local) {
        chrome.storage.local.set({
          jobgen_is_subscribed: subscribed,
          jobgen_subscription_checked_at: Date.now()
        });
      }

      return subscribed;
    } catch (error) {
      console.error('❌ Failed to refresh subscription status:', error);
      setIsSubscribed(null);
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ jobgen_is_subscribed: null });
      }
      return false;
    }
  }, []);

  // read local storage for subscription status
  useEffect(() => {
    if (!chrome?.storage?.local) {
      return;
    }

    chrome.storage.local.get(['jobgen_is_subscribed'], (result) => {
      if (typeof result?.jobgen_is_subscribed === 'boolean') {
        setIsSubscribed(result.jobgen_is_subscribed);
      }
    });
  }, []);

  // clear subscription status when user is not authenticated (only after auth check completes)
  useEffect(() => {
    // only clear subscription status when auth check is complete and user is confirmed not authenticated
    if (authCheckComplete && !isAuthenticated) {
      console.log("🔒 Auth check complete - user not authenticated, clearing subscription status");
      setIsSubscribed(null);
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ jobgen_is_subscribed: null });
      }
    }
  }, [authCheckComplete, isAuthenticated]);

  const initializeSite = useStableCallback(() => detectSiteAndInitialize());
  const shouldExpandPage = useStableCallback(url => autoExpandPage(url));
  const refreshListing = useStableCallback(() => handleListingPage());
  const clearStaleLoading = useStableCallback(newJobId => {
    if (loadingJobId && loadingJobId !== newJobId) setLoadingJobId(null);
  });

  const clearProgressAutoClose = useCallback(() => {
    if (progressAutoCloseRef.current) {
      clearTimeout(progressAutoCloseRef.current);
      progressAutoCloseRef.current = null;
    }
  }, []);
  const indeedButtonsDestroyRef = useRef(null);

  useEffect(() => {
    if (currentSite !== 'linkedin') {
      setLinkedinSubmitStage(false);
      return undefined;
    }

    const interval = setInterval(() => {
      setLinkedinSubmitStage((prev) => {
        const next = Boolean(linkedinHelpers.isLinkedInSubmitStage());
        return prev === next ? prev : next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [currentSite]);


  // Helper function to check if autofill was initiated from listing page
  // ==== Initial load ====
  useEffect(() => {
    if (authChecked) return; // Prevent multiple runs
    
    console.log("🚀 Initializing extension...");
    setAuthChecked(true);
    
    // Always initialize the extension UI first
    initializeSite();
    
    // On candidates.jobgen.ai tabs opened by the extension for login, fetch the token directly
    // from the backend (same-origin with credentials so the httpOnly cookie is included)
    const isExtLoginTab = window.location.hostname === 'candidates.jobgen.ai' &&
      new URLSearchParams(window.location.search).get('ext_login') === '1';

    if (isExtLoginTab) {
      const EXT_TOKEN_URLS = [
        'https://api.jobgen.ai/auth/ext-token',
        'https://jobgen-b2c-api.onrender.com/auth/ext-token',
      ];
      let tokenRequestPending = false;
      const tryFetchToken = async () => {
        if (tokenRequestPending) return false;
        tokenRequestPending = true;
        try {
        for (const url of EXT_TOKEN_URLS) {
          try {
            const res = await apiFetch(url, { credentials: 'include', timeoutMs: 5000 });
            if (res.ok) {
              const { token } = await res.json();
              if (token) {
                const saved = await setSessionToken(token);
                if (!saved) return false;
                chrome.runtime.sendMessage({ action: 'JOBGEN_AUTH_DETECTED' });
                return true;
              }
            }
          } catch (__) { /* Optional operation; preserve the existing fallback. */ }
        }
        return false;
        } finally { tokenRequestPending = false; }
      };
      // Poll every 2s (user might land on sign-up before logging in)
      const poll = setInterval(async () => {
        const ok = await tryFetchToken();
        if (ok) clearInterval(poll);
      }, 2000);
      tryFetchToken(); // immediate first attempt
      setTimeout(() => clearInterval(poll), 300000);
      return;
    }

    // Check authentication in the background only once
    checkJWTAuthentication().then(authResult => {
      console.log("🔍 Initial authentication result:", authResult);

      const authenticated = Boolean(authResult?.isAuthenticated);
      setIsAuthenticated(authenticated);

      if (authenticated) {
        console.log("✅ User is authenticated");

        // Fetch FAQ data and check onboarding status
        loadAndCheckFAQData();

        // Refresh subscription status when authenticated
        console.log("🔄 Refreshing subscription status after authentication...");
        refreshSubscriptionStatus().catch(error => {
          console.error("❌ Failed to refresh subscription status:", error);
        });

        // Auto-open panel on specified pages
        if (shouldExpandPage(window.location.href)) {
          setPanelState(prev => ({ ...prev, isVisible: true, currentView: 'main', isMinimized: false}));
        }
      } else {
        console.log("⚠️ User not authenticated - showing login panel on job pages");
        if (shouldExpandPage(window.location.href)) {
          setPanelState(prev => ({ ...prev, isVisible: true, isMinimized: false, currentView: 'login' }));
        }
      }
      
      // Mark auth check as complete
      setAuthCheckComplete(true);
    }).catch(error => {
      console.error("❌ Error during authentication check:", error);
      setIsAuthenticated(false);
      // Mark auth check as complete even on error
      setAuthCheckComplete(true);
    });
  }, [authChecked, refreshSubscriptionStatus, initializeSite, shouldExpandPage]);

  // ==== Handle URL changes (site navigation, not job-to-job navigation) ====
  useEffect(() => {
    const handleUrlChange = () => {
      const newUrl = window.location.href;
      
      if (newUrl !== currentUrl) {
        console.log('URL changed from', currentUrl, 'to', newUrl);
        setCurrentUrl(newUrl);
        
        // Detect site changes and initialize
        initializeSite();
        
        // Auto-open panel on specified pages
        const progressActive = panelState.currentView === 'progress' && progressState.status !== 'idle';
        if (shouldExpandPage(newUrl) && !progressActive) {
          setPanelState(prev => ({ ...prev, isVisible: true, currentView: 'main', isMinimized: false}));
        }
        
        // // Reset minimized state when navigating to a different site or non-job page
        // if (!autoExpandPage(newUrl)) {
        //   console.log('new url switching to main view');
        //   setPanelState(prev => ({ ...prev,  isVisible: false, isMinimized: true }));
        // }
      }
    };

    const interval = setInterval(handleUrlChange, 500);
    return () => clearInterval(interval);
  }, [currentUrl, panelState.isMinimized, panelState.currentView, progressState.status, initializeSite, shouldExpandPage]);

  // ========= LinkedIn related hooks =========
  // ==== linkedin job card selection detection ====

  useEffect(() => {
    if (currentSite !== 'linkedin') return;
    const onLinkedInSearchPage = linkedinHelpers.isLinkedInSearchPage(currentSite, currentUrl);
    const onLinkedInJobViewPage = linkedinHelpers.isLinkedInJobViewPage(currentSite, currentUrl);
    const onProfilePage = linkedinHelpers.isLinkedInProfilePage(currentUrl);
    // console.log(`onProfilePage ${onProfilePage}, onLinkedInJobViewPage ${onLinkedInJobViewPage}, onLinkedInSearchPage ${onLinkedInSearchPage}, hasLinkedInSelection ${hasLinkedInSelection}`);
    // exclude profile page and new-tab job view page
    if (!onLinkedInSearchPage) {
      if (onProfilePage || onLinkedInJobViewPage) {
        setHasLinkedInSelection(true);
      } else {
        setHasLinkedInSelection(false);
      }
      linkedinSearchPageSelectUrlRef.current = null;
      return;
    }

    // LinkedIn now signals the active job via the job details pane instead of an active list item.
    const jobDetailsSelectors = [
      '.jobs-search__job-details--wrapper',
      '.jobs-semantic-search-job-details-wrapper',
      '.job-view-layout.jobs-details'
    ];

    let recheckTimeoutId = null;

    const updateLinkedInSelection = (attempt = 0) => {
      const jobDetailsElement = document.querySelector(jobDetailsSelectors.join(', '));
      const jobTitleElement = jobDetailsElement?.querySelector(
        '.job-details-jobs-unified-top-card__job-title h1, .jobs-unified-top-card__job-title h1, h1.t-24'
      );
      const hasJobDetailsContent = Boolean(jobTitleElement?.textContent?.trim());

      linkedinHelpers.ensureSearchResultsUrlHasJobId({
        currentUrl,
        guardRef: linkedinSearchPageSelectUrlRef,
        allowTrigger: hasJobDetailsContent
      });

      const jobId = LinkedInExtractor.getJobIdFromUrl();
      setHasLinkedInSelection(Boolean(hasJobDetailsContent && jobId));

      if (!hasJobDetailsContent && attempt < 10) {
        if (recheckTimeoutId) {
          clearTimeout(recheckTimeoutId);
        }
        recheckTimeoutId = setTimeout(() => updateLinkedInSelection(attempt + 1), 200);
      }
    };

    updateLinkedInSelection();

    return () => {
      if (recheckTimeoutId) {
        clearTimeout(recheckTimeoutId);
      }
    };
  }, [currentUrl, currentSite]);
  
  // ==== Detect LinkedIn SDUI pages that render only the shell UI and force a reload once per URL ====
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentSite !== 'linkedin') return;

    const path = window.location.pathname;
    if (path === '/jobs' || path === '/jobs/') return; // excludes job collection page

    const reloadKey = 'jobgen:linkedin:sdui:lastReloaded';
    const pageIdentifier = `${window.location.pathname}${window.location.search}`;

    const sduiCandidate = document.querySelector('div[role="main"][data-sdui-screen*="flagshipnav.jobs"]')
      || document.querySelector('[data-sdui-screen*="flagshipnav.jobs"]');

    if (!sduiCandidate) {
      try {
        if (sessionStorage.getItem(reloadKey) === pageIdentifier) {
          sessionStorage.removeItem(reloadKey);
        }
      } catch (error) {
        console.warn('Unable to clear SDUI reload state:', error);
      }
      return;
    }

    try {
      const lastReloadedFor = sessionStorage.getItem(reloadKey);

      if (lastReloadedFor === pageIdentifier) {
        console.warn('LinkedIn SDUI detected but page was already refreshed for this URL.');
        return;
      }

      console.warn('LinkedIn SDUI detected. Reloading to request the full DOM.');
      sessionStorage.setItem(reloadKey, pageIdentifier);
    } catch (error) {
      console.warn('Unable to record SDUI reload state:', error);
    }

    window.location.reload();
  }, [currentUrl,currentSite]);
  // ======== End of Linlkedin related Hooks =======

  // Helper function to detect if current URL should automatically expand the panel
  const autoExpandPage = (url) => {
    if (typeof url !== 'string') return false;

    const lowerUrl = url.toLowerCase();

    return (
      linkedinHelpers.isLinkedInProfilePage(url) || linkedinHelpers.isLinkedInJobViewPage(currentSite, url) ||
      (lowerUrl.includes('indeed') && lowerUrl.includes('/viewjob')) ||
      (lowerUrl.includes('seek') && lowerUrl.includes('/job/')) ||
      (lowerUrl.includes('microsoft') && lowerUrl.includes('/careers')) ||
      lowerUrl.includes('icims.com') ||
      lowerUrl.includes('jobgen.ai')
    );
  };

  // Helper function to get job identifier from URL
  // TODO: Redundancy to remove
  const _getJobIdentifier = (url) => {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("seek") && lowerUrl.includes("/job/")) {
      const match = url.match(/\/job\/([^/?]+)/);
      return match ? match[1] : url;
    } else if (lowerUrl.includes("linkedin") && lowerUrl.includes("/jobs/")) {
      const match = url.match(/\/jobs\/view\/(\d+)/);
      return match ? match[1] : url;
    } else if (lowerUrl.includes("indeed")) {
      const match = url.match(/jk=([^&]+)/);
      return match ? match[1] : url;
    }
    return url; // Default to full URL as identifier
  };

  // Load FAQ data and check onboarding completion status
  const loadAndCheckFAQData = async () => {
    console.log('📋 Loading FAQ data to check onboarding status...');
    setFaqDataLoading(true);
    
    try {
      const faqData = await apiService.fetchUserFAQData();
      
      if (faqData) {
        console.log('✅ FAQ data loaded successfully');
        
        // Check onboarding completion
        const result = apiService.checkOnboardingComplete(faqData);
        console.log('🔍 Onboarding check result:', result);
        
        setOnboardingComplete(result.isComplete);
        setEmptyFieldCount(result.emptyFieldCount);
        setMissingBasicInfo(result.missingBasicInfo || false);
        setMissingDetailedInfo(result.missingDetailedInfo || false);
        setMissingPersonalFields(result.missingPersonalFields || []);
        setMissingWorkFields(result.missingWorkFields || []);
        setHasRecommendedFields(result.hasRecommendedFields || false);
        setRecommendedMissingFields(result.recommendedMissingFields || []);
        
        if (!result.isComplete) {
          console.log(`⚠️ Onboarding incomplete: ${result.emptyFieldCount} empty fields`);
          console.log(`📋 Missing basic info (resume): ${result.missingBasicInfo}`);
          console.log(`📋 Missing detailed info (personal_info, work_preferences): ${result.missingDetailedInfo}`);
        }
        
        if (result.hasRecommendedFields) {
          console.log(`💡 Recommended fields: ${result.recommendedMissingFields.join(', ')}`);
        }
      } else {
        console.warn('⚠️ FAQ data fetch returned no data');
        setOnboardingComplete(true); // Don't block if we can't fetch data
      }
    } catch (error) {
      console.error('❌ Error loading FAQ data:', error);
      setOnboardingComplete(true); // Don't block on error
    } finally {
      setFaqDataLoading(false);
    }
  };

  const detectSiteAndInitialize = async () => {
    const currentUrl = window.location.href.toLowerCase();
    const onLinkedIn = currentUrl.includes("linkedin");

    if (!onLinkedIn) {
      linkedinHelpers.stopLinkedInSubmissionMonitor();
      linkedinHelpers.stopEasyApplyMonitor();
    }
    
    if (onLinkedIn) {
      setCurrentSite('linkedin');
      await initializeLinkedIn();
      linkedinHelpers.setupLinkedInJobGenButtons();
      linkedinHelpers.ensureLinkedInSubmissionMonitor();
    } else if (currentUrl.includes("indeed")) {
      setCurrentSite('indeed');
      await initializeIndeed();
    } else if (currentUrl.includes("glassdoor.com")) {
      setCurrentSite('glassdoor');
      if (glassdoorCleanupRef.current) {
        glassdoorCleanupRef.current();
        glassdoorCleanupRef.current = null;
      }
      glassdoorCleanupRef.current = await initializeGlassdoor();
    }else if (currentUrl.includes("seek")) {
      setCurrentSite('seek');
      console.log('🔍 Seek site detected, checking if should initialize...');
      await initializeSeek();
    } else if (currentUrl.includes("microsoft")) {
      setCurrentSite('microsoft');
    } else if (currentUrl.includes("icims.com")) {
      setCurrentSite('icims');
    } else if (currentUrl.includes("jobgen.ai")) {
      setCurrentSite('jobgen');
    }
  };

  const initializeLinkedIn = async () => {
    try {
      // If on a job page, get job details and send to API
       if (linkedinHelpers.isLinkedInJobPage(currentSite, currentUrl)) {
        const extractedInfo = await LinkedInExtractor.extractJobInfo();
        setJobInfo(extractedInfo);

        LinkedInExtractor.waitForJobDetails(async (jobText) => {
          setSaveData(jobText);
          console.log("Extracted Job Details:", jobText);

          const jobId = extractedInfo.jobId;
          setCurrentJobId(jobId);
          latestLinkedInJobIdRef.current = jobId;
          console.log('🔁 LinkedIn job selected:', jobId);

          if (!jobId) {
            console.warn("❌ Unable to determine LinkedIn job ID for match request");
            return;
          }

          if (!extractedInfo.jobTitle || !extractedInfo.companyName) {
            console.warn("❌ Missing required LinkedIn job fields for match request", extractedInfo);
            return;
          }

          setJobData(null); // Clear JobData before fetching a new one to reset to Loading

          // TODO: check selection before sending
          const jobMatchResult = await apiService.getJobMatch({
            description: jobText,
            company: extractedInfo.companyName,
            job_title: extractedInfo.jobTitle,
            job_id: jobId,
            job_portal: "LinkedIn"
          });

          console.log("Job Match Result from API:", jobMatchResult);

          if (jobMatchResult && jobMatchResult.success) {
            let processedData = jobMatchResult;
            const responseJobId = processedData.job_id ?? jobId;

            if (latestLinkedInJobIdRef.current && responseJobId && responseJobId !== latestLinkedInJobIdRef.current) { // if the id from the Match API response payload does not align with currnt latest jobID then don't assign
              console.log('⚠️ Ignoring stale LinkedIn job match response. Response job:', responseJobId, 'Current job:', latestLinkedInJobIdRef.current);
              return;
            }

            if (typeof jobMatchResult.job_data === "string") {
              try {
                processedData = { ...jobMatchResult, job_data: JSON.parse(jobMatchResult.job_data) };
                console.log("Parsed LinkedIn job_data:", processedData);
              } catch (error) {
                console.error("Error parsing LinkedIn job_data JSON:", error);
              }
            }

            setJobData(processedData);
          } else {
            console.error("❌ Failed to fetch LinkedIn job match data:", jobMatchResult?.error);
            setJobData({});
          }
        });
      }

    } catch (error) {
      console.error("Error initializing LinkedIn:", error);
    }
  };


// Fully self-contained Indeed initializer (store both jobInfo and jobMatch)
const initializeIndeed = async () => {
  try {
    console.log("🔍 Initializing Indeed...");

    const CURRENT_ID_KEY = "jobgen:current_job_id";

    // ----------------- helpers -----------------
    const ensureIndeedButtons = () => {
      if (!indeedButtonsDestroyRef.current) {
        console.log("✅ Setting up Indeed JobGen buttons...");
        indeedButtonsDestroyRef.current = setupIndeedJobGenButtons();
      }
    };

    const removeIndeedButtons = () => {
      if (indeedButtonsDestroyRef.current) {
        console.log("✅ Removing Indeed JobGen buttons...");
        indeedButtonsDestroyRef.current();
        indeedButtonsDestroyRef.current = null;
      }
    };

    const storageSet = (obj) =>
      new Promise((res, rej) => {
        try {
          chrome.storage.local.set(obj, () =>
            chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res()
          );
        } catch (e) {
          rej(e);
        }
      });

    const storageGet = (keys) =>
      new Promise((res, rej) => {
        try {
          chrome.storage.local.get(keys, (r) =>
            chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)
          );
        } catch (e) {
          rej(e);
        }
      });

    const getCurrentIdOnly = async () => {
      const r = await storageGet([CURRENT_ID_KEY]);
      const id = r[CURRENT_ID_KEY];
      console.log("🔑 Current job ID (from storage only):", id);
      return id || null;
};

    const isSmartApplyForm = () => {
      const h = location.hostname.toLowerCase();
      const p = location.pathname.toLowerCase();
      console.log(`📍 Checking if it's Smart Apply form: hostname=${h}, pathname=${p}`);
      return h.includes("smartapply.indeed.com") && p.includes("/indeedapply/form");
    };

    const getJobIdFromURL = () => {
      try {
        const u = new URL(location.href);
        const jobId = u.searchParams.get("jk") || u.searchParams.get("vjk") || "unknown";
        console.log(`📄 Job ID from URL: ${jobId}`);
        return jobId;
      } catch {
        return null;
      }
    };

    const normalizeJobMatch = (raw) => {
      if (!raw) return null;
      if (
        raw.status === "200" ||
        raw.status === 200 ||
        raw.job_data ||
        raw.keywords ||
        raw.skills
      ) {
        const out = { ...raw };
        if (typeof out.job_data === "string") {
          try {
            out.job_data = JSON.parse(out.job_data);
          } catch (e) {
            console.warn("job_data parse error:", e);
          }
        }
        return out;
      }
      if (raw.response && (raw.response.status === "200" || raw.response.status === 200)) {
        const out = { ...raw.response };
        if (typeof out.job_data === "string") {
          try {
            out.job_data = JSON.parse(out.job_data);
          } catch (e) {
            console.warn("job_data parse error:", e);
          }
        }
        return out;
      }
      return null;
    };

    // ----------------- JD Loader (SmartApply) -----------------
    const loadJobInfoForSmartApply = async () => {
      console.log("📦 Loading job info for SmartApply...");
      const cur = await storageGet(["jobgen:current_job_id"]);
      const currentId = cur["jobgen:current_job_id"];
      console.log(`🔍 Current job ID from storage: ${currentId}`);

      if (currentId) {
        const byCur = await storageGet([`indeed_job_${currentId}`]);
        if (byCur[`indeed_job_${currentId}`]) {
          console.log("✅ Found job in storage for current job ID");
          return byCur[`indeed_job_${currentId}`];
        }
      }

      const id = getJobIdFromURL();
      if (id) {
        const byId = await storageGet([`indeed_job_${id}`]);
        if (byId[`indeed_job_${id}`]) {
          console.log("✅ Found job in storage by job ID");
          return byId[`indeed_job_${id}`];
        }
      }

      const last = await storageGet(["jobgen:last_job_id", "jobgen:last_job_info"]);
      if (last["jobgen:last_job_id"]) {
        const byLastId = await storageGet([`indeed_job_${last["jobgen:last_job_id"]}`]);
        if (byLastId[`indeed_job_${last["jobgen:last_job_id"]}`]) {
          console.log("✅ Found job in storage for last job ID");
          return byLastId[`indeed_job_${last["jobgen:last_job_id"]}`];
        }
      }

      return last["jobgen:last_job_info"] || null;
    };

    const loadMatchForSmartApply = async (jobId) => {
      if (!jobId) return null;
      const key = `indeed_job_match_${jobId}`;
      console.log(`📦 Loading match data for job ID: ${jobId}`);
      const r = await storageGet([key]);
      return r[key] || null;
    };

    // ----------------- SmartApply branch -----------------
    if (isSmartApplyForm()) {
      console.log("✅ It's Smart Apply form!");

      removeIndeedButtons();
      setJobData?.(null);
      setJobInfo?.({
        jobTitle: "Loading...",
        companyName: "Loading...",
        jobLocation: "Loading...",
        companyLogoUrl: chrome.runtime.getURL("icons/empty.png"),
      });

      const jd = await loadJobInfoForSmartApply();
      const jobId = await getCurrentIdOnly();

      if (jd) {
        console.log("✅ Found job details:", jd);
        setJobInfo?.({
          jobTitle: jd.jobTitle || jd.job_title || "",
          companyName: jd.companyName || jd.company || "",
          jobLocation: jd.jobLocation || jd.location || jd.job_location || "",
          companyLogoUrl:
            jd.companyLogoUrl || jd.company_logo || chrome.runtime.getURL("icons/empty.png"),
        });
        const desc = jd.description || "";
        setSaveData?.(desc || "Job description not available");

        const cached = await loadMatchForSmartApply(jobId);
        if (cached) {
          console.log("✅ Found cached job match data:", cached);
          setJobData?.(
            typeof cached.job_data === "string"
              ? { ...cached, job_data: JSON.parse(cached.job_data) }
              : cached
          );
        } else if (desc && desc.length > 30) {
          console.log("🔄 Fetching job match data from API...");
          try {
            const resp = await apiService.getJobMatch({
              job_title: jd.jobTitle || jd.job_title || "",
              company: jd.companyName || jd.company || "",
              description: desc,
              job_id: jobId || "",
              job_portal: "Indeed",
            });
            const norm = normalizeJobMatch(resp);
            if (norm) {
              setJobData?.(norm);
              if (jobId) await storageSet({ [`indeed_job_match_${jobId}`]: norm });
            }
          } catch (e) {
            console.error("SmartApply match request error:", e);
          }
        }
      } else {
        console.warn("No JD found for SmartApply.");
        setSaveData?.("Job description not available");
      }

      // 根据进度状态是否为 running 来显示进度视图
      if (progressState.status === 'running') {
        console.log("📊 Progress is running, showing progress view...");
        setPanelState(prev => ({
          ...prev,
          currentView: 'progress',
          isVisible: true,
          isMinimized: false
        }));
      } else {
        console.log("📊 Progress is not running, switching to main view...");
        setPanelState(prev => ({
          ...prev,
          currentView: 'main',
          isVisible: true,
          isMinimized: false
        }));
      }

      return;
    }

    ensureIndeedButtons();
    // ----------------- Job Details Page -----------------
    const info = await IndeedExtractor.extractJobInfo();
    if (!info) return;

    console.log("✅ Extracted Indeed job info:", info);
    info.jobId = info.jobId || getJobIdFromURL() || `ts_${Date.now()}`;

    if (!info.description || info.description.trim().length < 10) {
      const fallbackDesc =
        document.querySelector(
          '[data-testid="jobsearch-JobComponent-description"]'
        )?.innerText?.trim() ||
        document.querySelector("#jobDescriptionText")?.innerText?.trim() ||
        "";
      info.description = fallbackDesc;
    }

    // construct job url via job id
    const jobUrl = `https://www.indeed.com/viewjob?jk=${info.jobId}`;

    const jdToStore = {
      jobId: info.jobId,
      job_id: info.jobId,
      job_url_id: info.jobId,
      jobTitle: info.jobTitle || "",
      job_title: info.jobTitle || "",
      companyName: info.companyName || "",
      company: info.companyName || "",
      jobLocation: info.jobLocation || info.location || info.job_location || "",
      description: info.description || "",
      url: jobUrl,
      job_portal: "Indeed",
      companyLogoUrl:
        info.companyLogoUrl ||
        info.company_logo ||
        chrome.runtime.getURL("icons/empty.png"),
      company_logo:
        info.companyLogoUrl ||
        info.company_logo ||
        chrome.runtime.getURL("icons/empty.png"),
    };

    if (window.chrome?.runtime?.id) {
      try {
        await storageSet({
          [`indeed_job_${info.jobId}`]: jdToStore,
          "jobgen:last_job_info": jdToStore,
          "jobgen:last_job_id": info.jobId,
          "jobgen:current_job_id": info.jobId,
        });
      } catch (e) {
        console.warn("Save JD to storage failed:", e);
      }
    }

    setJobInfo?.(info);
    setSaveData?.(info.description || "");
    setJobData?.(null); // Reset to trigger loading state while fetching match data

    try {
      const dataFromBubble = await apiService.getJobMatch({
        job_title: info.jobTitle,
        company: info.companyName,
        description: info.description,
        job_id: info.jobId,
        job_portal: "Indeed",
      });
      const normalized = normalizeJobMatch(dataFromBubble);
      if (normalized) {
        setJobData?.(normalized);
        try {
          await storageSet({ [`indeed_job_match_${info.jobId}`]: normalized });
        } catch (e) {
          console.warn("Save job match to storage failed:", e);
        }
      } else {
        console.warn("No job match data from getJobMatch.");
      }
    } catch (e) {
      console.error("Full match request error:", e);
    }
  } catch (error) {
    console.error("Error initializing Indeed:", error);
  }
};


const glassdoorCleanupRef = useRef(null); 

const initializeGlassdoor = async () => {
  console.log("🔍 Initializing Glassdoor...");

  // ---------- tiny helpers local to Glassdoor only ----------

  // read/write chrome.storage.local for caching (optional)
  const storageSet = (obj) =>
    new Promise((res, rej) => {
      try {
        chrome.storage.local.set(obj, () =>
          chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res()
        );
      } catch (e) {
        rej(e);
      }
    });

  const storageGet = (keys) =>
    new Promise((res, rej) => {
      try {
        chrome.storage.local.get(keys, (r) =>
          chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)
        );
      } catch (e) {
        rej(e);
      }
    });

  // normalize getJobMatch payload (like we did for seek/indeed so JobContainer won't explode)
  const normalizeJobMatch = (raw, fallbackJobId) => {
    if (!raw) {
      return {
        job_found: false,
        job_id: fallbackJobId || '',
        jobgen_job_status: "None"
      };
    }

    let out = { ...raw };

    // Bubble sometimes returns { success, job_data: "...", jobgen_job_status, job_found }
    if (typeof out.job_data === "string") {
      try {
        out.job_data = JSON.parse(out.job_data);
      } catch (e) {
        console.warn("[Glassdoor] job_data parse error:", e);
      }
    }

    // ensure minimum shape
    if (!out.job_id) out.job_id = fallbackJobId || '';
    if (!out.jobgen_job_status) out.jobgen_job_status = "None";
    if (out.job_found === undefined) out.job_found = true; // assume found unless told otherwise

    return out;
  };

  // Snapshot current job info from Glassdoor right panel
  const extractSnapshot = () => {
  // --- job title ---
  const titleEl =
    document.querySelector('h1[id^="jd-job-title-"]') ||
    document.querySelector('h1[class*="heading_Level1"]');
  const jobTitle = titleEl?.innerText?.trim() || "";

  // --- company name ---
  const companyEl =
    document.querySelector('h4[class*="heading_Subhead"]') ||
    document.querySelector('[data-test="employerName"]');
  const companyName = companyEl?.innerText?.trim() || "";

  // --- location ---
  const locEl =
    document.querySelector('[data-test="location"]') ||
    document.querySelector('[data-test="jobLocation"]');
  const jobLocation = locEl?.innerText?.trim() || "";

  // --- salary ---
  const salaryEl = document.querySelector('[data-test="detailSalary"]');
  const jobSalary = salaryEl?.innerText?.trim() || "";

  // --- logo ---
  const logoEl = document.querySelector('img[class*="avatar-base_Image"]');
  const companyLogoUrl =
    logoEl?.getAttribute("src") ||
    (chrome.runtime?.getURL?.("icons/empty.png") || "");

  // --- description ---
  const jdEl = document.querySelector('div[class*="JobDetails_jobDescription"]');
  const description = jdEl?.innerText?.trim() || "";

  // --- jobId ---
  let parsedJobId = null;
  if (titleEl) {
    const idAttr = titleEl.getAttribute("id") || "";
    const m = idAttr.match(/jd-job-title-(\d+)/);
    if (m && m[1]) parsedJobId = m[1];
  }
  if (!parsedJobId) {
    const salaryAttr = salaryEl?.getAttribute("id") || "";
    const m2 = salaryAttr.match(/jd-salary-(\d+)/);
    if (m2 && m2[1]) parsedJobId = m2[1];
  }
  if (!parsedJobId) {
    parsedJobId = (jobTitle || companyName) ? `${jobTitle}::${companyName}` : `gd_${Date.now()}`;
  }

  return {
    jobId: parsedJobId,
    jobTitle,
    companyName,
    jobLocation,
    jobSalary,
    companyLogoUrl,
    description,
  };
};

  // This is our "main updater" whenever we think job changed
  let lastSeenKey = null;
  let debounceTimer = null;

  const handlePossibleJobChange = async (reason = "unknown") => {
    const snap = extractSnapshot();
    const { jobId, jobTitle, companyName, jobLocation, companyLogoUrl, description } = snap;

    // Build a unique-ish key to detect changes
    const key = `${jobId}||${jobTitle}||${companyName}`;

    if (!jobTitle && !companyName) {
      // Right panel might still be skeleton/loading -> don't update yet
      // console.log(`[Glassdoor][${reason}] Panel not ready, skip`);
      return;
    }

    if (key === lastSeenKey) {
      // same job, do nothing
      return;
    }
    lastSeenKey = key;

    console.log(`[Glassdoor] 👉 New job detected via ${reason}:`, snap);

    // 1. update React UI immediately
    setJobInfo({
      jobTitle: jobTitle || "",
      companyName: companyName || "",
      jobLocation: jobLocation || "",
      companyLogoUrl: companyLogoUrl || (chrome.runtime?.getURL?.("icons/empty.png") || ""),
    });
    setSaveData(description || "");
    setCurrentJobId(jobId || "");

    // show panel (like seek/indeed listing pages do)
    setPanelState(prev => ({
      ...prev,
      isVisible: true,
      isMinimized: false,
      currentView: 'main'
    }));

    // 2. optimistic loading state for match info
    setJobData(null);

    // 3. try cached match first
    const matchKey = `glassdoor_job_match_${jobId}`;
    let cachedMatch = null;
    try {
      const r = await storageGet([matchKey]);
      cachedMatch = r[matchKey];
    } catch (err) {
      console.warn("[Glassdoor] storageGet error:", err);
    }

    if (cachedMatch) {
      console.log("[Glassdoor] 💾 Using cached match:", cachedMatch);
      setJobData(cachedMatch);
      return;
    }

    // 4. if we have enough info, hit API
    if (jobTitle && companyName) {
      try {
        console.log("[Glassdoor] 🔄 Fetching match via API...");
        const resp = await apiService.getJobMatch({
          description: description || "",
          company: companyName || "",
          job_title: jobTitle || "",
          job_id: jobId || "",
          job_portal: "GLASSDOOR"
        });

        const normalized = normalizeJobMatch(resp, jobId);
        console.log("[Glassdoor] ✅ Match result:", normalized);

        setJobData(normalized);

        // persist cache for future quick switch
        try {
          await storageSet({ [matchKey]: normalized });
        } catch (err) {
          console.warn("[Glassdoor] storageSet error:", err);
        }
      } catch (err) {
        console.error("[Glassdoor] ❌ getJobMatch failed:", err);
        setJobData({
          job_found: false,
          job_id: jobId,
          jobgen_job_status: "None"
        });
      }
    } else {
      // can't call API reliably
      console.warn("[Glassdoor] Missing title/company, skip API");
      setJobData({
        job_found: false,
        job_id: jobId,
        jobgen_job_status: "None"
      });
    }
  };

  // small helper to debounce mutation bursts
  const scheduleCheck = (reason) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      handlePossibleJobChange(reason);
    }, 150);
  };

  // ---------- set up observers / polling ----------

  // main right-hand job details container. based on your screenshots it's something like:
  // <div class="JobDetails_jobDetailsContainer__...">
  // We try a couple selectors, then fallback to body.
  const detailsContainer =
    document.querySelector('div[class*="JobDetails_jobDetailsContainer"]') ||
    document.querySelector('[data-test="job-details-root"]') ||
    document.querySelector('[data-test="TwoColumnLayout"]') ||
    document.body;

  // 1) MutationObserver: detect DOM changes in job details pane
  const mo = new MutationObserver(() => {
    scheduleCheck("mutation");
  });

  mo.observe(detailsContainer, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // 2) As an extra safety net (Glassdoor sometimes reuses nodes / virtualizes),
  //    we poll every 1s to compare snapshot
  const intervalId = setInterval(() => {
    handlePossibleJobChange("interval");
  }, 1000);

  // 3) Run once now so UI is populated immediately
  await handlePossibleJobChange("init");

  // ---------- return cleanup so caller can stop observers when leaving glassdoor ----------
  return () => {
    try { mo.disconnect(); } catch { /* Optional operation; preserve the existing fallback. */ }
    clearInterval(intervalId);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
};









  const initializeSeek = async () => {
    try {
      // Check if we're on a listing page (with job card container) or form page
      const currentUrl = window.location.href;
      
      // Check for job card container to detect listing page
      const jobCardContainer = document.querySelector('h1[data-automation="job-detail-title"]') ||
                               document.querySelector('article[data-job-id]') ||
                               document.querySelector('[data-automation="jobTitle"]');
      
      if (jobCardContainer && !currentUrl.includes('/apply')) {
        // LISTING PAGE: Extract and store job info
        console.log("🟠 Initializing Seek job extraction on listing page...");
        console.log("✅ Job card container found - confirmed listing page");
        
        // Setup action buttons on job detail page
        try {
          const { setupSeekJobGenButtons } = await import('../autofill/seek-buttons.jsx');
          setupSeekJobGenButtons();
        } catch (error) {
          console.error('❌ Error setting up Seek action buttons:', error);
        }
        
        await handleListingPage();
      } else if (currentUrl.includes('/apply')) {
        // FORM PAGE: Load job info by ID and display
        console.log("📋 Form page detected - loading job info by ID");
        console.log("🔍 Form page URL:", currentUrl);
        await handleFormPage();
      } else {
        console.log("🚫 Neither listing nor form page - skipping");
        return;
      }
    } catch (error) {
      console.error("❌ Error in initializeSeek:", error);
    }
  };

  const handleListingPage = async () => {
    // Get current job ID from DOM
    const detectedJobId = SeekExtractor.getCurrentJobIdentifier();
    console.log("🆔 Detected job ID from DOM:", detectedJobId);
    
    if (!detectedJobId) {
      console.log("⚠️ No job ID found - user hasn't selected a job yet");
      setJobInfo({
        jobTitle: '',
        companyName: '',
        jobLocation: '',
        companyLogoUrl: chrome.runtime.getURL("icons/empty.png")
      });
      setJobData(null);
      setSaveData('');
      setLoadingJobId(null);
      return;
    }

    // If we're already loading this job, skip
    if (loadingJobId === detectedJobId) {
      console.log(`⚠️ Already loading job ${detectedJobId}, skipping`);
      return;
    }

    // Store the current job ID immediately
    await chrome.storage.local.set({ 'current_listing_job_id': detectedJobId });
    console.log("📝 Stored current listing job ID:", detectedJobId);
    
    // STEP 1: ALWAYS extract fresh DOM data (never use cached DOM data)
    console.log(`📄 Extracting fresh DOM data for job ${detectedJobId}...`);
    const extractedInfo = await SeekExtractor.extractJobInfo();
    const jobText = await SeekExtractor.getJobDescription();
    
    // VERIFY extracted job_id matches what we expect
    const extractedJobId = SeekExtractor.getCurrentJobIdentifier();
    if (extractedJobId !== detectedJobId) {
      console.log(`❌ Extracted job_id mismatch! Expected ${detectedJobId}, got ${extractedJobId}, aborting`);
      return;
    }
    
    console.log(`✅ Extracted job info verified for job ${detectedJobId}`);
    
    // Display extracted info immediately
    setJobInfo(extractedInfo);
    setSaveData(jobText);
    
    // Store extracted job info with correct job_id
    if (extractedInfo.jobTitle || extractedInfo.companyName) {
      const jobInfoWithDescription = { 
        ...extractedInfo, 
        description: jobText,
        job_id: detectedJobId,
        job_url_id: detectedJobId
      };
      await SeekExtractor.storeJobInfo(jobInfoWithDescription);
    }
    
    // STEP 2: Check for cached MATCH data (seek_job_match_*)
    const matchStorageKey = `seek_job_match_${detectedJobId}`;
    const cachedResult = await chrome.storage.local.get([matchStorageKey]);
    const cachedMatchData = cachedResult[matchStorageKey];
    
    if (cachedMatchData) {
      // VERIFY cached match data job_id
      const dataJobId = cachedMatchData.job_id || cachedMatchData.job_url_id;
      if (dataJobId === detectedJobId) {
        console.log(`✅ Found valid cached match data for job ${detectedJobId}`);
        setJobData(cachedMatchData);
        setLoadingJobId(null);
        return;
      } else {
        console.log(`⚠️ Cached match data job_id mismatch: expected ${detectedJobId}, found ${dataJobId}, fetching fresh`);
      }
    }

    // STEP 3: No valid cached match data - fetch from API
    console.log(`🔄 No valid cached match data for job ${detectedJobId}, fetching from API`);
    
    // Mark this job as loading
    setLoadingJobId(detectedJobId);
    setJobData(null); // Show loading spinner
    
    try {
      // VERIFY we're still on this job before extracting
      const verifyResult = await chrome.storage.local.get(['current_listing_job_id']);
      if (verifyResult.current_listing_job_id !== detectedJobId) {
        console.log(`🚫 User switched away during extraction from ${detectedJobId} to ${verifyResult.current_listing_job_id}`);
        return;
      }
      
      // Extract job info from DOM
      const extractedInfo = await SeekExtractor.extractJobInfo();
      setJobInfo(extractedInfo);
      
      const jobText = await SeekExtractor.getJobDescription();
      setSaveData(jobText);
      
      // Store job info with correct job_id
      if (extractedInfo.jobTitle || extractedInfo.companyName) {
        const jobInfoWithDescription = { 
          ...extractedInfo, 
          description: jobText,
          job_id: detectedJobId,
          job_url_id: detectedJobId
        };
        await SeekExtractor.storeJobInfo(jobInfoWithDescription);
      }
      
      // Call API
      if (extractedInfo.jobTitle && extractedInfo.companyName) {
        console.log(`📡 Calling API for job ${detectedJobId}...`);
        
        const jobMatchResult = await apiService.getJobMatch({
          description: jobText,
          company: extractedInfo.companyName,
          job_title: extractedInfo.jobTitle,
          job_id: detectedJobId,
          job_portal: "SEEK"
        });
        
        // CRITICAL: Check if user is still on THIS job
        const listingResult = await chrome.storage.local.get(['current_listing_job_id']);
        const currentListingJobId = listingResult.current_listing_job_id;
        
        if (currentListingJobId !== detectedJobId) {
          console.log(`🚫 User switched from ${detectedJobId} to ${currentListingJobId}, ignoring stale response`);
          
          // Store for future but don't display
          if (jobMatchResult && jobMatchResult.success) {
            const processedData = {
              job_data: jobMatchResult.job_data,
              job_found: jobMatchResult.job_found,
              jobgen_job_status: jobMatchResult.jobgen_job_status || "None", // Default to "None"
              job_id: detectedJobId
            };
            await chrome.storage.local.set({ [matchStorageKey]: processedData });
            console.log(`💾 Stored stale response for future use: ${matchStorageKey}`);
          }
          return;
        }
        
        // User is still on this job - verify and display results
        console.log(`✅ API response received for current job ${detectedJobId}`);
        
        if (jobMatchResult && jobMatchResult.success) {
          // VERIFY the response job_id matches what we requested
          const responseJobId = jobMatchResult.job_id;
          if (responseJobId && responseJobId !== detectedJobId) {
            console.log(`⚠️ API response job_id mismatch: requested ${detectedJobId}, got ${responseJobId}`);
            setJobData({ job_found: false, job_id: detectedJobId });
            return;
          }
          
          const processedData = {
            job_data: jobMatchResult.job_data,
            job_found: jobMatchResult.job_found,
            jobgen_job_status: jobMatchResult.jobgen_job_status || "None", // Default to "None"
            job_id: detectedJobId
          };
          
          await chrome.storage.local.set({ [matchStorageKey]: processedData });
          setJobData(processedData);
          console.log(`✅ Displayed job match data for ${detectedJobId}`);
        } else {
          console.error("❌ API error:", jobMatchResult?.error);
          setJobData({ job_found: false, job_id: detectedJobId });
        }
      } else {
        // No title/company - can't call API
        console.log("⚠️ Missing job title or company, can't call API");
        setJobData({ job_found: false, job_id: detectedJobId });
      }
    } catch (error) {
      console.error("❌ Error in handleListingPage:", error);
      setJobData({ job_found: false, job_id: detectedJobId });
    } finally {
      // Clear loading state for this job
      setLoadingJobId(null);
    }
  };

  const handleFormPage = async () => {
    // Extract job ID from form page URL
    const urlMatch = window.location.href.match(/\/job\/(\d+)/);
    const jobId = urlMatch ? urlMatch[1] : null;
    
    if (!jobId) {
      console.log("⚠️ Could not extract job ID from form page URL");
      return;
    }
    
    console.log(`📋 Form page job ID: ${jobId}`);
    
    // Check for cached data FIRST
    const matchKey = `seek_job_match_${jobId}`;
    const jobInfoKey = `seek_job_${jobId}`;
    const cachedResult = await chrome.storage.local.get([matchKey, jobInfoKey]);
    const jobMatchData = cachedResult[matchKey];
    const jobInfoData = cachedResult[jobInfoKey];
    
    console.log(`🔍 Storage check for job ${jobId}:`, {
      hasMatchData: !!jobMatchData,
      hasJobInfo: !!jobInfoData
    });
    
    // VERIFY cached data job_id matches current job
    const isCachedDataValid = (data, expectedJobId, dataType) => {
      if (!data) return false;
      const dataJobId = data.job_id || data.job_url_id;
      const isValid = dataJobId === expectedJobId;
      console.log(`🔍 Validating ${dataType}: expected="${expectedJobId}", found="${dataJobId}", valid=${isValid}`);
      return isValid;
    };
    
    if (jobMatchData || jobInfoData) {
      console.log(`📦 Found cached data for form page job ${jobId}:`, {
        matchData: jobMatchData ? `job_id: ${jobMatchData.job_id}` : 'none',
        jobInfo: jobInfoData ? `job_id: ${jobInfoData.job_id || jobInfoData.job_url_id}` : 'none'
      });
      
      // Verify the cached data is for THIS job
      const matchValid = !jobMatchData || isCachedDataValid(jobMatchData, jobId, 'seek_job_match');
      const infoValid = !jobInfoData || isCachedDataValid(jobInfoData, jobId, 'seek_job_info');
      
      if (!matchValid || !infoValid) {
        console.log(`❌ Cached data job_id mismatch for ${jobId}, treating as no cache`);
      } else {
        // CACHED DATA VALID - Display immediately
        console.log(`✅ Using valid cached data for form page job ${jobId}`);
        
        if (jobMatchData) {
          setJobData(jobMatchData);
        }
        
        if (jobInfoData) {
          setJobInfo({
            jobTitle: jobInfoData.job_title || jobInfoData.jobTitle || '',
            companyName: jobInfoData.company || jobInfoData.companyName || '',
            jobLocation: jobInfoData.job_location || jobInfoData.jobLocation || '',
            companyLogoUrl: jobInfoData.company_logo || jobInfoData.companyLogoUrl || chrome.runtime.getURL("icons/empty.png")
          });
          setSaveData(jobInfoData.description || 'Job description not available');
        } else if (jobMatchData && jobMatchData.job_data) {
          const matchJobData = jobMatchData.job_data;
          setJobInfo({
            jobTitle: matchJobData.job_title || matchJobData.title || '',
            companyName: matchJobData.company || '',
            jobLocation: matchJobData.location || '',
            companyLogoUrl: chrome.runtime.getURL("icons/empty.png")
          });
          setSaveData(matchJobData.description || 'Job description not available');
        }
        
        setLoadingJobId(null);
        return;
      }
    }
    
    // NO CACHED DATA - Show loading and poll
    console.log(`⏳ No cached data, waiting for data to be available for job ${jobId}`);
    setLoadingJobId(jobId);
    setJobData(null);
    setJobInfo({
      jobTitle: 'Loading job info...',
      companyName: 'Loading...',
      jobLocation: 'Loading...',
      companyLogoUrl: chrome.runtime.getURL("icons/empty.png")
    });
    
    // Poll for data (might be coming from API call on listing page)
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check if user is still on this job
      const currentListingResult = await chrome.storage.local.get(['current_listing_job_id']);
      if (currentListingResult.current_listing_job_id !== jobId) {
        console.log(`🚫 User switched away from job ${jobId}, stopping poll`);
        return;
      }
      
      // Check for data
      const result = await chrome.storage.local.get([matchKey, jobInfoKey]);
      const newJobMatchData = result[matchKey];
      const newJobInfoData = result[jobInfoKey];
      
      if (newJobMatchData || newJobInfoData) {
        // VERIFY job_id matches before displaying
        const matchValid = !newJobMatchData || (newJobMatchData.job_id === jobId || newJobMatchData.job_url_id === jobId);
        const infoValid = !newJobInfoData || (newJobInfoData.job_id === jobId || newJobInfoData.job_url_id === jobId);
        
        if (!matchValid || !infoValid) {
          console.log(`⚠️ Data arrived but job_id mismatch for ${jobId}, continuing poll...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        console.log(`✅ Valid data arrived for job ${jobId} after ${attempt + 1} attempts`);
        
        if (newJobMatchData) setJobData(newJobMatchData);
        
        if (newJobInfoData) {
          setJobInfo({
            jobTitle: newJobInfoData.job_title || '',
            companyName: newJobInfoData.company || '',
            jobLocation: newJobInfoData.job_location || '',
            companyLogoUrl: newJobInfoData.company_logo || chrome.runtime.getURL("icons/empty.png")
          });
          setSaveData(newJobInfoData.description || 'Job description not available');
        }
        
        setLoadingJobId(null);
        return;
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Timeout - no data found
    console.log(`⚠️ No data arrived for job ${jobId} after ${maxAttempts} attempts`);
    setJobInfo({
      jobTitle: 'Job info not available',
      companyName: '',
      jobLocation: '',
      companyLogoUrl: chrome.runtime.getURL("icons/empty.png")
    });
    setSaveData('Job description not available');
    setJobData({ job_found: false, job_id: jobId });
    setLoadingJobId(null);
  };

  const handleIconButtonClick = () => {
    console.log("🔘 JobGen button clicked");
    setPanelState(prev => ({
      ...prev,
      isVisible: true,
      isMinimized: false,
      currentView: isAuthenticated ? prev.currentView : 'login'
    }));
  };

  const handleMinimize = () => {
    setPanelState(prev => ({ 
      ...prev, 
      isVisible: false, 
      isMinimized: true 
      // currentView stays the same (remembers last view)
    }));
  };

  const ensureExpand = useCallback(() => {
    setPanelState(prev => ({
      ...prev,
      isVisible: true,
      isMinimized: false,
      currentView: 'main'
    }));
  }, []);

  const handleProfileClick = () => {
    setPanelState(prev => ({ 
      ...prev, 
      currentView: 'profile'
      // isVisible stays true, isMinimized stays false
    }));
  };

  const handleViewProgress = () => {
    setPanelState(prev => ({ 
      ...prev, 
      currentView: 'progress',
      isVisible: true,
      isMinimized: false
    }));
  };

  const handleStartProgress = useCallback((mode = 'autofill', initialMessage = '') => {
    // CRITICAL: Don't start progress on Seek listing pages
    // Progress should only show on application form pages
    const currentUrl = window.location.href;
    if (currentUrl.includes('seek.com')) {
      const hasApplyButton = document.querySelector('[data-automation="job-detail-apply"]');
      const hasStepIndicator = document.querySelector('[aria-current="step"]');
      
      if (hasApplyButton && !hasStepIndicator) {
        console.log('🚫 Blocked handleStartProgress on Seek listing page - progress will start on form page');
        return; // Don't start progress on listing page
      }
    }
    
    clearProgressAutoClose();
    setProgressState({
      mode,
      status: 'running',
      label: mode === 'apply' ? 'Auto-apply running…' : 'Autofilling running…',
      message: initialMessage,
      error: null,
      currentPage: '',
      action: 'filling'
    });

    setPanelState(prev => ({
      ...prev,
      currentView: 'progress',
      isVisible: true,
      isMinimized: false
    }));
  }, [clearProgressAutoClose]);

  const handleProgressBack = useCallback(() => {
    clearProgressAutoClose();
    setPanelState(prev => ({
      ...prev,
      currentView: 'main'
    }));
  }, [clearProgressAutoClose]);

  const resetProgressState = useCallback(() => {
    setProgressState({
      mode: 'autofill',
      status: 'idle',
      label: '',
      message: '',
      error: null,
      currentPage: '',
      action: null
    });
  }, []);

  const handleProgressAutoClose = useCallback(() => {
    setPanelState(prev => ({
      ...prev,
      currentView: 'main'
    }));
    resetProgressState();
    clearProgressAutoClose();
  }, [clearProgressAutoClose, resetProgressState]);

  const scheduleProgressAutoClose = useCallback(() => { //clears any prior timer and sets a new setTimeout to call handleProgressAutoClose after the set delay
    clearProgressAutoClose();
    progressAutoCloseRef.current = setTimeout(() => {
      handleProgressAutoClose();
    }, 4000); // 4 seconds before progressView closed
  }, [clearProgressAutoClose, handleProgressAutoClose]);

  // Helper function to detect current Seek page from URL
  const detectSeekPageFromURL = useCallback(() => {
    if (currentSite !== 'seek') return '';
    
    const url = window.location.href.toLowerCase();
    
    // Check URL path to determine current step
    if (url.includes('/apply/review')) {
      return 'Review and submit';
    } else if (url.includes('/apply/profile')) {
      return 'Update SEEK Profile';
    } else if (url.includes('/apply/role-requirements')) {
      return 'Answer employer questions';
    } else if (url.includes('/apply') && !url.includes('/apply/')) {
      return 'Choose documents';
    }
    
    // Check for step indicator on page as fallback
    const stepElement = document.querySelector('[aria-current="step"]');
    if (stepElement) {
      const stepText = stepElement.textContent?.trim() || '';
      console.log('🔍 Detected page from DOM:', stepText);
      return stepText;
    }
    
    return progressState.currentPage || '';
  }, [currentSite, progressState.currentPage]);

  // Helper function to determine next button text based on current page
  const getNextButtonText = useCallback(() => {
    if (currentSite === 'linkedin') {
      console.log('🔍 getNextButtonText - LinkedIn submit stage:', linkedinSubmitStage);
      return linkedinSubmitStage ? 'Submit' : 'Next';
    }

    // Get the actual current page from URL/DOM, not just progress state
    const actualCurrentPage = detectSeekPageFromURL();
    console.log('🔍 getNextButtonText - currentSite:', currentSite, 'actualCurrentPage:', actualCurrentPage);
    
    if (currentSite === 'seek') {
      if (actualCurrentPage.includes('Review and submit')) {
        console.log('✅ Showing "Submit" button');
        return 'Submit';
      }
      console.log('✅ Showing "Next" button');
      return 'Next';
    }
    
    return 'Next';
  }, [currentSite, detectSeekPageFromURL, linkedinSubmitStage]);

  // Helper function to determine if we should hide the Autofill button
  const shouldHideAutofillButton = useCallback(() => {
    if (currentSite === 'linkedin') {
      return linkedinSubmitStage;
    }

    // Get the actual current page from URL/DOM, not just progress state
    const actualCurrentPage = detectSeekPageFromURL();
    
    if (currentSite === 'seek') {
      // Hide Autofill button on the final submit page
      return actualCurrentPage.includes('Review and submit');
    }
    
    return false;
  }, [currentSite, detectSeekPageFromURL, linkedinSubmitStage]);

  const handleProgressNext = useCallback(async () => {
  try {
    clearProgressAutoClose();

      if (currentSite === 'linkedin') {
        const module = await import('../autofill/linkedin.js');
        if (module.triggerLinkedinNext) {
          await module.triggerLinkedinNext();
        } else {
          console.warn('⚠️ LinkedIn triggerLinkedinNext not available');
        }
      } else if (currentSite === 'indeed') {
      window.dispatchEvent(
        new CustomEvent('jobgen-ui-next', { detail: { site: 'indeed', source: 'panel' } })
      );
      return;
    }
      else if (currentSite === 'seek') {
        // Get actual current page from URL/DOM
        const actualCurrentPage = detectSeekPageFromURL();
        
        // For "Review and submit" page, we submit the application
        if (actualCurrentPage.includes('Review and submit')) {
          console.log('🎯 Submitting application for Seek - clicking submit button directly');
          
          const submitButton = document.querySelector('button[data-testid="review-submit-application"]');
          setProgressState(prev => ({ ...prev, status: 'running', action: 'submitting',
            message: 'Waiting for SEEK to confirm submission…' }));
          try {
            await submitSeekApplication(submitButton);
            setProgressState(prev => ({ ...prev, status: 'completed', action: 'submitted',
              message: 'Application submitted!' }));
            scheduleProgressAutoClose();
          } catch (error) {
            setProgressState(prev => ({ ...prev, status: 'error', action: 'error',
              error: error.message, message: error.message }));
          }
        } else {
          // For other pages, click the next button
          console.log('➡️ Clicking Next button for Seek');
          
          const module = await import('../utils/seekHelpers.js');
          if (module.clickNextButton) {
            await module.clickNextButton();
            console.log('✅ Next button clicked - waiting for page to load');
          } else {
            console.warn('⚠️ Seek clickNextButton not available');
          }
        }
      } else {
        console.warn('⚠️ Progress Next not implemented for site:', currentSite);
      }
    } catch (error) {
      console.error('❌ Error handling progress Next:', error);
      const message = error instanceof FlowStop ? error.message : 'The application stopped. Review this step before continuing.';
      setProgressState(prev => ({ ...prev, status: 'error', action: 'error', error: message, message }));
    }
  }, [clearProgressAutoClose, currentSite, detectSeekPageFromURL, scheduleProgressAutoClose]);

  const handleProgressAutofill = useCallback(async () => {
    try {
      const currentURL = window.location.href.toLowerCase();
      const site = currentSite || 'unknown';

      const autofillData = {
        site,
        url: currentURL,
        action: 'autofill',
        jobData: {
          title: jobInfo.jobTitle,
          company: jobInfo.companyName,
          location: jobInfo.jobLocation
        }
      };

      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'BROADCAST_AUTOFILL',
          data: autofillData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('⚠️ Autofill broadcast error:', chrome.runtime.lastError.message);
          } else {
            console.log('✅ Progress autofill broadcast response:', response);
          }
        });
      } else {
        console.warn('⚠️ chrome.runtime not available for autofill broadcast');
      }
    } catch (error) {
      console.error('❌ Error handling progress Autofill:', error);
    }
  }, [currentSite, jobInfo]);

  // Listen for storage changes to update jobData when jobgen_job_status changes
  useEffect(() => {
    if (currentSite !== 'seek') return;
    
    const handleStorageChange = async (changes, area) => {
      if (area !== 'local') return;
      
      // Check if any seek_job_match_{jobId} was updated
      const matchKeys = Object.keys(changes).filter(key => key.startsWith('seek_job_match_'));
      
      if (matchKeys.length > 0) {
        // Get current job ID
        const result = await chrome.storage.local.get(['current_listing_job_id']);
        const currentListingJobId = result.current_listing_job_id;
        
        if (!currentListingJobId) return;
        
        const currentMatchKey = `seek_job_match_${currentListingJobId}`;
        
        // Check if the current job's match data was updated
        if (changes[currentMatchKey]) {
          const newValue = changes[currentMatchKey].newValue;
          
          console.log(`🔄 [APP_STORAGE] Job ${currentListingJobId} match data updated:`, newValue);
          
          // Update jobData state to trigger UI updates
          if (newValue) {
            setJobData(newValue);
            console.log(`✅ [APP_STORAGE] Updated jobData state for job ${currentListingJobId}`);
          }
        }
      }
    };
    
    // Add storage listener
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    // Cleanup
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [currentSite]);
  
  // DOM monitoring for Seek job content changes - focused on job content only
  useEffect(() => {
    if (currentSite !== 'seek') return;

    console.log("🟠 Setting up Seek job content monitoring...");
    
    let currentJobTitle = '';
    let currentCompanyName = '';
    let currentMonitoredJobId = '';
    let debounceTimer = null;
    
    const checkForJobChanges = () => {
      try {
        const jobTitleElement = document.querySelector('h1[data-automation="job-detail-title"]');
        
        // Try multiple selectors for company name (both container types)
        let companyElement = document.querySelector('span[data-automation="advertiser-name"]'); // Recommendation container
        if (!companyElement) {
          companyElement = document.querySelector('span[data-automation="jobCompany"]'); // Search result container  
        }
        if (!companyElement) {
          companyElement = document.querySelector('a[data-automation="jobCompany"]'); // Alternative selector
        }
        
        const newJobTitle = jobTitleElement?.innerText?.trim() || '';
        const newCompanyName = companyElement?.innerText?.trim() || '';
        const newJobId = SeekExtractor.getCurrentJobIdentifier() || '';
        
        // Check if job changed (by ID is most reliable)
        const jobIdChanged = newJobId && newJobId !== currentMonitoredJobId;
        const contentChanged = (newJobTitle && newJobTitle !== currentJobTitle) || 
                              (newCompanyName && newCompanyName !== currentCompanyName);
        
        if (jobIdChanged || contentChanged) {
          console.log("🟠 Seek job changed - JobID:", newJobId, "Title:", newJobTitle);
          
          // Update tracked values
          currentJobTitle = newJobTitle;
          currentCompanyName = newCompanyName;
          currentMonitoredJobId = newJobId;
          
          // Clear loading state if switching to a different job
          if (jobIdChanged) clearStaleLoading(newJobId);
          
          // Only trigger handleListingPage if we have actual job data
          if (newJobTitle || newCompanyName) {
            // Clear any existing timer
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            
            // Debounce the API call
            debounceTimer = setTimeout(() => {
              refreshListing();
            }, 200);
          }
        }
        
        // Clear loading state if switching to a different job
        if (jobIdChanged) clearStaleLoading(newJobId);
      } catch (error) {
        console.log("⚠️ Error checking for job changes:", error.message);
      }
    };
    
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      mutations.forEach((mutation) => {
        // Only check if changes are in the main job content area, not our extension panel
        // Check if mutation.target is an Element node before calling closest()
        if (mutation.target.nodeType === Node.ELEMENT_NODE && 
            mutation.target.closest('#jobgen-react-app')) {
          return; // Skip changes in our own extension
        }
        
        // Check if job-related elements changed
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          const relevantSelectors = [
            'h1[data-automation="job-detail-title"]',
            'span[data-automation="advertiser-name"]', // Recommendation container
            'span[data-automation="jobCompany"]', // Search result container
            'a[data-automation="jobCompany"]' // Alternative company selector
          ];
          
          relevantSelectors.forEach(selector => {
            // Check mutation target (if it's an element)
            if (mutation.target.nodeType === Node.ELEMENT_NODE) {
              if (mutation.target.matches?.(selector) || 
                  mutation.target.querySelector?.(selector)) {
                shouldCheck = true;
              }
            }
            
            // Check added nodes
            if (mutation.addedNodes && Array.from(mutation.addedNodes).some(node => 
                node.nodeType === Node.ELEMENT_NODE && 
                (node.matches?.(selector) || node.querySelector?.(selector)))) {
              shouldCheck = true;
            }
            
            // Check if parent element contains the selector (for text node changes)
            if (mutation.target.nodeType === Node.TEXT_NODE && 
                mutation.target.parentElement?.closest(selector)) {
              shouldCheck = true;
            }
          });
        }
      });
      
      if (shouldCheck) {
        checkForJobChanges();
      }
    });

    // Observe the main content area, but exclude our extension
    const targetNode = document.querySelector('main') || document.body;
    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Initial check
    checkForJobChanges();

    return () => {
      console.log("🟠 Cleaning up Seek job content monitoring...");
      observer.disconnect();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [currentSite, clearStaleLoading, refreshListing]);

  // Add global selectedStarRating variable for compatibility


  // Monitor JWT token changes in storage for real-time auth state updates
  useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.jobgen_session_token) {
        console.log('Session changed');
        
        setJobData(null);
        setSaveData('');
        setIsSubscribed(null);
        if (changes.jobgen_session_token.newValue === undefined) {
          // Token was removed/cleared
          console.log('🔑 JWT token removed, switching to login view');
          setIsAuthenticated(false);
          setPanelState(prev => ({ ...prev, currentView: 'login' }));
        } else if (changes.jobgen_session_token.newValue && panelState.currentView === 'login') {
          // Token was added and we're currently on login view
          console.log('🔑 JWT token added, switching to main view');
          setIsAuthenticated(true);
          setPanelState(prev => ({ ...prev, currentView: 'main' }));
          // Refresh subscription status when token is added
          refreshSubscriptionStatus().catch(error => {
            console.error("❌ Failed to refresh subscription status after token added:", error);
          });
        } else if (changes.jobgen_session_token.newValue) {
          setIsAuthenticated(true);
          // Refresh subscription status when token is added
          refreshSubscriptionStatus().catch(error => {
            console.error("❌ Failed to refresh subscription status after token added:", error);
          });
        }
      }
    };

    // Add storage change listener
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    // Cleanup listener on unmount
    return () => {
      if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, [panelState.currentView, refreshSubscriptionStatus]);

  // Progress changes listener (LinkedIn)
  useEffect(() => {
    const handler = createProgressEventHandler({
      site: 'linkedin',
      resolveLabel: resolveProgressLabel,
      setProgressState,
      setPanelState,
      clearAutoClose: clearProgressAutoClose,
      scheduleAutoClose: scheduleProgressAutoClose,
      resetProgressState
    });

    const unsubscribe = subscribeToProgressEvents(handler);
    return () => {
      unsubscribe();
    };
  }, [clearProgressAutoClose, scheduleProgressAutoClose, resetProgressState]);

  // Progress changes listener (Seek)
  useEffect(() => {
    const handler = createProgressEventHandler({
      site: 'seek',
      resolveLabel: resolveProgressLabel,
      setProgressState,
      setPanelState,
      clearAutoClose: clearProgressAutoClose,
      scheduleAutoClose: scheduleProgressAutoClose,
      resetProgressState
    });

    const unsubscribe = subscribeToProgressEvents(handler);
    return () => {
      unsubscribe();
    };
  }, [clearProgressAutoClose, scheduleProgressAutoClose, resetProgressState]);

    // Progress changes listener (Indeed)
  useEffect(() => {
    const handler = createProgressEventHandler({
      site: 'indeed',
      resolveLabel: resolveProgressLabel,
      setProgressState,
      setPanelState,
      clearAutoClose: clearProgressAutoClose,
      scheduleAutoClose: scheduleProgressAutoClose,
      resetProgressState
    });

    const unsubscribe = subscribeToProgressEvents(handler);
    return () => {
      unsubscribe();
    };
  }, [clearProgressAutoClose, scheduleProgressAutoClose, resetProgressState]);

  // Reset progress view when on job listing page (not in application flow)
  useEffect(() => {
    if (!currentUrl) return;
    
    // Check if we're on a Seek job listing page (not in application flow)
    if (currentUrl.includes('seek.com') && currentUrl.includes('/job/')) {
      // Use both URL and DOM checks for more accurate detection
      const isApplicationPageByUrl = currentUrl.includes('/apply');
      const hasStepIndicator = document.querySelector('[aria-current="step"]');
      const hasApplyButton = document.querySelector('[data-automation="job-detail-apply"]');
      
      // If on listing page (has apply button, no step indicator) and progress is showing, reset it
      if (hasApplyButton && !hasStepIndicator && !isApplicationPageByUrl && panelState.currentView === 'progress') {
        console.log('📋 On Seek listing page (detected via DOM + URL) - resetting progress view');
        setPanelState(prev => ({ ...prev, currentView: 'main' }));
        resetProgressState();
      }
    }
  }, [currentUrl, panelState.currentView, resetProgressState]);

  // Don't render anything if not on supported sites
  if (!currentSite) {
    return null; 
  }

  const panelShouldRender = panelState.isVisible || panelState.isMinimized; // to keeping jobcontainer hidden but non-interactive while still letting dependent hooks/state run in the background
  const isLinkedInProfile = linkedinHelpers.isLinkedInProfilePage(currentUrl);
  const jobContainerInitialTab = isLinkedInProfile ? 'linkedinTab' : undefined;

  return (
    <>
      {/* Icon Button - only visible when panel is minimized */}
      {!panelState.isVisible && currentSite !== 'jobgen' && (
        <div style={{ pointerEvents: 'auto' }}>
          <IconButton 
            onClick={handleIconButtonClick} 
            position={iconButtonPosition}
            onPositionChange={seticonButtonPosition}
          />
        </div>
      )}
      
      {/* Panel Content - keep mounted even when minimized */}
      {panelShouldRender && (
        <div
          style={{
            pointerEvents: panelState.isVisible ? 'auto' : 'none',
            display: panelState.isVisible ? 'block' : 'none'
          }}
        >
          <div style={{ display: panelState.currentView === 'main' ? 'block' : 'none' }}>
            <JobContainer
              jobTitle={jobInfo.jobTitle}
              companyName={jobInfo.companyName}
              jobLocation={jobInfo.jobLocation}
              companyLogoUrl={jobInfo.companyLogoUrl}
              onMinimize={handleMinimize}
              onProfileClick={handleProfileClick}
              jobData={jobData}
              saveData={saveData}
              currentSite={currentSite}
              onStartProgress={handleStartProgress}
              currentJobId={currentJobId}
              hasLinkedInSelection={hasLinkedInSelection}
              initialTab={jobContainerInitialTab}
              onViewProgress={handleViewProgress}
              showProgressButton={progressState.status === 'running' || progressState.status === 'completed' || progressState.status === 'error'}
              progressState={progressState}
              isAuthenticated={isAuthenticated}
              isSubscribed={isSubscribed}
              onboardingComplete={onboardingComplete}
              faqDataLoading={faqDataLoading}
              emptyFieldCount={emptyFieldCount}
              missingBasicInfo={missingBasicInfo}
              missingDetailedInfo={missingDetailedInfo}
              missingPersonalFields={missingPersonalFields}
              missingWorkFields={missingWorkFields}
              hasRecommendedFields={hasRecommendedFields}
              recommendedMissingFields={recommendedMissingFields}
              onStartOnboarding={null}
              ensureExpand={ensureExpand}
              refreshSubscriptionStatus={refreshSubscriptionStatus}
            />
          </div>

          <div style={{ display: panelState.currentView === 'progress' ? 'block' : 'none' }}>
            <ProgressView
              onBack={handleProgressBack}
              onMinimize={handleMinimize}
              detailMessage={progressState.message}
              isError={progressState.status === 'error'}
              onNext={handleProgressNext}
              onAutofill={handleProgressAutofill}
              disableAutofill={(progressState.mode === 'apply' && progressState.status !== 'error') || (progressState.action === 'filling' && progressState.status === 'running')}
              disableNext={!platformCapabilities(currentSite).autoApply || (progressState.mode === 'apply' && progressState.status !== 'error') || (progressState.action === 'filling' && progressState.status === 'running')}
              mode={progressState.mode}
              action={progressState.action || 'filling'}
              nextButtonText={platformCapabilities(currentSite).autoApply ? getNextButtonText() : 'Continue on site'}
              hideAutofillButton={shouldHideAutofillButton()}
            />
          </div>

          {panelState.currentView === 'profile' && (
            <ProfileView
              onMinimize={handleMinimize}
              onBack={() => setPanelState(prev => ({ ...prev, currentView: 'main' }))}
              onLogout={() => setPanelState(prev => ({ ...prev, currentView: 'login' }))}
              onViewProgress={handleViewProgress}
              showProgressButton={progressState.status === 'running' || progressState.status === 'completed' || progressState.status === 'error'}
            />
          )}

          {panelState.currentView === 'login' && !window.location.hostname?.toLowerCase().includes('jobgen.ai') &&(
            <LoginView
              onLogin={async () => {
                console.log('🔐 User logged in, loading FAQ data...');
                setPanelState(prev => ({ ...prev, currentView: 'main' }));
                setIsAuthenticated(true);
                await loadAndCheckFAQData();
                // check subscription status when login
                await refreshSubscriptionStatus();
              }}
              onMinimize={handleMinimize}
            />
          )}
        </div>
      )}
      
      {/* SEEK Floating Status Button - only on listing pages */}
      <SeekFloatingStatus />
    </>
  );
};

export default App;
