import { autofillStandardForm } from '../autofill/standardForm.js';
import { platformCapabilities } from '../utils/platformCapabilities.js';
import React, { useEffect, useRef, useState } from 'react';
import RingGraph from './RingGraph';
import Tooltip from './Tooltip';
import LinkedInTab from './LinkedInTab';
import JobMatchTab from './JobMatchTab';
import RecentTab from './RecentTab';
import ProfileTab from './ProfileTab';
import PanelHeader from './PanelHeader';
import SignedInMessage from './SignedInMessage';
import TailoredResumeSwitch from './TailoredResumeSwitch';
import OnboardingReminder from './OnboardingReminder';
import SubscriptionReminder from './SubscriptionReminder';
import GenerateSubscriptionReminder from './GenerateSubscriptionReminder';
import LoadingState from './LoadingState';
import LinkedInJobMatchPrompt from './LinkedInJobMatchPrompt';
import { JobInfoDisplay, LinkedInProfileDisplay } from './DisplayAboveTabs';
import { saveJob, fetchUserFAQData } from '../services/apiService';
import { autofillLinkedin, autoApplyLinkedin, findEasyApplyButton } from '../autofill/linkedin.js';
import { autofillIndeed, applyIndeed } from '../autofill/indeed.js';
import { autofillSeekSimple } from '../autofill/seek_simple.js';
import { autofillSeek as autofillSeekManual } from '../autofill/seek_autodill.js';
import { autofillMicrosoft } from '../autofill/microsoft.js';
import { LinkedInExtractor, IndeedExtractor } from '../utils/siteExtractors.js';
import { updateActionButtonState } from '../utils/actionButtonsBridge.js';
import { registerActionButtonHandlers } from '../utils/actionButtonsBridge.js';
import { isLinkedInProfilePage, isLinkedInJobPage, compareProfileUrl, getStoredLinkedInCache, LINKEDIN_CACHE_KEY } from '../utils/linkedinHelpers.js';

// UI Constants - Size, Margin, Padding only
const CONTAINER_WIDTH = 400;
const CONTAINER_BORDER_RADIUS = 20;
const COMPANY_LOGOSIZE = 90;
const LOGO_TEXT_GAP = 16;
const SECTION_MARGIN = 10;
const SECTION_PADDING = 30; // related to the left padding of the company logo
const TAB_PADDING = 10;
const WARNING_MARGIN = 20;
const WARNING_PADDING = '12px 20px';
const CONTENT_PADDING = 10;
const BUTTON_PADDING = '10px 20px';
const BUTTON_MARGIN = 15;
const BUTTON_SAVE_MARGIN_LEFT = 50;
const BUTTON_BORDER_RADIUS = 10;

const SUBSCRIPTION_URL = 'https://candidates.jobgen.ai/pricing';
const SIGNED_IN_MESSAGE_KEY = 'jobgen_signed_in_message_seen';

