import React, { useState, useEffect } from 'react';
import CollapsibleSection from './CollapsibleSection';
import LoadingState from './LoadingState';
import { getStoredFAQData, fetchUserFAQData } from '../services/apiService';

const ProfileTab = () => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        console.log('🔍 ProfileTab: Loading profile data...');
        const data = await getStoredFAQData();
        
        if (data) {
          setUserData(data);
          setProfileError(null);
          console.log('✅ ProfileTab: Data loaded');
        } else {
          console.log('⚠️ ProfileTab: No data available');
          setProfileError('Failed to load profile data. Please try refreshing.');
        }
      } catch (error) {
        console.error('❌ ProfileTab: Error fetching user data:', error);
        setProfileError('Failed to load profile data. Please try refreshing.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = async (changes, areaName) => {
      if (areaName === 'local' && changes.user_faq_data) {
        console.log('🔄 ProfileTab: Storage change detected');
        
        if (changes.user_faq_data.newValue) {
          // Data updated
          console.log('✅ ProfileTab: Updating with new data');
          setUserData(changes.user_faq_data.newValue);
          setProfileError(null);
          setLoading(false);
        } else if (changes.user_faq_data.oldValue && !changes.user_faq_data.newValue) {
          // Data was cleared - fetch fresh
          console.log('🗑️ ProfileTab: Data cleared, fetching fresh');
          setUserData(null);
          setLoading(true);
          
          try {
            const freshData = await fetchUserFAQData();
            if (freshData) {
              setUserData(freshData);
              setProfileError(null);
              console.log('✅ ProfileTab: Fresh data loaded');
            } else {
              setProfileError('Profile data cleared. Please refresh.');
            }
          } catch (error) {
            console.error('❌ ProfileTab: Error fetching fresh data:', error);
            setProfileError('Failed to load profile. Please refresh.');
          } finally {
            setLoading(false);
          }
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
  }, []);

  // Helper function to parse JSON strings
  const parseJSON = (jsonString, defaultValue = {}) => {
    if (!jsonString) return defaultValue;
    try {
      return typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    } catch (_e) {
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

  const skills = normalizeSkillArray(rawSkills).filter((skill) => {
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
    return typeof skill === 'string' ? skill : 'Skill';
  };

  const educationEntries = Array.isArray(education) ? education : [];
  const experienceEntries = Array.isArray(experience) ? experience : [];
  const skillEntries = Array.isArray(skills) ? skills : [];

  // Format data for CollapsibleSection
  const formatEducationItems = () => {
    if (educationEntries.length === 0) {
      return ['No education details are on file yet.'];
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
      return ['No experience history is on file yet.'];
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
      return ['No skills are on file yet.'];
    }
    return skillEntries.map(skill => formatSkillLabel(skill));
  };

  const formatContactItems = () => {
    const contactInfo = [];
    
    if (workPreferences?.job_title) {
      contactInfo.push(`Expected Job Title: ${workPreferences.job_title}`);
    }
    
    if (personalInfo?.linkedin) {
      contactInfo.push(`LinkedIn: ${personalInfo.linkedin}`);
    }
    
    if (contactInfo.length === 0) {
      return ['No personal information available'];
    }
    
    return contactInfo;
  };

  if (loading) {
    return (
      <div style={{ padding: '18px' }}>
        <LoadingState
          title="Loading your profile"
          message="We are fetching your latest information from JobGen.AI"
        />
      </div>
    );
  }

  if (profileError) {
    return (
      <div style={{ padding: '18px', textAlign: 'center', color: '#999' }}>
        <p>{profileError}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px' }}>
      {/* Profile Sections */}
      <CollapsibleSection title="Personal" items={formatContactItems()} defaultExpanded={true} />
      
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />
      
      <CollapsibleSection title="Education" items={formatEducationItems()} defaultExpanded={true} />
      
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />
      
      <CollapsibleSection title="Experience" items={formatExperienceItems()} defaultExpanded={true} />
      
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />
      
      <CollapsibleSection title="Skills" items={formatSkillItems()} defaultExpanded={true} />
    </div>
  );
};

export default ProfileTab;

