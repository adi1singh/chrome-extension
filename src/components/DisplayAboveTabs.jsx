import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import StarRating from './StarRating';
import { generateProfileHeadshots } from '../services/apiService';
import { getStoredLinkedInCache, saveLinkedInCache } from '../utils/linkedinHelpers';

const DEFAULT_LOGO_SIZE = 120;  // Increased from 90 to 120 for better visibility
const DEFAULT_LOGO_TEXT_GAP = 20;  // Increased gap for better spacing
const DEFAULT_BUTTON_BORDER_RADIUS = 10;

export const JobInfoDisplay = ({
  companyLogoUrl,
  jobTitle,
  companyName,
  jobLocation,
  salaryDisplay,
  onRatingChange,
  initialRating = 3,
  logoSize = DEFAULT_LOGO_SIZE,
  logoTextGap = DEFAULT_LOGO_TEXT_GAP,
  borderRadius = DEFAULT_BUTTON_BORDER_RADIUS
}) => (
  <>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: `${logoTextGap}px`,
        width: `${logoSize}px`,
        height: `${logoSize}px`,
        flexShrink: 0,
        backgroundColor: '#f8f9fa',
        borderRadius: `${borderRadius}px`,
        border: '1px solid #e9ecef'
      }}
    >
      <img
        id="companyLogo"
        src={companyLogoUrl}
        draggable={false}
        alt="Company Logo"
        style={{
          maxWidth: '90%',
          maxHeight: '90%',
          objectFit: 'contain',
          borderRadius: `${borderRadius}px`
        }}
      />
    </div>

    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        flex: 1,
        minWidth: 0,
        height: `${logoSize}px`,
        overflow: 'hidden'
      }}
    >
      <p
        id="jobTitle"
        style={{
          color: '#002F8D',
          fontSize: '16px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
          minHeight: '20px',
          lineHeight: '20px'
        }}
      >
        {jobTitle || 'Job Title'}
      </p>
      <p
        id="companyName"
        style={{
          color: 'black',
          fontSize: '14px',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
          minHeight: '18px',
          lineHeight: '18px'
        }}
      >
        {companyName || 'Company Name'}
      </p>
      <p
        id="location"
        style={{
          color: 'black',
          fontSize: '13px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
          minHeight: '15px',
          lineHeight: '15px'
        }}
      >
        {jobLocation || 'Location'}
      </p>
      <p
        id="salary"
        style={{
          color: 'black',
          fontSize: '13px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
          minHeight: '16px',
          lineHeight: '16px'
        }}
      >
        {salaryDisplay || 'Salary not provided'}
      </p>

      <div>
        <StarRating onRatingChange={onRatingChange} initialRating={initialRating} />
      </div>
    </div>
  </>
);