const JobContainer = ({
  jobTitle,
  companyName,
  jobLocation,
  companyLogoUrl,
  onMinimize,
  onProfileClick,
  jobData,
  saveData,
  currentSite,
  onStartProgress,
  currentJobId,
  hasLinkedInSelection,
  initialTab, // Guard: When initialTab is null, we reset the ref so the logic is ready for the next time a tab hint arrives
  onViewProgress,
  showProgressButton,
  progressState,
  isAuthenticated,
  isSubscribed = null,
  onboardingComplete = true,
  faqDataLoading = false,
  emptyFieldCount = 0,
  missingBasicInfo = false,
  missingDetailedInfo = false,
  missingPersonalFields = [],
  missingWorkFields = [],
  hasRecommendedFields: _hasRecommendedFields = false,
  recommendedMissingFields: _recommendedMissingFields = [],
  onStartOnboarding,
  onLogout,
  ensureExpand,
  refreshSubscriptionStatus,
}) => {
  const [activeTab, setActiveTab] = useState(initialTab || 'highLevelTab');
  const [warningMessage, setWarningMessage] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const [selectedRating, setSelectedRating] = useState(3);
  const [saveButtonText, setSaveButtonText] = useState('Save');
  const [salaryDisplay, setSalaryDisplay] = useState('');
  const [enableTailoredResume, setEnableTailoredResume] = useState(false);
  const [activeApplicationCount, setActiveApplicationCount] = useState(0);
  const [userData, setUserData] = useState(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [userAvatarUrl, setUserAvatarUrl] = useState(null);
  const [profileDisplayData, setProfileDisplayData] = useState(null);
  const [matchesCachedProfileState, setMatchesCachedProfileState] = useState(false);
  const [linkedinCacheTimestamp, setLinkedinCacheTimestamp] = useState(0);
  const [showSubscriptionReminderCard, setShowSubscriptionReminderCard] = useState(false);
  const [showGenerateSubscriptionCard, setShowGenerateSubscriptionCard] = useState(false);
  const [showJobgenSignedInMessage, setShowJobgenSignedInMessage] = useState(false);
  const [jobgenSignedInMessageResolved, setJobgenSignedInMessageResolved] = useState(false);
  const [isHeadshotGenerating, setIsHeadshotGenerating] = useState(false);
  const containerRef = useRef(null);
  const appliedInitialTabRef = useRef(null);

  const currentURL = window.location.href.toLowerCase();

  useEffect(() => {
    // Set global rating for compatibility
    window.selectedStarRating = selectedRating;
  }, [selectedRating]);

  // Update salary display when jobData changes
  useEffect(() => {
    if (jobData && jobData.job_data) {
      const data = jobData.job_data;
      if (data.Salary && data.Salary !== "Not provided") {
        setSalaryDisplay(data.Salary);
      }
    }
  }, [jobData]);

  // Update Save button text and Apply button state based on jobgen_job_status
  useEffect(() => {
    const updateButtonStates = async () => {
      console.log('🔍 [BUTTON_UPDATE] jobData:', jobData);
      console.log('🔍 [BUTTON_UPDATE] jobData.jobgen_job_status:', jobData?.jobgen_job_status);

      const normalizeJobStatus = (status) => {
        if (!status) return null;
        const normalized = String(status).trim().toLowerCase();
        if (normalized === 'applied') return 'Applied';
        if (normalized === 'saved') return 'Saved';
        return null;
      };

      const normalizedStatus = normalizeJobStatus(jobData?.jobgen_job_status);
      console.log('🔍 [BUTTON_UPDATE] normalizedStatus:', normalizedStatus);

      if (normalizedStatus) {
        // If status is "Applied", Save button shows "Saved" (applied means already saved)
        if (normalizedStatus === 'Applied') {
          setSaveButtonText('Saved');
          setIsApplyInProgress(true);
          setHasActiveFlow(false); // Clear active flow - job already applied
          console.log('🔒 [BUTTON_UPDATE] Job already applied - Save button shows "Saved", Apply button disabled');
        } else if (normalizedStatus === 'Saved') {
          setSaveButtonText('Saved');
          setIsApplyInProgress(false);
          setHasActiveFlow(false);
          console.log('💾 [BUTTON_UPDATE] Job saved - Save button shows "Saved", Apply button enabled');
        }
      } else {
        setSaveButtonText('Save');
        setIsApplyInProgress(false);
        setHasActiveFlow(false);
        console.log('🔓 [BUTTON_UPDATE] No status - resetting buttons');
      }
    };

    updateButtonStates();
  }, [jobData]);

  // Listen to storage changes for jobgen_job_status updates
  useEffect(() => {
    if (currentSite !== 'seek') return;

    const handleStorageChange = async (changes, area) => {
      if (area !== 'local') return;

      // Check if any seek_job_match_{jobId} was updated
      const matchKeys = Object.keys(changes).filter(key => key.startsWith('seek_job_match_'));

      if (matchKeys.length > 0) {
        // Get current job ID
        const result = await chrome.storage.local.get(['current_listing_job_id']);
        const currentJobId = result.current_listing_job_id;

        if (!currentJobId) return;

        const currentMatchKey = `seek_job_match_${currentJobId}`;

        // Check if the current job's match data was updated
        if (changes[currentMatchKey]) {
          const newValue = changes[currentMatchKey].newValue;
          const newStatus = newValue?.jobgen_job_status;

          console.log(`🔄 [STORAGE_CHANGE] Job ${currentJobId} status changed to: ${newStatus}`);

          // Update button states based on new status
          const normalizeJobStatus = (status) => {
            if (!status) return null;
            const normalized = String(status).trim().toLowerCase();
            if (normalized === 'applied') return 'Applied';
            if (normalized === 'saved') return 'Saved';
            return null;
          };

          const normalizedStatus = normalizeJobStatus(newStatus);

          if (normalizedStatus === 'Applied') {
            setSaveButtonText('Saved');
            setIsApplyInProgress(true);
            setHasActiveFlow(false); // Clear active flow when status becomes "Applied"
            console.log('🔒 [STORAGE_CHANGE] Job applied - updating buttons');
          } else if (normalizedStatus === 'Saved') {
            setSaveButtonText('Saved');
            setIsApplyInProgress(false);
            setHasActiveFlow(false);
            console.log('💾 [STORAGE_CHANGE] Job saved - updating buttons');
          } else {
            setSaveButtonText('Save');
            setIsApplyInProgress(false);
            setHasActiveFlow(false);
            console.log('🔓 [STORAGE_CHANGE] Job status cleared - resetting buttons');
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

  // Monitor active application count for SEEK
  useEffect(() => {
    const updateActiveCount = async () => {
      if (currentURL.includes('seek.com')) {
        try {
          // Get active application count
          const result = await chrome.storage.local.get(null);
          const activeFlows = Object.keys(result).filter(key => key.startsWith('seek_flow_'));
          setActiveApplicationCount(activeFlows.length);
        } catch (error) {
          console.error('Error getting active application count:', error);
          setActiveApplicationCount(0);
        }
      }
    };

    // Update immediately
    updateActiveCount();

    // Update every 2 seconds
    const interval = setInterval(updateActiveCount, 2000);

    return () => clearInterval(interval);
  }, [currentURL]);

  // Fetch user data for profile header display (ProfileTab handles its own content)
  useEffect(() => {
    const fetchUserData = async () => {
      if (activeTab === 'profileTab') {
        try {
          const result = await chrome.storage.local.get(['user_faq_data']);
          if (result.user_faq_data) {
            setUserData(result.user_faq_data);
          } else {
            // No data - clear everything
            setUserData(null);
            setUserAvatarUrl(null);
          }
        } catch (error) {
          console.error('❌ Error loading profile header data:', error);
        }
      }
    };

    fetchUserData();

    // Listen for storage changes to update header
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.user_faq_data && activeTab === 'profileTab') {
        if (changes.user_faq_data.newValue) {
          setUserData(changes.user_faq_data.newValue);
        } else {
          // Data cleared - clear everything immediately
          console.log('🗑️ Clearing profile header data');
          setUserData(null);
          setUserAvatarUrl(null);
        }
      }
    };

    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleStorageChange);
    }

    return () => {
      if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, [activeTab]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileDropdown && !event.target.closest('[data-profile-dropdown]')) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showProfileDropdown]);

  // Generate user avatar URL
  useEffect(() => {
    const generateAvatarUrl = () => {
      try {
        // If no userData, clear the avatar
        if (!userData) {
          console.log('🗑️ No userData - clearing avatar');
          setUserAvatarUrl(null);
          return;
        }

        // Helper to parse JSON
        const parseUserData = (jsonString) => {
          if (!jsonString) return {};
          try {
            return typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
          } catch (_e) {
            return {};
          }
        };

        // Try to use name from userData to generate avatar
        const personalInfo = parseUserData(userData.personal_info);
        if (personalInfo?.first_name && personalInfo?.last_name) {
          const name = `${personalInfo.first_name}+${personalInfo.last_name}`;
          // Use UI Avatars service to generate avatar from name
          const avatarUrl = `https://ui-avatars.com/api/?name=${name}&size=90&background=2b6bf5&color=fff&bold=true`;
          setUserAvatarUrl(avatarUrl);
          console.log('📸 Generated avatar from user name:', name);
          return;
        }
      } catch (error) {
        console.error('Error generating avatar:', error);
        setUserAvatarUrl(null);
      }
    };

    generateAvatarUrl();
  }, [userData]);

  // Helper function to parse JSON strings
  const parseJSON = (jsonString, defaultValue = {}) => {
    if (!jsonString) return defaultValue;
    try {
      return typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    } catch (_e) {
      return defaultValue;
    }
  };

  // Refresh profile data - force fresh API fetch
  const refreshProfileData = async () => {
    console.log('🔄 Refreshing profile data - clearing cache and fetching from API');

    try {
      // Clear cache first
      await chrome.storage.local.remove(['user_faq_data', 'user_faq_timestamp']);
      console.log('🗑️ Cache cleared');

      // Fetch from API - ProfileTab will auto-update via storage listener
      const data = await fetchUserFAQData();
      if (data) {
        console.log('✅ Profile refreshed at', new Date().toLocaleTimeString());
      } else {
        console.error('❌ No data returned from API');
      }
    } catch (error) {
      console.error('❌ Refresh error:', error);
    }
  };

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    setShowWarning(false);
    setWarningMessage('');

    // On LinkedIn: if clicking Job Match or Recent while on Profile tab, restore LinkedIn tab
    if (currentSite === 'linkedin' && (tabId === 'highLevelTab' || tabId === 'recentTab') && activeTab === 'profileTab') {
      // Don't switch to profileTab, user wants to see other content
      // LinkedIn Optimizer will reappear automatically
    }

    // Tab logic based on site
    if (currentSite === 'linkedin' && isLinkedInProfilePage(currentURL)) {
      if (tabId === 'highLevelTab') {
        // Will show LinkedInJobMatchPrompt component instead of warning
        setActiveTab('highLevelTab');
      }
    } else if (currentSite === 'linkedin' && !isLinkedInProfilePage(currentURL) && !currentURL.includes("job")) {
      // allow switching to LinkedIn optimizer; it will show its own prompt when not on profile
    }
  };

  useEffect(() => {
    if (currentSite !== 'linkedin' && activeTab === 'linkedinTab') {
      setActiveTab('highLevelTab');
      setShowWarning(false);
      setWarningMessage('');
    }
  }, [currentSite, activeTab]);

  useEffect(() => {
    if (!initialTab) {
      appliedInitialTabRef.current = null;
      return;
    }

    if (appliedInitialTabRef.current === initialTab) {
      return;
    }

    appliedInitialTabRef.current = initialTab;
    setActiveTab(initialTab);
    setShowWarning(false);
    setWarningMessage('');
  }, [initialTab]);

  useEffect(() => {
    if (isSubscribed) {
      setShowSubscriptionReminderCard(false);
    }
  }, [isSubscribed, showSubscriptionReminderCard]);

  const showWarningMessage = (message) => {
    setWarningMessage(message);
    setShowWarning(true);
  };

  const handleNavigateToJobs = () => {
    window.open('https://www.linkedin.com/jobs/', '_blank');
  };

  const openSubscription = () => {
    try {
      window.open(SUBSCRIPTION_URL, '_blank');
    } catch (error) {
      console.error('Failed to open subscription page', error);
    }
  };

  // manual refresh subscription status
  const handleRefreshSubscription = async () => {
    if (refreshSubscriptionStatus) {
      console.log('🔄 User clicked refresh, checking subscription status...');
      await refreshSubscriptionStatus();
    } else {
      // 如果没有传递 refreshSubscriptionStatus, 回退到重新加载扩展
      console.warn('⚠️ refreshSubscriptionStatus not available, reloading extension');
      try {
        if (chrome?.runtime?.reload) {
          chrome.runtime.reload();
          return;
        }
      } catch (error) {
        console.warn('chrome.runtime.reload failed', error);
      }
      window.location.reload();
    }
  };

  // Handle when generate feature requires subscription
  const handleGenerateSubscriptionNeeded = () => {
    console.log('🎨 Generate feature requires subscription - showing reminder card');
    setShowGenerateSubscriptionCard(true);
    ensureExpand?.();
  };

  const handleSaveButton = async () => {
    console.log("✅ Save button clicked");

    // Prepare portal label
    const normalizePortal = (url) => {
      const site = getSiteType(url);
      switch (site) {
        case 'linkedin': return 'LinkedIn';
        case 'indeed': return 'Indeed';
        case 'seek': return 'SEEK';
        case 'microsoft': return 'Microsoft';
        default: return 'Others';
      }
    };
    const portal = normalizePortal(window.location.href);

    // Extract job details from DOM
    const extractedJobTitle = document.getElementById('jobTitle')?.innerText.trim() || "N/A";
    const extractedCompanyName = document.getElementById('companyName')?.innerText.trim() || "N/A";
    const location = document.getElementById('location')?.innerText.trim() || "N/A";
    const salary = document.getElementById('salary')?.innerText.trim() || "N/A";
    const alignment = document.getElementById('alignment')?.innerText.trim() || "N/A";
    const jobMatchScore = document.getElementById('scoreText')?.innerText.trim() || "N/A";

    // Extract form data if available
    const form1 = document.getElementById('jobTitleInput')?.value.trim();
    const form2 = document.getElementById('companyNameInput')?.value.trim();
    const form3 = document.getElementById('locationInput')?.value.trim();
    const form4 = document.getElementById('descriptionInput')?.value.trim();

    // Extract skills and responsibilities
    const hardSkills = [...document.getElementById('hardSkills')?.querySelectorAll('li') || []]
      .map(li => li.innerText.trim()).join(', ') || "N/A";
    const softSkills = [...document.getElementById('softSkills')?.querySelectorAll('li') || []]
      .map(li => li.innerText.trim()).join(', ') || "N/A";
    const keyResponsibilities = [...document.getElementById('jobSummary')?.querySelectorAll('li') || []]
      .map(li => li.innerText.trim()).join('\n- ') || "N/A";

    const jobDetailsString = `
      Job Title: ${extractedJobTitle}
      Company: ${extractedCompanyName}
      Location: ${location}
      Salary: ${salary}
      Alignment: ${alignment}
      job_match_score: ${jobMatchScore}

      skills: ${hardSkills}
      technical_skills: ${softSkills}

      Key Responsibilities:
      - ${keyResponsibilities}

      ${form1 ? form1 : ''} ${form2 ? form2 : ''} ${form3 ? form3 : ''} ${form4 ? form4 : ''}
    `;

    console.log("🚀 Saving job details...", jobDetailsString + saveData);

    try {
      // Use different save API based on platform
      if (currentURL.includes('seek.com')) {
        // SEEK: Use new jobgen_save API
        console.log("💾 Using SEEK save API");

        // Get current job ID from local storage or URL
        const getCurrentSeekJobId = () => {
          // Try URL first
          const urlMatch = window.location.href.match(/\/job\/(\d+)/);
          if (urlMatch) return urlMatch[1];

          // Try from stored listing job ID
          return new Promise((resolve) => {
            chrome.storage.local.get(['current_listing_job_id'], (result) => {
              resolve(result.current_listing_job_id || null);
            });
          });
        };

        const jobId = await getCurrentSeekJobId();
        if (!jobId) {
          showWarningMessage("Error: Could not identify job to save!");
          return;
        }

        // Use clean URL format: https://au.seek.com/job/{jobId}
        const cleanJobUrl = `https://au.seek.com/job/${jobId}`;
        console.log(`📍 Using clean job URL for save API: ${cleanJobUrl}`);
        console.log(`📍 Using job ID: ${jobId}`);
        const result = await saveJob({
          job_url: cleanJobUrl,
          job_id: jobId,
          job_title: extractedJobTitle || jobTitle,
          company: extractedCompanyName || companyName,
          job_portal: portal,
          excitement: selectedRating.toString(),
          description: saveData || jobDetailsString
        });

        console.log("💾 SEEK save result:", result);
        if (result && result.success) {
          setSaveButtonText("Saved");

          // Update jobgen_job_status to "Saved" (only if not already "Applied")
          try {
            const matchStorageKey = `seek_job_match_${jobId}`;
            const matchResult = await chrome.storage.local.get([matchStorageKey]);
            if (matchResult[matchStorageKey]) {
              const currentStatus = matchResult[matchStorageKey].jobgen_job_status;

              // Don't downgrade from "Applied" to "Saved"
              if (currentStatus !== "Applied") {
                const updatedMatchData = {
                  ...matchResult[matchStorageKey],
                  jobgen_job_status: "Saved"
                };
                await chrome.storage.local.set({ [matchStorageKey]: updatedMatchData });
                console.log(`✅ Updated jobgen_job_status to "Saved" for job ${jobId}`);
              } else {
                console.log(`ℹ️ Job ${jobId} already "Applied", keeping status as "Applied"`);
              }
            }
          } catch (error) {
            console.error('❌ Error updating jobgen_job_status:', error);
          }

          setShowWarning(false);
        } else {
          console.log("❌ SEEK job saving failed:", result?.error);
          showWarningMessage("Error: Please try saving again!");
        }
      } else {
        // Prepare job id for non-SEEK platforms (LinkedIn, Indeed, others)
        let jobId = null;
        const urlObj = new URL(window.location.href);
        let jobUrl = null;

        if (currentURL.includes('linkedin.com')) {
          jobId = LinkedInExtractor.getJobIdFromUrl(window.location.href);

          if (!jobId) {
            console.warn('❌ Could not resolve LinkedIn job_id from URL:', window.location.href);
            showWarningMessage('Error: Could not identify job to save!');
            return;
          }
          jobUrl = window.location.href;
        } else if (currentURL.includes('indeed.com')) {
          jobId = IndeedExtractor.getJobIdFromUrl(window.location.href);

          if (!jobId) {
            console.warn('❌ Could not resolve Indeed job_id from URL:', window.location.href);
            showWarningMessage('Error: Could not identify job to save!');
            return;
          }
          jobUrl = `https://www.indeed.com/viewjob?jk=${jobId}`;
        }
        // Microsoft: /job/{id}/... or any long numeric segment
        else if (currentURL.includes('microsoft.com') || currentURL.includes('icims.com')) {
          jobId =
            (urlObj.pathname.match(/\/job\/(\d+)/) || [])[1] ??
            (urlObj.pathname.match(/(\d{5,})/) || [])[1] ??
            null;

          if (!jobId) {
            console.warn("❌ Could not resolve Microsoft job_id from URL:", window.location.href);
            showWarningMessage("Error: Could not identify job to save!");
            return;
          }
          jobUrl = window.location.href;
        }
        // Others: try common patterns; if nothing found, fall back to full URL
        else {
          jobId =
            urlObj.searchParams.get('jobId') ??
            (urlObj.pathname.match(/(\d{6,})/) || [])[1] ??
            urlObj.searchParams.get('id') ??
            window.location.href;
        }

        const result = await saveJob({
          job_url: jobUrl,
          job_id: jobId,
          job_title: extractedJobTitle || jobTitle,
          company: extractedCompanyName || companyName,
          job_portal: portal,
          excitement: selectedRating.toString(),
          description: saveData || jobDetailsString
        });

        console.log("Saved result:", result);
        if (result && result.success) {
          setSaveButtonText("Saved");
          setShowWarning(false);
        } else {
          console.log("❌ Job saving failed:", result?.error || result);
          showWarningMessage("Error: Please try saving again!");
        }
      }
    } catch (error) {
      console.error("Error saving job details:", error);
      showWarningMessage("Error: Please try saving again!");
    }
  };

  const handleAutofillButton = async (event) => {
    event?.preventDefault?.();

    if (isSubscribed === false) {
      setShowSubscriptionReminderCard(true);
      ensureExpand?.();
      return;
    }

    // Send manual autofill message to all frames (main + iframes)
    const currentURL = window.location.href.toLowerCase();

    // If progress is already running, navigate to progress view instead of restarting
    if (progressState?.status === 'running') {
      console.log('⚠️ Progress already running, navigating to progress view');
      if (onViewProgress) {
        onViewProgress();
      }
      return;
    }

    // NEVER show progress UI on listing page for Seek and Indeed
    if (typeof onStartProgress === 'function') {
      if ((currentURL.includes('indeed')) && (!currentURL.includes('smartapply.indeed'))) {
        console.log('On indeed job listing page, do not show progress view');
      } else if (currentURL.includes('seek.com')) {
        // For Seek, don't show progress UI on listing page - user manually clicks through
        console.log('🚫 Seek listing page - no progress UI for autofill on listing page');
      } else {
        onStartProgress('autofill');
      }

    }


    try {
      console.log('🔧 Initiating manual autofill from React UI');

      // Prepare autofill data for manual (old) version
      const autofillData = {
        site: getSiteType(currentURL),
        url: currentURL,
        action: 'autofill', // Changed from 'review' to 'autofill'
        jobData: {
          title: jobTitle,
          company: companyName,
          location: jobLocation
        }
      };

      // Send message to all frames via background script
      if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: 'BROADCAST_AUTOFILL',
          data: autofillData
        }, (response) => {
          console.log('📨 Manual autofill broadcast response:', response);
        });
      } else {
        // Fallback: trigger manual autofill directly in main frame
        console.log('📋 Fallback: triggering manual autofill directly');
        triggerManualAutofill(currentURL);
      }
    } catch (error) {
      console.error('Error initiating manual autofill:', error);
      alert("Error initiating manual autofill function");
    }
  };

  // Helper function to determine site type
  const getSiteType = (url) => {
    if (url.includes('linkedin.com')) return 'linkedin';
    if (url.includes('indeed.com')) return 'indeed';
    if (url.includes('seek.com')) return 'seek';
    if (url.includes('microsoft.com') || url.includes('icims.com')) return 'microsoft';
    return 'unknown';
  };

  // Fallback function for manual autofill (old version)
  const triggerManualAutofill = (currentURL) => {
    if (currentURL.includes('linkedin.com')) {
      autofillLinkedin();
    } else if (currentURL.includes('indeed.com')) {
      autofillIndeed();
    } else if (currentURL.includes('seek.com')) {
      // Call the old manual version
      autofillSeekManual();
    } else if (currentURL.includes('glassdoor.com') || currentURL.includes('icims.com')) {
      autofillStandardForm(currentURL.includes('glassdoor.com') ? 'glassdoor' : 'icims');
    } else if (currentURL.includes('microsoft.com')) {
      autofillMicrosoft();
    } else {
      alert("Manual autofill not available for this site");
    }
  };

  // Fallback function for continuous flow (new version)
  const triggerContinuousFlow = (currentURL) => {
    if (currentURL.includes('linkedin.com')) {
      autoApplyLinkedin();
    } else if (currentURL.includes('indeed.com')) {
      applyIndeed();
    } else if (currentURL.includes('seek.com')) {
      // Call the simple continuous flow version
      autofillSeekSimple();
    } else if (currentURL.includes('microsoft.com') || currentURL.includes('icims.com')) {
      autofillMicrosoft();
    } else {
      alert("Continuous flow not available for this site");
    }
  };

  const handleApplyButton = (event) => {
    if (!platformCapabilities(currentSite).autoApply) {
      showWarningMessage('Use Autofill, then review and submit the application on this site.');
      return;
    }
    event?.preventDefault?.();

    if (isSubscribed === false) {
      setShowSubscriptionReminderCard(true);
      ensureExpand?.();
      return;
    }

    // Send continuous flow message to all frames (main + iframes)
    const currentURL = window.location.href.toLowerCase();


    // If progress is already running, navigate to progress view instead of restarting
    if (progressState?.status === 'running' || isApplyInProgress) {
      console.log('⚠️ Progress already running, navigating to progress view');
      if (onViewProgress) {
        onViewProgress();
      }
      return;
    }

    // Set apply in progress (will disable button)
    if (currentURL.includes('seek.com')) {
      setIsApplyInProgress(true);
      console.log('🔒 Apply button disabled - application in progress');
    }

    if (currentURL.includes('indeed')) {
      setIsApplyInProgress(true);
    }

    // NEVER show progress UI on listing page for Seek
    if (typeof onStartProgress === 'function') {
      if ((currentURL.includes('indeed')) && (!currentURL.includes('smartapply'))) {
        console.log('On indeed job listing page, do not show progress view');
      } else if (currentURL.includes('seek.com')) {
        // For Seek, don't show progress UI on listing page - it will show automatically when application page loads
        console.log('🚫 Seek listing page - progress UI will show after apply button click');
      } else {
        onStartProgress('apply');
      }

    }

    try {
      console.log('🚀 Initiating continuous flow from React UI');

      // Prepare autofill data for continuous flow (new version)
      const autofillData = {
        site: getSiteType(currentURL),
        url: currentURL,
        action: 'apply', // **************** This will trigger the continuous flow *******************
        jobData: {
          title: jobTitle,
          company: companyName,
          location: jobLocation
        }
      };

      // Send message to all frames via background script
      if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage({
          action: 'BROADCAST_AUTOFILL',
          data: autofillData
        }, (response) => {
          console.log('📨 Continuous flow broadcast response:', response);
        });
      } else {
        // Fallback: trigger continuous flow directly in main frame
        console.log('📋 Fallback: triggering continuous flow directly');
        triggerContinuousFlow(currentURL);
      }
    } catch (error) {
      console.error('Error initiating continuous flow:', error);
      alert("Error initiating continuous flow");
    }
  };
  const actionHandlersRef = useRef({
    save: () => handleSaveButton(),
    autofill: () => handleAutofillButton(),
    apply: () => handleApplyButton(),
  });
  const lastJobKeyRef = useRef('');

  // Check if no job is selected (empty job info on Seek)
  const isNoJobSelected = (
    (currentSite === 'seek' && !jobTitle && !companyName) ||
    (currentSite === 'linkedin' && !hasLinkedInSelection) ||
    (currentSite === 'indeed' && !jobTitle && !companyName)
  );

  // Check if auto-apply progress is running on Indeed.
  const INDEED_LAST_ACTION_KEY = 'jobgen:last_action';
  const INDEED_ACTION_AUTO_APPLY = 'auto_apply';
  const [isIndeedAutoApplyRunning, setIsIndeedAutoApplyRunning] = useState(false);

  // Check if progress is running for Seek (or if apply was just clicked)
  const isSeekProgressRunning = currentSite === 'seek' && (progressState?.status === 'running');

  // Check if the job is external apply
  const [isExternalApply, setIsExternalApply] = useState(false);

  // Track if Apply button was clicked (for disabling during application)
  const [isApplyInProgress, setIsApplyInProgress] = useState(false);

  // Check if required onboarding fields are missing (personal_info, resume, work_preferences)
  const hasRequiredFieldsMissing = missingBasicInfo || missingDetailedInfo;

  // Track if there's an ACTIVE flow (for showing "Applying..." vs "Applied")
  const [hasActiveFlow, setHasActiveFlow] = useState(false);

  // Track when LinkedIn already shows "Applied X ago" on the listing
  const [hasLinkedInAppliedLabel, setHasLinkedInAppliedLabel] = useState(false);

  useEffect(() => {
    if (currentSite !== 'indeed') {
      setIsIndeedAutoApplyRunning(false);
      return;
    }

    let unmounted = false;

    const readIndeedLastAction = async () => {
      try {
        const res = await chrome.storage.local.get([INDEED_LAST_ACTION_KEY]);
        if (unmounted) return;
        setIsIndeedAutoApplyRunning(res[INDEED_LAST_ACTION_KEY] != null);
      } catch (e) {
        console.warn('Read INDEED_LAST_ACTION_KEY failed:', e);
      }
    };

    const handleIndeedStorageChange = (changes, area) => {
      if (area !== 'local') return;
      if (changes[INDEED_LAST_ACTION_KEY]) {
        const v = changes[INDEED_LAST_ACTION_KEY].newValue;
        setIsIndeedAutoApplyRunning(v === INDEED_ACTION_AUTO_APPLY);
      }
    };

    readIndeedLastAction();
    chrome.storage.onChanged.addListener(handleIndeedStorageChange);

    return () => {
      unmounted = true;
      chrome.storage.onChanged.removeListener(handleIndeedStorageChange);
    };
  }, [currentSite]);



  // Check if THIS SPECIFIC job is currently applying by looking for seek_flow_{currentJobId}
  useEffect(() => {
    if (currentSite !== 'seek') return;

    const checkActiveFlows = async () => {
      try {
        // Get current job ID from storage
        const result = await chrome.storage.local.get(['current_listing_job_id']);
        const currentJobId = result.current_listing_job_id;

        if (!currentJobId) {
          return;
        }

        // Check if THIS specific job has an active flow
        const flowKey = `seek_flow_${currentJobId}`;
        const flowResult = await chrome.storage.local.get([flowKey]);
        const hasActiveFlowForThisJob = !!flowResult[flowKey];

        // Also check if job status is "Applied" (permanent disable)
        const matchKey = `seek_job_match_${currentJobId}`;
        const matchResult = await chrome.storage.local.get([matchKey]);
        const jobStatus = matchResult[matchKey]?.jobgen_job_status;
        const isAlreadyApplied = jobStatus === 'Applied';

        // Update hasActiveFlow state
        if (hasActiveFlowForThisJob !== hasActiveFlow) {
          setHasActiveFlow(hasActiveFlowForThisJob);
        }

        if (isAlreadyApplied) {
          // Job already applied, keep button disabled
          if (!isApplyInProgress) {
            console.log(`🔒 Job ${currentJobId} already applied - disabling Apply button`);
            setIsApplyInProgress(true);
          }
        } else if (hasActiveFlowForThisJob) {
          // Job currently being applied
          if (!isApplyInProgress) {
            console.log(`🔒 Job ${currentJobId} is applying - disabling Apply button`);
            setIsApplyInProgress(true);
          }
        } else {
          // Job not applying and not applied - enable button
          if (isApplyInProgress && progressState?.status !== 'running') {
            console.log(`🔓 Job ${currentJobId} is not applying - enabling Apply button`);
            setIsApplyInProgress(false);
          }
        }
      } catch (error) {
        console.error('❌ Error checking active flows:', error);
      }
    };

    // Check immediately and set up interval
    checkActiveFlows();
    const interval = setInterval(checkActiveFlows, 2000);

    return () => clearInterval(interval);
  }, [currentSite, isApplyInProgress, progressState?.status, hasActiveFlow]);

  // Reset apply in progress when progress completes or errors (unless job status is "Applied")
  useEffect(() => {
    if (progressState?.status === 'completed' || progressState?.status === 'error' || progressState?.status === 'idle') {
      // Check if current job is "Applied" before resetting
      const checkBeforeReset = async () => {
        try {
          const result = await chrome.storage.local.get(['current_listing_job_id']);
          const currentJobId = result.current_listing_job_id;

          if (currentJobId) {
            const matchKey = `seek_job_match_${currentJobId}`;
            const matchResult = await chrome.storage.local.get([matchKey]);
            const jobStatus = matchResult[matchKey]?.jobgen_job_status;

            if (jobStatus !== 'Applied') {
              // Only reset if job is not "Applied"
              setIsApplyInProgress(false);
              setHasActiveFlow(false);
            } else {
              // Job is "Applied", clear active flow but keep disabled
              setHasActiveFlow(false);
            }
          } else {
            setIsApplyInProgress(false);
            setHasActiveFlow(false);
          }
        } catch (_error) {
          setIsApplyInProgress(false);
          setHasActiveFlow(false);
        }
      };

      checkBeforeReset();
    }
  }, [progressState?.status]);

  // Reset states when job changes (will be re-set by storage check if needed)
  useEffect(() => {
    setHasActiveFlow(false);
    // isApplyInProgress will be set by the storage check and jobData useEffect
  }, [currentJobId, jobTitle, companyName]);

  // Check for external
  useEffect(() => {
    if (currentSite === 'seek') {
      const applyButton = document.querySelector('[data-automation="job-detail-apply"]');
      if (applyButton) {
        const buttonText = applyButton.textContent?.trim() || '';
        const isExternal = buttonText.includes('Apply') && !buttonText.includes('Quick');
        setIsExternalApply(isExternal);
      }
    }
    if (currentSite === 'linkedin') {
      if (currentJobId) {
        const easyApplyButton = findEasyApplyButton();
        console.log('easyApplyButton', easyApplyButton, 'hasLinkedInAppliedLabel', hasLinkedInAppliedLabel);
        const isExternal = (!easyApplyButton && !hasLinkedInAppliedLabel);
        setIsExternalApply(isExternal);
      }
    }
    // TODO: Clean-up below
    if (currentSite === 'indeed') {
      // --- 局部 helper: smartapply host? ---
      const isSmartApplyHost = () =>
        /(^|\.)smartapply\.indeed\.com$/i.test(window.location.hostname);

      // --- 局部 helper: candidate selectors (same as injector) ---
      const INDEED_APPLY_BTN_SELECTORS = [
        "#indeedApplyButton",
        '[data-tn-element="applyButton"]',
        '[data-qa="apply-button"]',
        '[data-testid*="apply"]',
        'a[role="button"]',
        "button",
      ];

      // --- 局部 helper: find visible "apply" button like injector does ---
      const findApplyButton = () => {
        const btns = [];
        for (const sel of INDEED_APPLY_BTN_SELECTORS) {
          document.querySelectorAll(sel).forEach(el => btns.push(el));
        }

        return btns.find(el => {
          if (!el) return false;
          // must be visible
          if (el.offsetParent === null) return false;
          const txt = (el.innerText || el.textContent || "").trim();
          return /(apply|申请)/i.test(txt);
        }) || null;
      };

      // --- 局部 helper: infer internal-ness using EXACT SAME heuristics as injection ---
      const inferInternal = () => {
        // Rule 1: smartapply host is always internal
        if (isSmartApplyHost()) return true;

        // Rule 2: need a visible apply button
        const btn = findApplyButton();
        if (!btn) return null;
        // IMPORTANT: we now return null if we *can't* decide yet

        const txt = (btn.innerText || btn.textContent || "")
          .trim()
          .toLowerCase();

        // Rule 3: only "apply now" counts as internal
        // anything else ("apply on company site", etc) = external
        if (txt.includes("apply now")) return true;
        return false;
      };

      // --- state updater with graceful handling of "unknown yet" ---
      let lastExternalState = null; // track what we've pushed to React so we don't spam
      const evalAndUpdate = () => {
        const internal = inferInternal();

        // internal === true  -> externalApply = false
        // internal === false -> externalApply = true
        // internal === null  -> we don't know yet (button not rendered),
        //                       so DO NOT flip to "external", just leave previous.
        if (internal === null) {
          return; // wait for next mutation tick
        }

        const externalApply = !internal;

        // only update React state if it actually changed
        if (lastExternalState !== externalApply) {
          lastExternalState = externalApply;
          setIsExternalApply(externalApply);
        }
      };

      // --- immediate eval (maybe button already exists) ---
      evalAndUpdate();

      // --- observe DOM until we can decide, or until cleanup ---
      const mo = new MutationObserver(() => {
        evalAndUpdate();
      });
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      // --- also listen for focus/resize like injector does (there are cases where Indeed lazily mounts on focus) ---
      window.addEventListener("focus", evalAndUpdate, { passive: true });
      window.addEventListener("resize", evalAndUpdate, { passive: true });

      // cleanup on unmount / dependencies change
      return () => {
        mo.disconnect();
        window.removeEventListener("focus", evalAndUpdate);
        window.removeEventListener("resize", evalAndUpdate);
      };
    }

  }, [currentSite, jobTitle, companyName, currentJobId, hasLinkedInAppliedLabel]);

  // Linkedin: Job Applied -> Disable Autofill and Apply
  useEffect(() => {
    if (currentSite !== 'linkedin') {
      setHasLinkedInAppliedLabel(false);
      return;
    }

    if (typeof document === 'undefined' || !document.body) {
      setHasLinkedInAppliedLabel(false);
      return;
    }

    const appliedPatterns = [
      /applied\s+(?:just\s+now)/i,
      /applied\s+(?:less\s+than\s+)?(?:\d+|a|an|few)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago/i,
    ];

    // TODO: Improve efficiency to use exact element label
    // Use the same selectors as decide job card selection detection in App.jsx
    const jobDetailsSelectors = [
      '.jobs-search__job-details--wrapper',
      '.jobs-semantic-search-job-details-wrapper',
      '.job-view-layout.jobs-details'
    ];

    const checkForAppliedLabel = () => {
      const jobDetailsElement = document.querySelector(jobDetailsSelectors.join(', '));
      const text = jobDetailsElement
        ? (jobDetailsElement.innerText || jobDetailsElement.textContent || '')
        : (document.body?.innerText || '');
      const detected = appliedPatterns.some((pattern) => pattern.test(text));
      setHasLinkedInAppliedLabel(detected);
      return detected;
    };

    // Polling
    let detected = checkForAppliedLabel();
    let attempts = 0;
    const maxAttempts = 5;
    const intervalMs = 500;
    const intervalId = (!detected)
      ? setInterval(() => {
        attempts += 1;
        detected = checkForAppliedLabel();
        if (detected || attempts >= maxAttempts) {
          clearInterval(intervalId);
        }
      }, intervalMs)
      : null;

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [currentSite, currentURL]);


  useEffect(() => {
    const key = currentJobId || [jobTitle, companyName, jobLocation].filter(Boolean).join('||');
    if (key !== lastJobKeyRef.current) {
      lastJobKeyRef.current = key;
      setSaveButtonText('Save');
    }
  }, [currentJobId, jobTitle, companyName, jobLocation]);

  useEffect(() => {
    actionHandlersRef.current = {
      save: () => handleSaveButton(),
      autofill: () => handleAutofillButton(),
      apply: () => handleApplyButton(),
    };
  });

  useEffect(() => {
    const unsubscribe = registerActionButtonHandlers({
      save: () => actionHandlersRef.current.save(),
      autofill: () => actionHandlersRef.current.autofill(),
      apply: () => actionHandlersRef.current.apply(),
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    updateActionButtonState({
      saveLabel: saveButtonText,
      saveDisabled: saveButtonText !== 'Save',
      currentSite,
      isAuthenticated: isAuthenticated !== false,
      onboardingComplete: onboardingComplete,
      hasRequiredFieldsMissing: hasRequiredFieldsMissing,
    });
  }, [saveButtonText, currentSite, isAuthenticated, onboardingComplete, hasRequiredFieldsMissing]);

  useEffect(() => {
    if (currentSite !== 'indeed') return;

    // —— 规范化后端/本地保存的“已申请/已保存”状态
    const normalizeJobStatus = (s) => (s ? String(s).trim().toLowerCase() : null);
    const jobStatus = normalizeJobStatus(jobData?.jobgen_job_status);
    const alreadyApplied = jobStatus === 'applied';

    // —— 当前是否有进行中的流程（含你现有的状态位）
    const applyingFlow =
      isIndeedAutoApplyRunning ||            // 监听到 last_action=auto_apply
      isApplyInProgress ||                   // 本地“已经点击过 Apply”进程位
      (progressState?.status === 'running' && progressState?.mode === 'apply');

    const autofillingFlow =
      isIndeedAutoApplyRunning ||            // 你的 Indeed 流程用同一开关时，也会挡住
      (progressState?.status === 'running' && progressState?.mode === 'autofill');

    // —— 禁用规则（和面板底部按钮保持一致）
    const baseDisabled = hasRequiredFieldsMissing || isExternalApply;
    const indeedApplyDisabled = baseDisabled || alreadyApplied || applyingFlow;
    const indeedAutofillDisabled = baseDisabled || alreadyApplied || autofillingFlow;

    // —— 文案规则（和面板底部按钮保持一致）
    const indeedApplyLabel = alreadyApplied
      ? 'Applied'
      : (applyingFlow ? 'Applying...' : 'Apply');

    const indeedAutofillLabel = alreadyApplied
      ? 'Applied'
      : (autofillingFlow ? 'Autofilling...' : 'Autofill');

    const indeedSaveLabel = (normalizeJobStatus(jobData?.jobgen_job_status) === 'saved' || alreadyApplied) ? 'Saved' : 'Save';
    const indeedSaveDisabled = indeedSaveLabel !== 'Save';

    updateActionButtonState({
      currentSite: 'indeed',

      indeedSaveLabel,
      indeedSaveDisabled,

      // Autofill
      indeedAutofillLabel,
      indeedAutofillDisabled,

      // Apply
      indeedApplyLabel,
      indeedApplyDisabled,
    });
  }, [
    currentSite,
    jobData?.jobgen_job_status,
    hasRequiredFieldsMissing,
    isExternalApply,
    isApplyInProgress,
    isIndeedAutoApplyRunning,
    progressState?.status,
    progressState?.mode,
  ]);

  useEffect(() => {
    if (window.location.href.includes("smartapply") && progressState?.status === 'running') {
      if (onViewProgress) {
        onViewProgress();
      }
    }
  }, [progressState?.status, onViewProgress]);

  // TODO: could improve by another way
  // Listen for cache changes so we can refresh the profile display without a page reload
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome?.storage?.onChanged) {
      return;
    }
    const handleCacheChange = (changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }
      const cacheChange = changes[LINKEDIN_CACHE_KEY];
      if (!cacheChange || !cacheChange.newValue) {
        return;
      }
      const nextTimestamp = cacheChange.newValue.timestamp || Date.now();
      setLinkedinCacheTimestamp(nextTimestamp);
    };
    chrome.storage.onChanged.addListener(handleCacheChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleCacheChange);
    };
  }, []);

  // monitor for linkedin profile page
  const shouldShowLinkedInProfileDisplay = isLinkedInProfilePage(currentURL);
  useEffect(() => {
    if (!shouldShowLinkedInProfileDisplay) {
      setProfileDisplayData(null);
      setMatchesCachedProfileState(false);
      return;
    }

    let cancelled = false;

    const extractDisplay = async () => {
      try {
        // reuse cached profileDisplayData
        const cachedProfile = await getStoredLinkedInCache();
        const cachedUrls = Array.isArray(cachedProfile?.profileUrls)
          ? cachedProfile.profileUrls.filter(Boolean)
          : [];
        const matchesCachedProfile = cachedUrls.some((cachedUrl) =>
          compareProfileUrl(cachedUrl, window.location.href)
        );

        if (!cancelled && matchesCachedProfile && cachedProfile?.profileDisplayData) {
          const resolveLivePhotoUrl = () => {
            try {
              return LinkedInExtractor.extractProfilePhotoUrl() || '';
            } catch (error) {
              console.warn('⚠️ Failed to resolve live LinkedIn profile photo:', error);
              return '';
            }
          };

          const livePhotoUrl = resolveLivePhotoUrl();
          const cachedDisplay = cachedProfile.profileDisplayData || {};
          const cachedPhotoUrl = cachedDisplay.profilePhotoUrl || '';
          let adjustedDisplay = cachedDisplay;

          if (livePhotoUrl && livePhotoUrl !== cachedPhotoUrl) {
            const { generatedPhotoUrl: _generatedPhotoUrl, ...rest } = cachedDisplay;
            adjustedDisplay = {
              ...rest,  // strip generatedPhotoUrl
              profilePhotoUrl: livePhotoUrl // renew profilePhotoUrl
            };
            setMatchesCachedProfileState(false);
          } else {
            setMatchesCachedProfileState(true);
          }

          setProfileDisplayData(adjustedDisplay);
          return;
        }

        const extracted = await LinkedInExtractor.extractLinkedInProfileDisplay();
        if (!cancelled) {
          setProfileDisplayData(extracted || null);
          setMatchesCachedProfileState(false);
        }
      } catch (_error) {
        if (!cancelled) {
          setProfileDisplayData(null);
          setMatchesCachedProfileState(false);
        }
      }
    };

    extractDisplay();

    return () => {
      cancelled = true;
    };
  }, [shouldShowLinkedInProfileDisplay, currentURL, currentSite, linkedinCacheTimestamp]);


  // Manage sign-in message. Make it show only once.
  useEffect(() => {
    let cancelled = false;

    const resolveSignedInMessage = async () => {
      setJobgenSignedInMessageResolved(false);

      if (currentSite !== 'jobgen' || !isAuthenticated) {
        if (!cancelled) {
          setShowJobgenSignedInMessage(false);
          setJobgenSignedInMessageResolved(true);
        }
        return;
      }

      if (!window?.chrome?.storage?.local?.get) {
        if (!cancelled) {
          setShowJobgenSignedInMessage(false);
          setJobgenSignedInMessageResolved(true);
        }
        return;
      }

      const showAndPersist = () => {
        setShowJobgenSignedInMessage(true);
        chrome.storage.local.set({ [SIGNED_IN_MESSAGE_KEY]: true }).catch(() => { });
      };

      try {
        const result = await chrome.storage.local.get([SIGNED_IN_MESSAGE_KEY]);
        if (cancelled) return;

        if (result[SIGNED_IN_MESSAGE_KEY]) {
          setShowJobgenSignedInMessage(false);
        } else {
          showAndPersist();
        }
      } catch (_error) {
        if (!cancelled) {
          showAndPersist();
        }
      } finally {
        if (!cancelled) {
          setJobgenSignedInMessageResolved(true);
        }
      }
    };

    resolveSignedInMessage();

    return () => {
      cancelled = true;
    };
  }, [currentSite, isAuthenticated]);

  if (currentSite === 'jobgen') {
    if (!isAuthenticated || !jobgenSignedInMessageResolved || !showJobgenSignedInMessage) {
      return null;
    }

    return (
      <div
        style={{
          position: 'fixed',
          top: '100px',
          right: '0',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
          pointerEvents: 'none',
          zIndex: 99999
        }}
      >
        <div style={{ pointerEvents: 'auto' }}>
          <SignedInMessage onDismiss={() => setShowJobgenSignedInMessage(false)} />
        </div>
      </div>
    );
  }

  const onLinkedInJobPage = isLinkedInJobPage(currentSite, currentURL);
  const shouldDisableLinkedInActions = currentSite === 'linkedin' && (!onLinkedInJobPage || hasLinkedInAppliedLabel);
  const isSaveDisabled = saveButtonText !== 'Save' ||
    (currentSite === 'linkedin' && !onLinkedInJobPage);
  const isApplyAutofillDisabled =
    isSeekProgressRunning ||
    isExternalApply ||
    shouldDisableLinkedInActions ||
    isApplyInProgress ||
    hasRequiredFieldsMissing ||
    isIndeedAutoApplyRunning;

  return (
    <div
      id="jobContainer"
      ref={containerRef}
      style={{
        position: 'fixed',
        top: '0',
        right: '0',
        height: '100%',
        backgroundColor: '#FFFFFF',
        padding: '0',
        borderRadius: `${CONTAINER_BORDER_RADIUS}px`,
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
        zIndex: '99999',
        maxWidth: `${CONTAINER_WIDTH}px`,
        width: `${CONTAINER_WIDTH}px`,
        overflowY: 'auto',
        overflowX: 'visible'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
        {/* Universal Header */}
        <PanelHeader
          onProfileClick={() => {
            if (currentSite === 'seek' || currentSite === 'linkedin' || currentSite === 'indeed' || currentSite === 'jobgen') {
              // Switch to Profile tab
              console.log('📋 Profile icon clicked, switching to profileTab');
              handleTabClick('profileTab');
            } else {
              // On other sites, use original behavior
              onProfileClick();
            }
          }}
          onMinimize={onMinimize}
          showProfileButton={true}
          onViewProgress={onViewProgress}
          showProgressButton={showProgressButton}
          showBackButton={(isNoJobSelected && activeTab === 'profileTab') || (currentSite === 'jobgen' && activeTab === 'profileTab')}
          onBack={() => {
            console.log('🔙 Back button clicked, returning to previous page');
            handleTabClick('highLevelTab');
          }}
        />

        {isNoJobSelected && activeTab !== 'profileTab' ? (
          <>
            <div style={{
              padding: '60px 30px 20px 30px',
              textAlign: 'center',
              color: '#666'
            }}>
              <div style={{
                fontSize: '48px',
                marginBottom: '16px'
              }}>
                👈
              </div>
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#333',
                marginBottom: '8px'
              }}>
                No job selected
              </h3>
              <p style={{
                fontSize: '14px',
                color: '#666',
                lineHeight: '1.5'
              }}>
                Please click on a job from the list to view its details and insights
              </p>
            </div>

            {/* FAQ Data Loading State */}
            {faqDataLoading && (
              <div style={{ padding: '20px' }}>
                <LoadingState
                  title="Loading Profile"
                  message="Checking onboarding status..."
                />
              </div>
            )}

            {/* Onboarding Reminder - also show when no job selected */}
            {!faqDataLoading && !onboardingComplete && (
              <OnboardingReminder
                emptyFieldCount={emptyFieldCount}
                missingDetailedInfo={missingDetailedInfo}
                missingPersonalFields={missingPersonalFields}
                missingWorkFields={missingWorkFields}
                onStartOnboarding={onStartOnboarding}
              />
            )}
          </>
        ) : (
          <>
            {/* Job Info Section / Profile Info Section */}
            <div style={{
              display: 'flex',
              alignItems: 'center', // Center align for visual balance
              marginTop: `${SECTION_MARGIN}px`,
              marginBottom: `${SECTION_MARGIN}px`, // Match top margin
              padding: `0 ${SECTION_PADDING}px`,
              minHeight: '100px',
              position: 'relative',
              zIndex: activeTab === 'profileTab' || activeTab === 'linkedinTab' ? 100 : 1
            }}>
              {(currentSite === 'seek' || currentSite === 'linkedin' || currentSite === 'indeed' || currentSite === 'jobgen') && activeTab === 'profileTab' ? (
                // Profile Info Display
                <>
                  {/* Profile Avatar */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: `${LOGO_TEXT_GAP}px`,
                    width: `${COMPANY_LOGOSIZE}px`,
                    height: `${COMPANY_LOGOSIZE}px`,
                    flexShrink: 0,
                    backgroundColor: '#2b6bf5',
                    borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                    border: 'none',
                    overflow: 'hidden'
                  }}>
                    {userAvatarUrl ? (
                      <img
                        src={userAvatarUrl}
                        alt="User Avatar"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        onError={(e) => {
                          // Fallback to emoji if image fails to load
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = '<span style="font-size: 48px; color: #ffffff;">👤</span>';
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '48px', color: '#ffffff' }}>👤</span>
                    )}
                  </div>

                  {/* Profile Text Container */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    flex: 1,
                    minWidth: 0,
                    position: 'relative',
                    zIndex: 1
                  }}>
                    <p style={{
                      color: '#333',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      margin: '0 0 8px 0'
                    }}>
                      {userData ?
                        (() => {
                          const personalInfo = parseJSON(userData.personal_info);
                          return personalInfo?.first_name && personalInfo?.last_name
                            ? `${personalInfo.first_name} ${personalInfo.last_name}`
                            : 'User Profile';
                        })()
                        : 'Loading...'
                      }
                    </p>
                    {userData && (() => {
                      const personalInfo = parseJSON(userData.personal_info);
                      return personalInfo?.email ? (
                        <p style={{
                          color: '#666',
                          fontSize: '14px',
                          fontWeight: '400',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          margin: '0 0 4px 0'
                        }}>
                          {personalInfo.email}
                        </p>
                      ) : null;
                    })()}
                    {userData && (() => {
                      const personalInfo = parseJSON(userData.personal_info);
                      return personalInfo?.phone ? (
                        <p style={{
                          color: '#666',
                          fontSize: '14px',
                          fontWeight: '400',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          margin: '0 0 4px 0'
                        }}>
                          {personalInfo.phone}
                        </p>
                      ) : null;
                    })()}
                    {userData && (() => {
                      const personalInfo = parseJSON(userData.personal_info);
                      const address = personalInfo?.user_address;
                      if (!address) return null;

                      // Display format: "City, Country" (e.g., "Sydney, Australia")
                      let displayText = '';
                      if (address.city && address.country) {
                        displayText = `${address.city}, ${address.country}`;
                      } else if (address.state && address.country) {
                        // Fallback to "State, Country" if no city
                        displayText = `${address.state}, ${address.country}`;
                      } else if (address.country) {
                        displayText = address.country;
                      }

                      return displayText ? (
                        <p style={{
                          color: '#666',
                          fontSize: '14px',
                          fontWeight: '400',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          margin: '0'
                        }}>
                          {displayText}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* Three Dots Menu */}
                  <div style={{ position: 'relative', zIndex: 999999, isolation: 'isolate' }} data-profile-dropdown>
                    <button
                      onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                      style={{
                        padding: '8px',
                        backgroundColor: 'transparent',
                        border: '1px solid #e9ecef',
                        borderRadius: '8px',
                        fontSize: '16px',
                        color: '#666',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '36px',
                        height: '36px',
                        position: 'relative',
                        zIndex: 999999
                      }}
                    >
                      <span className="text-xl leading-none">⋯</span>
                    </button>

                    {showProfileDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '44px',
                        right: '0px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e9ecef',
                        borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                        minWidth: '160px',
                        zIndex: 999999,
                        overflow: 'hidden',
                        isolation: 'isolate',
                        backdropFilter: 'blur(10px)'
                      }}>
                        <button
                          onClick={async () => {
                            setShowProfileDropdown(false);
                            await refreshProfileData();
                          }}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            fontSize: '14px',
                            color: '#333',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          ↻ Refresh
                        </button>

                        <button
                          onClick={() => {
                            console.log('✏️ Edit clicked - Opening JobGen.AI');
                            setShowProfileDropdown(false);
                            window.open('https://candidates.jobgen.ai/ai_apply', '_blank');
                          }}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            fontSize: '14px',
                            color: '#333',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          ↗ Edit
                        </button>

                        <button
                          onClick={async () => {
                            console.log('🚪 Logout clicked');
                            try {
                              await chrome.storage.local.clear();
                              console.log('✅ Local storage cleared - user logged out');

                              // Close dropdown
                              setShowProfileDropdown(false);

                              // Call logout callback if provided
                              if (onLogout) {
                                onLogout();
                              }
                            } catch (error) {
                              console.error('❌ Error during logout:', error);
                              if (onLogout) {
                                onLogout();
                              }
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            textAlign: 'left',
                            fontSize: '14px',
                            color: '#dc3545',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          ⎋ Logout
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : shouldShowLinkedInProfileDisplay ? (
                <LinkedInProfileDisplay
                  profileDisplayData={profileDisplayData}
                  matchesCachedProfile={matchesCachedProfileState}
                  logoSize={COMPANY_LOGOSIZE}
                  logoTextGap={LOGO_TEXT_GAP}
                  borderRadius={BUTTON_BORDER_RADIUS}
                  showActionsMenu={activeTab === 'linkedinTab'}
                  onGeneratingChange={setIsHeadshotGenerating}
                  onGenerateSubscriptionNeeded={handleGenerateSubscriptionNeeded}
                />
              ) : (
                <JobInfoDisplay
                  companyLogoUrl={companyLogoUrl}
                  jobTitle={jobTitle}
                  companyName={companyName}
                  jobLocation={jobLocation}
                  salaryDisplay={salaryDisplay}
                  onRatingChange={setSelectedRating}
                  initialRating={3}
                  logoSize={COMPANY_LOGOSIZE}
                  logoTextGap={LOGO_TEXT_GAP}
                  borderRadius={BUTTON_BORDER_RADIUS}
                />
              )}
            </div>

            {/* Tab Buttons - hide when no job selected and viewing profile, or on jobgen website viewing profile */}
            {!((isNoJobSelected && activeTab === 'profileTab') || (currentSite === 'jobgen' && activeTab === 'profileTab')) && (
              <div style={{ display: 'flex', borderBottom: '2px solid #ddd', position: 'relative', zIndex: 1 }}>
                <button
                  id="highLevelTab"
                  onClick={() => handleTabClick('highLevelTab')}
                  style={{
                    flex: 1,
                    padding: `${TAB_PADDING}px`,
                    backgroundColor: activeTab === 'highLevelTab' ? '#2B6BF5' : '#f4f4f4',
                    color: activeTab === 'highLevelTab' ? 'white' : 'black',
                    border: 'none',
                    borderRight: '2px solid #ddd',
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderRadius: `${BUTTON_BORDER_RADIUS}px ${BUTTON_BORDER_RADIUS}px 0 0`,
                    transition: 'background-color 0.3s',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}
                >
                  Job Match
                </button>
                <button
                  id="recentTab"
                  onClick={() => handleTabClick('recentTab')}
                  style={{
                    flex: 1,
                    padding: `${TAB_PADDING}px`,
                    backgroundColor: activeTab === 'recentTab' ? '#2B6BF5' : '#f4f4f4',
                    color: activeTab === 'recentTab' ? 'white' : 'black',
                    border: 'none',
                    borderRight: '2px solid #ddd',
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderRadius: `${BUTTON_BORDER_RADIUS}px ${BUTTON_BORDER_RADIUS}px 0 0`,
                    transition: 'background-color 0.3s',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}
                >
                  Recent
                </button>
                {(currentSite === 'seek' || currentSite === 'indeed') && (
                  <button
                    id="profileTab"
                    onClick={() => handleTabClick('profileTab')}
                    style={{
                      flex: 1,
                      padding: `${TAB_PADDING}px`,
                      backgroundColor: activeTab === 'profileTab' ? '#2B6BF5' : '#f4f4f4',
                      color: activeTab === 'profileTab' ? 'white' : 'black',
                      border: 'none',
                      textAlign: 'center',
                      cursor: 'pointer',
                      borderRadius: `${BUTTON_BORDER_RADIUS}px ${BUTTON_BORDER_RADIUS}px 0 0`,
                      transition: 'background-color 0.3s',
                      fontWeight: 'bold',
                      fontSize: '12px'
                    }}
                  >
                    Profile
                  </button>
                )}
                {currentSite === 'linkedin' && (
                  activeTab === 'profileTab' ? (
                    <button
                      id="profileTab"
                      onClick={() => handleTabClick('profileTab')}
                      style={{
                        flex: 1,
                        padding: `${TAB_PADDING}px`,
                        backgroundColor: '#2B6BF5',
                        color: 'white',
                        border: 'none',
                        textAlign: 'center',
                        cursor: 'pointer',
                        borderRadius: `${BUTTON_BORDER_RADIUS}px ${BUTTON_BORDER_RADIUS}px 0 0`,
                        transition: 'background-color 0.3s',
                        fontWeight: 'bold',
                        fontSize: '12px'
                      }}
                    >
                      Profile
                    </button>
                  ) : (
                    <button
                      id="linkedinTab"
                      onClick={() => handleTabClick('linkedinTab')}
                      style={{
                        flex: 1,
                        padding: `${TAB_PADDING}px`,
                        backgroundColor: activeTab === 'linkedinTab' ? '#2B6BF5' : '#f4f4f4',
                        color: activeTab === 'linkedinTab' ? 'white' : 'black',
                        border: 'none',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'background-color 0.3s',
                        fontWeight: 'bold',
                        borderRadius: `${BUTTON_BORDER_RADIUS}px ${BUTTON_BORDER_RADIUS}px 0 0`,
                        fontSize: '12px'
                      }}
                    >
                      LinkedIn Optimizer
                    </button>
                  )
                )}
              </div>
            )}

            {/* Warning Message */}
            {showWarning && (
              <div
                id="warningMessage"
                style={{
                  display: 'block',
                  margin: `${WARNING_MARGIN}px auto`,
                  padding: WARNING_PADDING,
                  maxWidth: '80%',
                  backgroundColor: '#ffe6e6',
                  color: '#cc0000',
                  border: '1px solid #cc0000',
                  borderRadius: '8px',
                  fontWeight: 600,
                  textAlign: 'center',
                  fontSize: '16px',
                  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)'
                }}
              >
                {warningMessage}
              </div>
            )}

            {isSubscribed === false && (
              <SubscriptionReminder
                onSubscribe={openSubscription}
                onRefresh={handleRefreshSubscription}
                isVisible={showSubscriptionReminderCard}
                onClose={() => setShowSubscriptionReminderCard(false)}
              />
            )}

            {isSubscribed === false && (
              <GenerateSubscriptionReminder
                onSubscribe={openSubscription}
                onRefresh={handleRefreshSubscription}
                isVisible={showGenerateSubscriptionCard}
                onClose={() => setShowGenerateSubscriptionCard(false)}
              />
            )}

            {/* FAQ Data Loading State */}
            {faqDataLoading && (
              <div style={{ padding: '20px' }}>
                <LoadingState
                  title="Loading Profile"
                  message="Checking onboarding status..."
                />
              </div>
            )}

            {/* Onboarding Reminder */}
            {!faqDataLoading && !onboardingComplete && (
              <OnboardingReminder
                emptyFieldCount={emptyFieldCount}
                missingDetailedInfo={missingDetailedInfo}
                missingPersonalFields={missingPersonalFields}
                missingWorkFields={missingWorkFields}
                onStartOnboarding={onStartOnboarding}
              />
            )}

            {/* Tabs Content */}
            <div
              id="tabsContent"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: `${CONTENT_PADDING}px`,
                boxSizing: 'border-box',
                marginBottom: '0px',
                position: 'relative',
                zIndex: 1
              }}
            >
              {activeTab === 'highLevelTab' && !showWarning && (
                <>
                  {currentSite === 'linkedin' && isLinkedInProfilePage(currentURL) ? (
                    <LinkedInJobMatchPrompt onNavigateToJobs={handleNavigateToJobs} />
                  ) : (
                    <JobMatchTab jobData={jobData} currentSite={currentSite} />
                  )}
                </>
              )}
              {activeTab === 'recentTab' && !showWarning && (
                <RecentTab />
              )}
              {currentSite === 'seek' && activeTab === 'profileTab' && !showWarning && (
                <ProfileTab />
              )}
              {currentSite === 'linkedin' && activeTab === 'profileTab' && !showWarning && (
                <ProfileTab />
              )}
              {currentSite === 'indeed' && activeTab === 'profileTab' && !showWarning && (
                <ProfileTab />
              )}
              {currentSite === 'jobgen' && activeTab === 'profileTab' && !showWarning && (
                <ProfileTab />
              )}
              {currentSite === 'linkedin' && activeTab === 'linkedinTab' && !showWarning && (
                <LinkedInTab
                  currentUrl={currentURL}
                  profileDisplayData={profileDisplayData}
                  isHeadshotGenerating={isHeadshotGenerating}
                />
              )}
            </div>

            {/* Resume Mode Section */}
            {(currentSite === 'seek' ||
              (isLinkedInJobPage(currentSite, currentURL)) ||
              currentSite === 'indeed') && (
                <TailoredResumeSwitch
                  enabled={enableTailoredResume}
                  onToggle={setEnableTailoredResume}
                  isExternalApply={isExternalApply}
                  activeApplicationCount={activeApplicationCount}
                />
              )}

            {/* Footer Section */}
            <div
              id="footer"
              style={{
                position: 'sticky',
                bottom: 0,
                width: '100%',
                padding: '0 0',
                backgroundColor: 'white',
                borderTop: '2px solid #ddd',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                borderBottomLeftRadius: `${CONTAINER_BORDER_RADIUS}px`,
                borderBottomRightRadius: `${CONTAINER_BORDER_RADIUS}px`
              }}
            >
              <button
                id="saveButton"
                onClick={handleSaveButton}
                disabled={isSaveDisabled}
                style={{
                  padding: BUTTON_PADDING,
                  margin: `${BUTTON_MARGIN}px`,
                  marginLeft: `${BUTTON_SAVE_MARGIN_LEFT}px`,
                  backgroundColor: isSaveDisabled ? '#1f4dc5' : '#2B6BF5',
                  color: 'white',
                  border: 'none',
                  borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                  fontWeight: 'bold',
                  opacity: isSaveDisabled ? 0.7 : 1,
                  cursor: isSaveDisabled ? 'default' : 'pointer'
                }}
              >
                {saveButtonText}
              </button>

              <Tooltip message={hasRequiredFieldsMissing ? "⚠️ Please complete your profile first" : "Manual step-by-step autofill (old version)"}>
                <button
                  id="autofillButton"
                  onClick={handleAutofillButton}
                  disabled={isApplyAutofillDisabled}
                  style={{
                    padding: BUTTON_PADDING,
                    margin: `${BUTTON_MARGIN}px`,
                    backgroundColor: isApplyAutofillDisabled ? '#e0e0e0' : '#f4f4f4',
                    color: isApplyAutofillDisabled ? '#999' : 'black',
                    border: 'none',
                    borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                    cursor: isApplyAutofillDisabled ? 'not-allowed' : 'pointer',
                    opacity: isApplyAutofillDisabled ? 0.6 : 1
                  }}
                >
                  {(() => {
                    // Check actual job status
                    const normalizeJobStatus = (status) => {
                      if (!status) return null;
                      return String(status).trim().toLowerCase();
                    };
                    const jobStatus = normalizeJobStatus(jobData?.jobgen_job_status);

                    // Show "Applied" if job already applied (and no active flow)
                    if (jobStatus === 'applied' && !hasActiveFlow) return 'Applied';
                    // Show "Autofilling..." if currently autofilling (active flow exists)
                    if ((isSeekProgressRunning && progressState.mode === 'autofill') || (hasActiveFlow && progressState.mode === 'autofill') || isIndeedAutoApplyRunning) return 'Autofilling...';
                    // Show "Autofill" otherwise
                    return 'Autofill';
                  })()}
                </button>
              </Tooltip>

              <Tooltip message={hasRequiredFieldsMissing ? "⚠️ Please complete your profile first" : (platformCapabilities(currentSite).autoApply ? "Complete the application automatically" : "Use Autofill, then review and submit on this site")}>
                <button
                  id="applyButton"
                  onClick={handleApplyButton}
                  disabled={isApplyAutofillDisabled || !platformCapabilities(currentSite).autoApply}
                  style={{
                    padding: BUTTON_PADDING,
                    margin: `${BUTTON_MARGIN}px`,
                    backgroundColor: isApplyAutofillDisabled ? '#e0e0e0' : '#f4f4f4',
                    color: isApplyAutofillDisabled ? '#999' : 'black',
                    border: 'none',
                    borderRadius: `${BUTTON_BORDER_RADIUS}px`,
                    cursor: isApplyAutofillDisabled ? 'not-allowed' : 'pointer',
                    opacity: isApplyAutofillDisabled ? 0.6 : 1
                  }}
                >
                  {(() => {
                    // Check actual job status
                    const normalizeJobStatus = (status) => {
                      if (!status) return null;
                      return String(status).trim().toLowerCase();
                    };
                    const jobStatus = normalizeJobStatus(jobData?.jobgen_job_status);

                    // Show "Applied" if job already applied (and no active flow)
                    if (jobStatus === 'applied' && !hasActiveFlow) return 'Applied';
                    // Show "Applying..." ONLY if there's an active flow (seek_flow_{jobId} exists)
                    if (hasActiveFlow || isSeekProgressRunning || isIndeedAutoApplyRunning) return 'Applying...';
                    // Default to "Apply"
                    return 'Apply';
                  })()}
                </button>
              </Tooltip>

            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default JobContainer;
