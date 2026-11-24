import React, { useState, useEffect } from 'react';
import RingGraph from './RingGraph';
import CollapsibleSection from './CollapsibleSection';
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import LinkedInProfilePrompt from './LinkedInProfilePrompt';
import { sendLinkedinDetailsToBubble } from '../services/apiService';
import { checkLinkedInProfile } from '../utils/helpers';
import { LinkedInExtractor } from '../utils/siteExtractors.js';
import { compareProfileUrl, getStoredLinkedInCache, saveLinkedInCache, LINKEDIN_CACHE_KEY } from '../utils/linkedinHelpers.js';

const LinkedInTab = ({ currentUrl, profileDisplayData: incomingProfileDisplayData = null, isHeadshotGenerating = false }) => {
  const retryAnalysisRef = React.useRef(null);
  const [linkedInData, setLinkedInData] = useState(null);
  const [profileScore, setProfileScore] = useState(0);
  const [summary, setSummary] = useState('');
  const [headlineSuggestions, setHeadlineSuggestions] = useState([]);
  const [aboutSection, setAboutSection] = useState([]);
  const [experienceSection, setExperienceSection] = useState([]);
  const [educationSection, setEducationSection] = useState([]);
  const [skillsSection, setSkillsSection] = useState([]);
  const [featuredSection, setFeaturedSection] = useState([]);
  const [recommendedSection, setRecommendedSection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [_loadingTimeout, setLoadingTimeout] = useState(false);
  const [linkedinError, setLinkedinError] = useState(null);
  const [isOffProfilePage, setIsOffProfilePage] = useState(false);
  const [_showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const profileDisplayRef = React.useRef(incomingProfileDisplayData || null);

  useEffect(() => {
    profileDisplayRef.current = incomingProfileDisplayData || null;
  }, [incomingProfileDisplayData]);

  const effectiveUrl = React.useMemo(() => {
    if (currentUrl && typeof currentUrl === 'string') {
      return currentUrl;
    }
    if (typeof window !== 'undefined') {
      return window.location.href;
    }
    return '';
  }, [currentUrl]);

  const resolveLinkedInProfileUrl = React.useCallback(() => {
    try {
      const publicProfileHeading = Array.from(document.querySelectorAll('span.t-18.t-black.t-bold'))
        .find((el) => el.textContent?.trim().toLowerCase().includes('public profile'));

      if (publicProfileHeading) {
        const container = publicProfileHeading.closest('div.relative.display-flex.flex-column');
        const rawUrl = container?.querySelector('p.break-words')?.textContent?.trim();

        if (rawUrl) {
          console.log('=== Found linkedin profile url', rawUrl);
          return rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
        }
      }

    } catch (lookupError) {
      console.warn('⚠️ Failed to resolve LinkedIn profile URL from DOM:', lookupError);
    }

    return window.location.href;
  }, []);

  const resetSectionPlaceholders = () => {
    setProfileScore(0);
    setSummary('Analysing... please wait');
    setHeadlineSuggestions(['Analysing about details...']);
    setAboutSection(['Analysing about details...']);
    setExperienceSection(['Analysing experience details...']);
    setEducationSection(['Analysing education details...']);
    setSkillsSection(['Analysing skills details...']);
    setFeaturedSection(['Analysing featured details...']);
    setRecommendedSection(['Analysing recommended details...']);
  };

  useEffect(() => {
    let cancelled = false;

    if (!effectiveUrl) {
      console.warn('⚠️ LinkedInTab: Missing URL context, skipping analysis');
      setLoading(false);
      setLinkedInData(null);
      setShowUpgradeBanner(false);
      resetSectionPlaceholders();
      setLinkedinError('Unable to determine the current LinkedIn profile.');
      return () => {
        cancelled = true;
        retryAnalysisRef.current = null;
      };
    }

    const analyzeLinkedInProfile = async () => {
      setLoading(true);
      setLinkedinError(null);
      setIsOffProfilePage(false);
      setLinkedInData(null);
      resetSectionPlaceholders();

      // TODO: Use linkedinHelpers'
      if (!checkLinkedInProfile()) {
        console.log('ℹ️ LinkedIn optimizer: Not on a LinkedIn profile page');
        setIsOffProfilePage(true);
        setLinkedInData(null);
        resetSectionPlaceholders();
        setLoading(false);
        return;
      }

      try {
        const profileUrl = resolveLinkedInProfileUrl();
        const displayForRequest = profileDisplayRef.current || null;
        const cachedProfile = await getStoredLinkedInCache();

        if (cancelled) {
          return;
        }

        // Use stored LinkedIn URLs (if any) to determine whether the cache matches the current page
        const cachedUrls = Array.isArray(cachedProfile?.profileUrls)
          ? cachedProfile.profileUrls.filter(Boolean)
          : [];

        const urlComparisonFlag = cachedUrls.some((cachedUrl) => compareProfileUrl(cachedUrl, profileUrl));

        // If we have cached data but the URLs no longer match, show mismatch instead of reusing stale data
        if (cachedUrls.length > 0 && !urlComparisonFlag) {
          console.log('⚠️ Stored LinkedIn profile does not match current URL, showing mismatch');
          setLinkedinError('profile_mismatch');
          setLinkedInData(null);
          return;
        }

        const allData = await LinkedInExtractor.extractLinkedInProfile();
        if (cancelled) return;

        const extractedData = JSON.stringify(allData, null, 2);

        // Reuse previous API response if DOM data, profile, and photo all match the cache
        if (cachedProfile && urlComparisonFlag &&
          cachedProfile.extractedData === extractedData
          && cachedProfile.responseData) {
          console.log('✅ Using cached LinkedIn optimization data');
          setLinkedInData(cachedProfile.responseData);
          return;
        }

        const payloadForAnalysis = { ...allData };
        if ('profilePhotoUrl' in payloadForAnalysis) {
          // Do not send the photo itself to Bubble; strip before serialization
          delete payloadForAnalysis.profilePhotoUrl;
        }
        const sanitizedPayload = JSON.stringify(payloadForAnalysis, null, 2);

        const linkedInFromBubble = await sendLinkedinDetailsToBubble(sanitizedPayload, profileUrl);

        if (cancelled) {
          return;
        }

        if (linkedInFromBubble) {
          setLinkedInData(linkedInFromBubble);
          // Only cache successful, non-mismatch responses; add the default /in/me shortcut for reuse
          if (linkedInFromBubble.profileMismatch !== 'no') {
            return;
          }
          const profileUrls = Array.from(new Set(
            [profileUrl, 'https://www.linkedin.com/in/me/'].filter(Boolean)
          ));
          const profileDisplayData = displayForRequest;
          await saveLinkedInCache({
            profileUrls,
            extractedData,
            responseData: linkedInFromBubble,
            profileDisplayData,
            timestamp: Date.now()
          });
        } else {
          setLinkedinError('No optimization data returned. Please try again.');
          setLinkedInData(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('❌ Error analysing LinkedIn profile:', error);
          setLinkedinError('LinkedIn analysis failed. Please try again.');
          setLinkedInData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    console.log('🔄 LinkedInTab: analyzing profile for', effectiveUrl);
    analyzeLinkedInProfile();

    retryAnalysisRef.current = () => {
      if (!cancelled) {
        analyzeLinkedInProfile();
      }
    };

    return () => {
      cancelled = true;
      retryAnalysisRef.current = null;
    };
  }, [effectiveUrl, resolveLinkedInProfileUrl]);

  // Timeout effect for loading state
  useEffect(() => {
    let timeoutId;

    if (loading && !linkedinError) {
      setLoadingTimeout(false);

      timeoutId = setTimeout(() => {
        console.log("⏰ LinkedInTab loading timeout reached, showing error state");
        setLoadingTimeout(true);
        setLoading(false);
        resetSectionPlaceholders();
        setLinkedinError('Loading timeout - please try refreshing or check your connection');
      }, 20000); // 20 seconds
    } else if (linkedInData) {
      // Clear timeout if data arrives
      setLoadingTimeout(false);
      setLoading(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [loading, linkedinError, linkedInData]);

  useEffect(() => {
    if (!linkedInData || loading) {
      return;
    }

    console.log('=== LinkedinTab.jsx received', linkedInData);

    if (linkedInData.profileMismatch !== 'no') {
      setLinkedinError('profile_mismatch');
      return;
    }

    const answer = linkedInData;

    if (answer['Short Summary']) {
      setSummary(answer['Short Summary']);
    }

    if (answer['Profile Score']) {
      setProfileScore(answer['Profile Score']);
    }

    if (answer['Headline Suggestions']) {
      setHeadlineSuggestions(answer['Headline Suggestions']);
    }

    if (answer['Improved About Section']) {
      setAboutSection([answer['Improved About Section']]);
    }

    if (answer['Experience Improvement']) {
      let expData = answer['Experience Improvement'];
      if (typeof expData === 'string') {
        try {
          expData = JSON.parse(expData);
        } catch {
          expData = [expData];
        }
      }
      if (!Array.isArray(expData)) {
        expData = [expData];
      }
      const expList = expData.map((exp) => {
        if (typeof exp === 'string') {
          return exp;
        } else if (typeof exp === 'object' && exp !== null) {
          return exp.text || JSON.stringify(exp);
        }
        return String(exp);
      });
      setExperienceSection(expList);
    }

    if (answer['Education Improvement']) {
      let eduData = answer['Education Improvement'];
      if (typeof eduData === 'string') {
        try {
          eduData = JSON.parse(eduData);
        } catch {
          eduData = [eduData];
        }
      }
      if (!Array.isArray(eduData)) {
        eduData = [eduData];
      }
      const eduList = eduData.map((edu) => {
        if (typeof edu === 'string') {
          return edu;
        } else if (typeof edu === 'object' && edu !== null) {
          return edu.text || edu.name || edu.degree || JSON.stringify(edu);
        }
        return String(edu);
      });
      setEducationSection(eduList);
    }

    if (answer['Skills Improvement']) {
      setSkillsSection(answer['Skills Improvement']);
    }

    const featuredSelectors = [
      '#featured',
      'section[componentkey*="Featured"]',
      'section.b0dc9c1e._066cc8a8._6b05d44c.f938640f._175c241a[componentkey*="Featured"]'
    ];
    const featuredElement = featuredSelectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    const featuredText = featuredElement ?
      'Good job you have a featured section!' :
      'It is recommended to have some achievements featured, feature atleast 2 posts.';
    setFeaturedSection([featuredText]);

    const recommendSelectors = [
      '#recommendations',
      'section[componentkey*="RecommendationsTopLevel"]',
      'section.b0dc9c1e._066cc8a8._6b05d44c.f938640f._175c241a[componentkey*="Recommendations"]'
    ];
    const recommendElement = recommendSelectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    let recommendText = recommendElement ?
      'Good job you have some recommendations!' :
      'Please get some recommendations';

    if (recommendElement) {
      const recommendCountE = document.querySelector('#navigation-index-see-all-recommendations');
      const recommendCount = recommendCountE ?
        recommendCountE.innerText :
        'Have atleast 5 recommendations.';
      recommendText += ' ' + recommendCount;
    }
    setRecommendedSection([recommendText]);
  }, [linkedInData, loading]);

  if (isOffProfilePage) {
    return (
      <div style={{ padding: '18px' }}>
        <LinkedInProfilePrompt
          onOpenProfile={() => {
            window.open('https://www.linkedin.com/in/', '_blank');
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '18px' }}>
        <LoadingState
          title="Analysing your LinkedIn profile"
          message="We are reviewing your profile sections and generating personalized optimization suggestions."
          tip="This analysis may take a few moments for comprehensive insights"
        />
      </div>
    );
  }

  if (linkedinError) {
    // Profile mismatch error - special handling
    if (linkedinError === 'profile_mismatch') {
      return (
        <div style={{ padding: '18px' }}>
          <ErrorState
            title="Profile Mismatch Detected"
            message="We detected a mismatch between your JobGen.AI profile and the LinkedIn profile you're viewing."
            actionText="Update LinkedIn on JobGen.AI"
            onAction={() => {
              if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
                chrome.storage.local.remove([LINKEDIN_CACHE_KEY], () => {
                  console.log('Clear LinkedIn cache after Update Linkedin');
                });
              }
              window.open('https://candidates.jobgen.ai/account', '_blank');
            }}
          // secondaryMessage={
          //   <div style={{ marginTop: '10px', fontSize: '13px', color: '#666' }}>
          //     💡 Want to analyze other profiles? {' '}
          //     <a href="https://jobgen.ai/pricing" target="_blank" style={{ color: '#007e33', fontWeight: 600, textDecoration: 'underline' }}>
          //       Upgrade
          //     </a> for full access.
          //   </div>
          // }
          />
        </div>
      );
    }

    // Regular error
    return (
      <div style={{ padding: '18px' }}>
        <ErrorState
          title="LinkedIn Analysis Failed"
          message={linkedinError}
          actionText="Retry"
          onAction={() => {
            setLinkedinError(null);
            setLoading(true);
            setLoadingTimeout(false);
            retryAnalysisRef.current?.();
          }}
        />
      </div>
    );
  }


  return (
    <div id="linkedinContent" style={{ padding: '10px', position: 'relative' }}>
      {isHeadshotGenerating && (
        <div style={{ marginBottom: '20px' }}>
          <LoadingState
            title="Generating Headshot"
            message="Creating your professional photo..."
          />
        </div>
      )}
      {/* Summary section with text wrapping around the score icon */}
      <div style={{
        marginBottom: '20px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Score icon positioned to float right with text wrapping */}
        <div style={{
          float: 'right',
          marginLeft: '15px',
          marginBottom: '10px',
          marginTop: '5px',
          zIndex: 10,
          clear: 'right'
        }}>
          <RingGraph percentage={profileScore} id="linkedinscore" />
        </div>

        <h4 style={{ color: 'black', fontWeight: 'bold', marginBottom: '10px' }}>Summary:</h4>
        <div id="linkedinSummary" style={{
          color: 'black',
          lineHeight: '1.2',
          wordWrap: 'break-word'
        }}>
          {(() => {
            const text = summary || '';

            // 1) browser（UAX#29）
            let parts = [];
            try {
              if (typeof Intl !== 'undefined' && Intl.Segmenter) {
                const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
                parts = Array.from(seg.segment(text)).map(s => (s.segment || '').trim()).filter(Boolean);
              }
            } catch { /* Optional operation; preserve the existing fallback. */  }

            // 2) re
            if (parts.length === 0) {
              const abbreviations = [
                'e.g.', 'i.e.', 'etc.', 'Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'vs.',
                'Ltd.', 'Inc.', 'Co.', 'St.', 'Rd.', 'Ave.', 'U.S.', 'U.K.', 'Ph.D.', 'M.Sc.', 'B.Sc.'
              ];
              let masked = text;
              const maskMap = new Map();
              abbreviations.forEach((abbr, idx) => {
                const token = `__ABBR_${idx}__`;
                maskMap.set(token, abbr);
                masked = masked.split(abbr).join(token);
              });
              const rawParts = masked.split(/(?<=[.!?])\s+(?=[A-Z"([])/);
              parts = rawParts.map(p => {
                let s = p;
                maskMap.forEach((abbr, token) => { s = s.split(token).join(abbr); });
                return s.trim();
              }).filter(Boolean);
            }

            return parts.map((sentence, index) => {
              const isLast = index === parts.length - 1;
              if (index < 3 && !isLast) {
                return (
                  <p key={index} style={{ margin: 0, marginBottom: '8px', fontSize: '14px' }}>
                    {sentence.trim()}{/\.$/.test(sentence) ? '' : '.'}
                  </p>
                );
              }
              if (isLast) {
                return <span key={index}>{sentence.trim()}</span>;
              }
              return <span key={index}>{sentence.trim()}{/\.$/.test(sentence) ? ' ' : '. '}</span>;
            });
          })()}
        </div>
      </div>

      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <CollapsibleSection title="Headline" items={headlineSuggestions} />
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <CollapsibleSection title="About" items={aboutSection} />
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <CollapsibleSection title="Experience" items={experienceSection} />
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <CollapsibleSection title="Education" items={educationSection} />
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <CollapsibleSection title="Skills" items={skillsSection} />
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <CollapsibleSection title="Featured" items={featuredSection} />
      <hr style={{ border: '1px solid #ddd', margin: '20px 0' }} />

      <CollapsibleSection title="Recommended" items={recommendedSection} />
    </div>
  );
};

export default LinkedInTab;
