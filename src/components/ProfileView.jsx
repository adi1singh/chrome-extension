import React, { useState, useEffect } from 'react';
import PanelHeader from './PanelHeader';
import LoadingState from './LoadingState';
import CollapsibleSection from './CollapsibleSection';
import { getStoredFAQData, fetchUserFAQData } from '../services/apiService';

const ProfileView = ({ onMinimize, onBack, onLogout, onViewProgress, showProgressButton }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [_loadingTimeout, _setLoadingTimeout] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        console.log('🔍 Initial profile load - checking cache first...');
        const data = await getStoredFAQData();
        console.log('📋 User data received:', data);
        
        if (data) {
          console.log('✅ Setting user data');
          setUserData(data);
          setProfileError(null);
        } else {
          console.error('❌ No user data available');
          setProfileError('Failed to load profile data. Please try refreshing.');
        }
      } catch (error) {
        console.error('❌ Error fetching user data:', error);
        setProfileError('Failed to load profile data. Please try refreshing.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Listen for storage changes to update profile in real-time
  useEffect(() => {
    const handleStorageChange = async (changes, areaName) => {
      if (areaName === 'local' && changes.user_faq_data) {
        console.log('🔄 Storage change detected for FAQ data');
        
        if (changes.user_faq_data.newValue) {
          // Data was updated - refresh UI immediately
          console.log('✅ Updating profile with new data');
          setUserData(changes.user_faq_data.newValue);
          setProfileError(null);
          setLoading(false);
          setLastRefreshed(null); // Clear timestamp when storage updates
        } else if (changes.user_faq_data.oldValue && !changes.user_faq_data.newValue) {
          // Data was removed - clear UI and fetch fresh from API
          console.log('🗑️ Profile data was cleared - clearing UI and fetching fresh data');
          setUserData(null); // Clear the avatar/profile data immediately
          setLastRefreshed(null); // Clear timestamp
          setLoading(true);
          setProfileError(null);
          
          try {
            const freshData = await fetchUserFAQData();
            if (freshData) {
              setUserData(freshData);
              console.log('✅ Fresh data fetched after clear');
            } else {
              setProfileError('Profile data cleared. Please refresh.');
            }
          } catch (error) {
            console.error('❌ Error fetching after clear:', error);
            setProfileError('Profile data cleared. Please refresh.');
          } finally {
            setLoading(false);
          }
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
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('[data-dropdown]')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showDropdown]);

  // Helper function to parse JSON strings
  const parseJSON = (jsonString, defaultValue = {}) => {
    if (!jsonString) return defaultValue;
    try {
      return typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    } catch (e) {
      console.warn('Failed to parse JSON:', e);
      return defaultValue;
    }
  };

  // Parse user data
  const personalInfo = parseJSON(userData?.personal_info);
  const workPreferences = parseJSON(userData?.work_preferences);
  const education = parseJSON(userData?.education, []);
  const experience = parseJSON(userData?.experience, []);
  const rawSkills = parseJSON(userData?.skills, []);

  const extractString = (value, seen = new Set()) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (!value || typeof value !== 'object' || seen.has(value)) {
      return null;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const result = extractString(item, seen);
        if (result) return result;
      }
      return null;
    }

    const priorityKeys = ['name', 'label', 'value', 'title', 'skill_name', 'text'];
    for (const key of priorityKeys) {
      if (key in value) {
        const result = extractString(value[key], seen);
        if (result) return result;
      }
    }

    for (const nested of Object.values(value)) {
      const result = extractString(nested, seen);
      if (result) return result;
    }

    return null;
  };

  const normalizeSkillArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
  };

  const skills = normalizeSkillArray(rawSkills)
    .filter((skill) => {
      const label = extractString(skill);
      const experienceLabel = extractString(skill?.years_of_experience);
      return Boolean(label || experienceLabel);
    });

  const formatSkillLabel = (skill) => {
    const label = extractString(skill);
    const experienceLabel = extractString(skill?.years_of_experience);

    if (label && experienceLabel) {
      return `${label} (${experienceLabel})`;
    }

    if (label) {
      return label;
    }

    if (experienceLabel) {
      return `${experienceLabel} experience`;
    }

    if (skill == null) {
      return 'Skill';
    }

    return typeof skill === 'string' ? skill : JSON.stringify(skill);
  };

  const educationEntries = Array.isArray(education) ? education : [];
  const experienceEntries = Array.isArray(experience) ? experience : [];
  const skillEntries = Array.isArray(skills) ? skills : [];

  // Format data for CollapsibleSection
  const formatEducationItems = () => {
    if (educationEntries.length === 0) {
      return ['No education details are on file yet. They might still be syncing from JobGen.'];
    }
    return educationEntries.map(edu => {
      const institute = edu.institute || 'Institution not specified';
      const degree = edu.degree || 'Degree not specified';
      const dates = edu.start_date && edu.end_date 
        ? `${edu.start_date} – ${edu.ongoing === 'yes' ? 'Present' : edu.end_date}`
        : 'Dates not specified';
      return `${institute} - ${degree} (${dates})`;
    });
  };

  const formatExperienceItems = () => {
    if (experienceEntries.length === 0) {
      return ['No experience history is on file yet. It may still be syncing from JobGen.'];
    }
    return experienceEntries.map(exp => {
      const title = exp.title || 'Position not specified';
      const company = exp.company_name || 'Company not specified';
      const dates = exp.start_date && exp.end_date 
        ? `${exp.start_date} – ${exp.ongoing === 'yes' ? 'Present' : exp.end_date}`
        : 'Dates not specified';
      const description = exp.role_description && exp.role_description !== 'Yes' 
        ? ` - ${exp.role_description}` 
        : '';
      return `${title} at ${company} (${dates})${description}`;
    });
  };

  const formatSkillItems = () => {
    if (skillEntries.length === 0) {
      return ['No skills are on file yet. They may still be syncing from JobGen.'];
    }
    return skillEntries.map(skill => formatSkillLabel(skill));
  };

  const refreshProfileData = async () => {
    console.log('🔄 Refreshing profile data from API');
    setProfileError(null);
    setLoading(true);
    setLastRefreshed(null);
    
    try {
      // Clear cache to force fresh API call
      await chrome.storage.local.remove(['user_faq_data', 'user_faq_timestamp']);
      console.log('🗑️ Cache cleared');
      
      // Fetch fresh data from API
      console.log('📡 Fetching from API...');
      const data = await fetchUserFAQData();
      
      if (data) {
        setUserData(data);
        setProfileError(null);
        setLastRefreshed(new Date());
        console.log('✅ Profile refreshed successfully at', new Date().toLocaleTimeString());
      } else {
        console.error('❌ API returned no data');
        setProfileError('Unable to fetch profile data. Please try again.');
      }
    } catch (error) {
      console.error('❌ Refresh error:', error);
      setProfileError('Failed to refresh profile. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        id="jobContainer"
        style={{
          position: 'fixed',
          top: '0',
          right: '0',
          height: '100%',
          backgroundColor: '#FFFFFF',
          padding: '0',
          borderRadius: '20px',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
          zIndex: '99999',
          maxWidth: '400px',
          width: '400px',
          overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
          <PanelHeader 
            onMinimize={onMinimize}
            onBack={onBack}
            showBackButton={true}
            onViewProgress={onViewProgress}
            showProgressButton={showProgressButton}
          />
          <div style={{ padding: '18px' }}>
            <LoadingState
              title="Loading your profile"
              message="We are fetching your latest information from JobGen.AI"
            />
          </div>
        </div>
      </div>
    );
  }

  // Debug logging
  console.log('🔍 ProfileView render state:', { loading, profileError, userData: !!userData });

  return (
    <div
      id="jobContainer"
      style={{
        position: 'fixed',
        top: '0',
        right: '0',
        height: '100%',
        backgroundColor: '#FFFFFF',
        padding: '0',
        borderRadius: '20px',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
        zIndex: '99999',
        maxWidth: '400px',
        width: '400px',
        overflow: 'hidden' // Prevent scrolling on main container
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', position: 'relative', isolation: 'isolate' }}>
        {/* Universal Header */}
        <PanelHeader 
          onMinimize={onMinimize}
          onBack={onBack}
          showBackButton={true}
          onViewProgress={onViewProgress}
          showProgressButton={showProgressButton}
        />

        {/* Profile Content */}
        <div style={{ 
          padding: '10px', 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          overflowY: 'auto',
          height: 'calc(100vh - 70px)' // Subtract header height to prevent overlap
        }}>
          {profileError && (
            <div style={{
              backgroundColor: '#fff4f4',
              border: '1px solid #f8d7da',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              color: '#b42318'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                  We couldn't refresh your profile details right now.
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
                  {profileError}
                </div>
              </div>
              <button
                type="button"
                onClick={refreshProfileData}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#b42318',
                  border: '1px solid #f8d7da',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Profile Summary with Name and Actions */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '20px',
            position: 'relative',
            zIndex: 100
          }}>
            <div style={{ 
              flex: 1,
              position: 'relative',
              zIndex: 1
            }}>
              <h3 style={{ 
                color: '#333', 
                fontSize: '20px', 
                fontWeight: '700', 
                margin: '0 0 8px',
                lineHeight: '1.2' 
              }}>
                {personalInfo?.first_name && personalInfo?.last_name 
                  ? `${personalInfo.first_name} ${personalInfo.last_name}`
                  : 'User Profile'
                }
              </h3>
              
              <p style={{ 
                color: '#666', 
                fontSize: '14px', 
                margin: '0 0 4px',
                fontWeight: '400'
              }}>
                {workPreferences?.job_title || 'Professional'}
              </p>
              
              <p style={{ 
                color: '#999', 
                fontSize: '14px', 
                margin: '0',
                fontWeight: '400'
              }}>
                {personalInfo?.user_address?.city && personalInfo?.user_address?.country
                  ? `${personalInfo.user_address.city}, ${personalInfo.user_address.country}`
                  : 'Location not specified'
                }
              </p>
              
              {lastRefreshed && (
                <p style={{ 
                  color: '#28a745', 
                  fontSize: '12px', 
                  margin: '4px 0 0',
                  fontWeight: '500'
                }}>
                  ✓ Updated {lastRefreshed.toLocaleTimeString()}
                </p>
              )}
            </div>

            {/* Actions Menu */}
            <div style={{ position: 'relative', zIndex: 999999, isolation: 'isolate' }} data-dropdown>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
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
              
              {showDropdown && (
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
                      setShowDropdown(false);
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
                      setShowDropdown(false);
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
                    onClick={async() => {
                      console.log('🚪 Logout clicked');
                      try {
                        await chrome.storage.local.clear();
                        console.log('✅ Local storage cleared - user logged out');
                        
                        if (onLogout) {
                          onLogout();
                        } else {
                          onBack();
                        }
                      } catch (error) {
                        console.error('❌ Error during logout:', error);
                        if (onLogout) {
                          onLogout();
                        } else {
                          onBack();
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
          </div>

          <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

          {/* Profile Sections using CollapsibleSection */}
          <div style={{ width: '100%', textAlign: 'left' }}>
            <CollapsibleSection title="Education" items={formatEducationItems()} defaultExpanded={true} />
            
            <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />
            
            <CollapsibleSection title="Experience" items={formatExperienceItems()} defaultExpanded={true} />
            
            <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />
            
            <CollapsibleSection title="Skills" items={formatSkillItems()} defaultExpanded={true} />
          </div>
        </div>
        {/* Empty Footer for Spacing */}
        <div style={{ height: '20px' }}></div>
      </div>

    </div>
  );
};

export default ProfileView;