export const LinkedInProfileDisplay = ({
  profileDisplayData = {},
  matchesCachedProfile = false,
  logoSize = DEFAULT_LOGO_SIZE,
  logoTextGap = DEFAULT_LOGO_TEXT_GAP,
  borderRadius = DEFAULT_BUTTON_BORDER_RADIUS,
  showActionsMenu = false,
  onGeneratingChange = null,
  onGenerateSubscriptionNeeded = null,
}) => {
  const fallbackImageUrl = useMemo(() => {
    if (typeof chrome === 'undefined') return null;
    try {
      return chrome.runtime?.getURL?.('icons/icon48.png') || null;
    } catch (error) {
      console.warn('⚠️ Unable to resolve fallback profile icon URL:', error);
      return null;
    }
  }, []);
  const originalProfilePhotoUrl = profileDisplayData?.profilePhotoUrl || '';
  const generatedPhotoUrl = profileDisplayData?.generatedPhotoUrl || null;
  const profileName = profileDisplayData?.profileName || '';
  const profileCompanyName = profileDisplayData?.profileCompanyName || '';
  const profileLocation = profileDisplayData?.profileLocation || '';
  const [showDropdown, setShowDropdown] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayedPhotoUrl, setDisplayedPhotoUrl] = useState(() => (
    (matchesCachedProfile && generatedPhotoUrl) ||
    originalProfilePhotoUrl ||
    fallbackImageUrl ||
    null
  ));
  const [generatedPhotos, setGeneratedPhotos] = useState([]);
  const [uploadedPhotoData, setUploadedPhotoData] = useState(null);
  const activeObjectUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  const persistProfilePhoto = useCallback(async (photo) => {
    if (!photo?.base64 || !photo?.mimeType) return;
    try {
      const dataUrl = `data:${photo.mimeType};base64,${photo.base64}`;
      const cachedProfile = await getStoredLinkedInCache();
      const existingDisplay = cachedProfile?.profileDisplayData || {};
      const originalUrl = existingDisplay.profilePhotoUrl || originalProfilePhotoUrl || '';
      const updatedProfileDisplayData = {
        ...existingDisplay,
        profilePhotoUrl: originalUrl,
        generatedPhotoUrl: dataUrl
      };
      await saveLinkedInCache({ profileDisplayData: updatedProfileDisplayData }, { merge: true });
    } catch (error) {
      console.warn('⚠️ Failed to cache profile photo selection', error);
    }
  }, [originalProfilePhotoUrl]);

  useEffect(() => {
    // Collapse dropdown when clicking outside the menu
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('[data-dropdown]')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    // Reset displayed image when generation completes or list clears
    if (!isGenerating && generatedPhotos.length === 0) {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
      const fallbackPhoto =
        (matchesCachedProfile && generatedPhotoUrl) ||
        originalProfilePhotoUrl ||
        fallbackImageUrl ||
        null;
      setDisplayedPhotoUrl(fallbackPhoto);
    }
  }, [
    originalProfilePhotoUrl,
    generatedPhotoUrl,
    matchesCachedProfile,
    isGenerating,
    generatedPhotos.length,
    fallbackImageUrl
  ]);

  useEffect(() => () => {
    // Cleanup on unmount by revoking any blob URL we created
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Notify parent component when generating state changes
    if (onGeneratingChange) {
      onGeneratingChange(isGenerating);
    }
  }, [isGenerating, onGeneratingChange]);

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('❌ Invalid file type. Please upload an image file.');
      alert('Please upload an image file (JPG, PNG, WEBP)');
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      console.error('❌ File too large. Maximum size is 10MB.');
      alert('File is too large. Please upload an image smaller than 10MB.');
      return;
    }

    console.log('📸 Uploading photo:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      setUploadedPhotoData({
        dataUrl,
        mimeType: file.type,
        fileName: file.name
      });
      console.log('✅ Photo uploaded successfully');

      // Update displayed photo to show the uploaded image
      setDisplayedPhotoUrl(dataUrl);

      // Keep dropdown open to show style options
      setShowDropdown(true);
    };
    reader.onerror = (error) => {
      console.error('❌ Failed to read file:', error);
      alert('Failed to upload photo. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateClick = async (style) => {
    // Request new headshots from the API and display the first variant
    if (isGenerating) return;

    // Check subscription status before generating
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['jobgen_is_subscribed'], (result) => {
          resolve(result);
        });
      });

      const isSubscribed = result?.jobgen_is_subscribed === true;

      if (!isSubscribed) {
        console.log('⚠️ User not subscribed - showing subscription reminder for generate feature');
        setShowDropdown(false);
        if (onGenerateSubscriptionNeeded) {
          onGenerateSubscriptionNeeded();
        }
        return;
      }
    } catch (error) {
      console.error('❌ Error checking subscription status:', error);
      // If we can't check subscription, show the reminder to be safe
      setShowDropdown(false);
      if (onGenerateSubscriptionNeeded) {
        onGenerateSubscriptionNeeded();
      }
      return;
    }

    setShowDropdown(false);
    setIsGenerating(true);

    try {
      // Prioritize uploaded photo over LinkedIn photo
      const photoToUse = uploadedPhotoData?.dataUrl || originalProfilePhotoUrl;

      // Check if we have a valid photo to use
      const isValidPhoto = photoToUse && photoToUse !== fallbackImageUrl;

      if (!isValidPhoto) {
        console.warn('⚠️ No valid photo available - prompting upload');
        setIsGenerating(false);
        // Trigger file input
        fileInputRef.current?.click();
        return;
      }

      console.log('🎨 Generating headshots using:', uploadedPhotoData ? 'uploaded photo' : 'LinkedIn photo');

      // Try 3 times if generateProfileHeadshots' response status is 200 but does not include image.

      let response;
      let variants = [];

      // Retry up to 3 times if the API does not return valid image data
      for (let i = 0; i < 3; i++) {
        response = await generateProfileHeadshots({
          imageUrl: photoToUse,
          style_option: style
        });

        // Try to extract variants regardless of success/error status
        if (response?.data) {
          variants = extractBase64Variants(response.data);
        }

        // If we got valid image data, stop retrying
        if (variants.length > 0) {
          break;
        }

        // Log the retry attempt
        console.log(`⚠️ No valid image data returned (Attempt ${i + 1}/3)`, {
          success: response?.success,
          hasData: !!response?.data,
          error: response?.error
        });
      }

      if (response?.success) {
        if (variants.length === 0) {
          console.log('API did not return valid data after 3 attempts');
          return;
        }

        const photos = variants.map((item, index) => {
          const mimeType = item.mimeType || inferMimeTypeFromKey(item.label);
          return {
            label: item.label || `variant-${index + 1}`,
            mimeType,
            base64: item.base64
          };
        });
        setGeneratedPhotos(photos);
        const firstPhoto = photos[0];
        if (firstPhoto) {
          const objectUrl = createPhotoObjectUrl(firstPhoto);
          if (objectUrl) {
            if (activeObjectUrlRef.current) {
              URL.revokeObjectURL(activeObjectUrlRef.current);
            }
            activeObjectUrlRef.current = objectUrl;
            setDisplayedPhotoUrl(objectUrl);
            persistProfilePhoto(firstPhoto);
          }
        }
        console.log('🎨 Photo generator result:', {
          variants,
          count: photos.length,
        });
      } else {
        console.error('❌ Photo generator failed:', response);
      }
    } catch (error) {
      console.error('❌ Failed to generate from LinkedIn photo:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadClick = async () => {
    // Download the currently displayed photo
    setShowDropdown(false);

    if (!displayedPhotoUrl) {
      console.warn('⚠️ No photo to download.');
      return;
    }

    try {
      // If it's a blob URL (generated photo), download directly
      if (displayedPhotoUrl.startsWith('blob:')) {
        const link = document.createElement('a');
        link.href = displayedPhotoUrl;
        link.download = `jobgen_ai_headshot_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // If it's a data URL (cached generated photo), download it
      if (displayedPhotoUrl.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = displayedPhotoUrl;
        link.download = `jobgen_ai_headshot_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // If it's a regular URL (original LinkedIn photo), fetch and download
      const response = await fetch(displayedPhotoUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `linkedin_photo_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('❌ Failed to download photo:', error);
    }
  };

  // Disable Generate on other's profile. Check by matchesCachedProfile
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%', position: 'relative', isolation: 'isolate' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: `${logoTextGap}px`,
          width: `${logoSize}px`,
          height: `${logoSize}px`,
          flexShrink: 0,
          backgroundColor: '#f8f9fa',
          borderRadius: `${borderRadius}px`,
          border: '1px solid #e9ecef',
          overflow: 'hidden'
        }}
      >
        <img
          src={displayedPhotoUrl || fallbackImageUrl || undefined}
          draggable={false}
          alt="Profile Image"
          style={{
            maxWidth: '90%',
            maxHeight: '90%',
            objectFit: 'contain',
            borderRadius: `${borderRadius}px`
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          flex: 1,
          minWidth: 0,
          height: `${logoSize}px`,
          overflow: 'visible',
          position: 'relative',
          zIndex: 1,
          gap: '2px'
        }}
      >
        <p
          style={{
            color: '#002F8D',
            fontSize: '16px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: '100%',
            minHeight: '20px',
            lineHeight: '20px',
            margin: 0
          }}
        >
          {profileName || 'Profile Name'}
        </p>
        <p
          style={{
            color: 'black',
            fontSize: '14px',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: '100%',
            minHeight: '18px',
            lineHeight: '18px',
            margin: 0
          }}
        >
          {profileCompanyName || 'Company'}
        </p>
        <p
          style={{
            color: 'black',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: '100%',
            minHeight: '15px',
            lineHeight: '15px',
            margin: 0
          }}
        >
          {profileLocation || 'Location'}
        </p>

        {showActionsMenu && matchesCachedProfile && (
          <div style={{ position: 'relative', zIndex: 10, marginTop: '0px' }} data-dropdown>
            <img
              src={chrome.runtime.getURL('generate_button.png')}
              alt="Generate Avatar"
              onClick={() => setShowDropdown(!showDropdown)}
              style={{
                cursor: matchesCachedProfile ? 'pointer' : 'not-allowed',
                opacity: matchesCachedProfile ? 1 : 0.6,
                transition: 'opacity 0.15s ease, transform 0.1s ease',
                display: 'block',
                height: '35px',
                width: 'auto',
                pointerEvents: matchesCachedProfile ? 'auto' : 'none'
              }}
              onMouseEnter={(e) => {
                if (matchesCachedProfile) {
                  e.currentTarget.style.opacity = '0.85';
                }
              }}
              onMouseLeave={(e) => {
                if (matchesCachedProfile) {
                  e.currentTarget.style.opacity = '1';
                }
              }}
              onMouseDown={(e) => {
                if (matchesCachedProfile) {
                  e.currentTarget.style.transform = 'translateY(0.5px)';
                }
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              title="Generate headshot"
            />

            {showDropdown && (
              <div
                data-dropdown
                style={{
                  position: 'absolute',
                  top: '44px',
                  right: '0px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e9ecef',
                  borderRadius: '12px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                  minWidth: '160px',
                  zIndex: 9999,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '4px 0'
                }}>
                {/* Show upload option if no valid photo */}
                {(!originalProfilePhotoUrl || originalProfilePhotoUrl === fallbackImageUrl) && !uploadedPhotoData ? (
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      fileInputRef.current?.click();
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: '14px',
                      color: '#2b6bf5',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: '600'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    📸 Upload Your Photo First
                  </button>
                ) : (
                  <>
                    {/* Success message when photo is uploaded */}
                    {uploadedPhotoData && (
                      <div style={{
                        padding: '12px 16px',
                        backgroundColor: '#e7f5e9',
                        borderBottom: '1px solid #c3e6cb',
                        fontSize: '13px',
                        color: '#28a745',
                        fontWeight: '600',
                        textAlign: 'center'
                      }}>
                        ✅ Photo uploaded! Select a style:
                      </div>
                    )}

                    {['Corporate', 'Executive', 'Professional', 'Startup'].map((style) => (
                      <button
                        key={style}
                        disabled={isGenerating || !matchesCachedProfile}
                        onClick={() => handleGenerateClick(style)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          textAlign: 'left',
                          fontSize: '14px',
                          color: '#333',
                          cursor: (isGenerating || !matchesCachedProfile) ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          opacity: (isGenerating || !matchesCachedProfile) ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!isGenerating && matchesCachedProfile) {
                            e.target.style.backgroundColor = '#f8f9fa';
                          }
                        }}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        {style}
                      </button>
                    ))}

                    {/* Show "Change Photo" option if photo was uploaded */}
                    {uploadedPhotoData && (
                      <>
                        <div style={{ height: '1px', backgroundColor: '#e9ecef', margin: '4px 0' }} />
                        <button
                          onClick={() => {
                            setShowDropdown(false);
                            fileInputRef.current?.click();
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
                          Change Photo
                        </button>
                      </>
                    )}

                    <div style={{ height: '1px', backgroundColor: '#e9ecef', margin: '4px 0' }} />
                    <button
                      onClick={handleDownloadClick}
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
                      Download
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoUpload}
      />
    </div>
  );
};

export default JobInfoDisplay;

function createPhotoObjectUrl(photo) {
  // Build an object URL from stored base64 data
  if (!photo?.base64) {
    return null;
  }
  try {
    return base64ToObjectUrl(photo.base64, photo.mimeType);
  } catch (error) {
    console.error('❌ Failed to build object URL from photo', error);
    return null;
  }
}

function extractBase64Variants(responseData) {
  // Walk arbitrary response payloads to collect base64 strings
  if (!responseData) return [];
  const variants = [];
  const traverse = (data, keyPrefix = '') => {
    if (!data) return;
    if (typeof data === 'string') {
      const normalized = data.replace(/\s/g, '');
      if (/^[A-Za-z0-9+/=]+$/.test(normalized) && normalized.length > 100) {
        variants.push({
          label: keyPrefix || 'variant',
          base64: normalized,
          mimeType: inferMimeTypeFromKey(keyPrefix)
        });
      }
      return;
    }
    if (Array.isArray(data)) {
      data.forEach((item, index) => traverse(item, `${keyPrefix}[${index}]`));
      return;
    }
    if (typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        const nextKey = keyPrefix ? `${keyPrefix}.${key}` : key;
        traverse(value, nextKey);
      });
    }
  };
  traverse(responseData);
  return variants;
}

function inferMimeTypeFromKey(key) {
  // Guess the image mime type based on response key hints
  if (typeof key === 'string' && key.toLowerCase().includes('png')) {
    return 'image/png';
  }
  return 'image/jpeg';
}

function base64ToObjectUrl(base64String, mimeType = 'image/jpeg') {
  // Convert a base64 string to a blob-backed object URL
  try {
    const byteCharacters = atob(base64String);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('❌ Failed to convert Base64 to object URL:', error);
    throw error;
  }
}
