// Site-specific data extraction utilities

export class LinkedInExtractor {

  static async waitViaObserver(selectorList, timeout = 10000, rootDoc = document) {
    return new Promise((resolve) => {
      let observer = null;
      let timeoutId = null;

      const finish = (payload) => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(payload);
      };

      // 1. Instant check
      for (const selector of selectorList) {
        const el = rootDoc.querySelector(selector);
        if (el) {
          console.log("Observer Instant check", performance.now());
          return finish({ selector, el });
        }
      }

      // 2. Observer for future DOM changes
      observer = new MutationObserver(() => {
        for (const selector of selectorList) {
          const el = rootDoc.querySelector(selector);
          if (el) {
            console.log("Observer Detect", performance.now());
            return finish({ selector, el });
          }
        }
      });

      observer.observe(rootDoc.body, {
        childList: true,
        subtree: true
      });

      // 3. Timeout
      timeoutId = setTimeout(() => {
        console.warn(`Timeout – none found: ${selectorList.join(', ')}`);
        finish({ selector: null, el: null });
      }, timeout);
    });
  }

  static getJobIdFromUrl(url = window.location.href) {
    try {
      const urlObj = new URL(url);
      const { pathname, searchParams } = urlObj;

      return (
        (pathname.match(/\/jobs\/view\/(\d+)/) || [])[1] ||
        searchParams.get('currentJobId') ||
        (pathname.match(/(\d{6,})/) || [])[1] ||
        null
      );
    } catch (error) {
      console.warn('⚠️ Invalid URL encountered while extracting LinkedIn job ID:', url, error);
      return null;
    }
  }

  //TODO: Improve code quality
  static async extractJobInfo() {
    const url = window.location.href;
    const lowerUrl = url.toLowerCase();

    // Allow the LinkedIn UI a brief moment to hydrate before we inspect it
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (lowerUrl.includes('linkedin.com/jobs/view/')) {
      return await this.extractNewTabJobInfo(url);
    }

    return await this.extractLegacyJobInfo(url);
  }

  // Try to resolve the main LinkedIn profile iframe document (e.g. /preload interop iframe)
  static getLinkedInIframeDocument() {
    const iframeSelectors = [
      'iframe[data-testid="interop-iframe"]',
      'iframe[src^="/preload"]',
      'iframe[src*="linkedin.com/preload"]'
    ];

    const iframe = document.querySelector(iframeSelectors.join(', '));
    if (!iframe) return null;

    try {
      return iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document) || null;
    } catch (error) {
      console.warn('LinkedInExtractor: Unable to access LinkedIn iframe document:', error);
      return null;
    }
  }

  static extractProfilePhotoUrl(rootDoc = null) {
    console.log('🔍 [Photo Extraction] Starting profile photo extraction...');

    // Candidate selectors covering different LinkedIn layouts for the profile photo
    const photoSelectors = [
      '[data-view-name="profile-top-card-member-photo"] img',
      'img.pv-top-card-profile-picture__image--show',
      'img.pv-top-card-profile-picture__image--cover',
      'button.pv-top-card-profile-picture__container img',
      '.pv-top-card-profile-picture__image--show img',
      '.pv-top-card__photo-wrapper img',
      '.pv-top-card__non-self-photo-wrapper img',
      '.profile-photo-edit__edit-btn img',
      'img.profile-photo-edit__preview',
      '.profile-photo-edit__preview img',
      '.profile-photo-edit__preview',
      // Additional modern LinkedIn selectors
      'img.pv-top-card-profile-picture__image',
      '.pv-top-card--photo img',
      '[data-test-profile-photo] img',
      'button[aria-label*="photo" i] img',
      'button[aria-label*="picture" i] img'
    ];

    const resolveDoc = () => {
      if (rootDoc && rootDoc !== document) {
        return rootDoc;
      }

      const hasRehydrated = (doc) => !!doc?.body && doc.body.getAttribute('data-rehydrated') === 'true';
      if (!hasRehydrated(document)) {
        return document;
      }

      try {
        return this.getLinkedInIframeDocument?.() || document;
      } catch (error) {
        console.warn('LinkedInExtractor: Unable to access LinkedIn iframe document:', error);
        return document;
      }
    };

    const doc = resolveDoc();
    if (!doc) {
      return '';
    }

    const selectorList = photoSelectors.join(', ');

    // Helper to normalise an element into a usable image URL (src, srcset or background-image)
    const extractImageFromElement = (element) => {
      if (!element) return '';

      let directSource = '';
      if (element.tagName === 'IMG') {
        const attrUrl =
          element.getAttribute('src') ||
          element.getAttribute('data-delayed-url') ||
          element.getAttribute('data-ghost-url') ||
          element.getAttribute('data-test-feature-image-url');
        const srcsetUrl = element.currentSrc || element.getAttribute('srcset');
        const candidate = srcsetUrl || attrUrl;
        if (candidate) {
          directSource = candidate.split(',').shift()?.trim() || '';
        }
      }

      if (directSource) {
        return directSource;
      }

      if (typeof window !== 'undefined') {
        const backgroundImage = window.getComputedStyle(element).backgroundImage;
        if (backgroundImage && backgroundImage !== 'none') {
          const match = backgroundImage.match(/url\(["']?(.*?)["']?\)/i);
          if (match && match[1]) {
            return match[1];
          }
        }
      }

      return '';
    };

    const candidateElements = Array.from(doc.querySelectorAll(selectorList));
    console.log(`🔍 [Photo Extraction] Found ${candidateElements.length} candidate elements`);

    // Walk through candidates and return the first non-placeholder URL we find
    for (let i = 0; i < candidateElements.length; i++) {
      const candidate = candidateElements[i];
      const candidateSrc = extractImageFromElement(candidate);

      console.log(`🔍 [Photo Extraction] Candidate ${i + 1}:`, {
        element: candidate.tagName,
        className: candidate.className,
        src: candidateSrc ? candidateSrc.substring(0, 100) + '...' : 'none'
      });

      if (!candidateSrc) continue;

      if (/data:image\/gif;base64/i.test(candidateSrc)) {
        console.log(`⚠️ [Photo Extraction] Skipping placeholder GIF image`);
        continue;
      }

      console.log(`✅ [Photo Extraction] Using photo from candidate ${i + 1}`);
      return candidateSrc.trim();
    }

    console.warn('❌ [Photo Extraction] No valid profile photo found');
    return '';
  }

  static async extractLinkedInProfile() {
    const hasRehydrated = (doc) => !!doc?.body && doc.body.getAttribute('data-rehydrated') === 'true';

    let docContext = null;
    if (!hasRehydrated(document)) {
      docContext = document;
    } else {
      try {
        docContext = this.getLinkedInIframeDocument?.() || null;
      } catch (_error) { /* Optional operation; preserve the existing fallback. */ 
      }
    }

    if (!docContext) {
      console.warn('LinkedInExtractor: no document context available for profile extraction');
      return {
        profilePhotoUrl: '',
        name: 'Not Found',
        headline: 'Not Found',
        about: 'Not Found',
        experience: [],
        education: [],
        skills: [],
        projects: [],
        certifications: [],
        languages: []
      };
    }

    console.log('Extract Profile in iframe?', hasRehydrated(document));
    const readinessSelectors = [
      '[data-view-name="profile-card"] #experience',
      '[data-view-name="profile-card"] #education',
      '[data-view-name="profile-card"] #insights'
      // '#profile-content',
      // '#profile-content section',
      // 'section.artdeco-card',
      // '#profile-content main h1', 
      // 'main h1',
      // '#profile-content section .display-flex.ph5.pv3'
    ];

    const node = await this.waitViaObserver(readinessSelectors, 10000, docContext);
    console.log('Observed returned nodes', node);

    const getElementText = (selector) => {
      const element = docContext?.querySelector?.(selector);
      if (element && element.innerText && element.innerText.trim().length > 0) {
        return element.innerText.trim();
      }
      return 'Not Found';
    };

    const getCleanInnerText = (element) => {
      if (!element) return '';

      const clone = element.cloneNode(true);
      clone.querySelectorAll?.('.visually-hidden').forEach((hidden) => hidden.remove());

      const lines = (clone.innerText || '')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      const seen = new Set();
      const uniqueLines = [];
      for (const line of lines) {
        const key = line.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          uniqueLines.push(line);
        }
      }

      return uniqueLines.join('\n');
    };

    const getListItemsBySection = (sectionTitle) => {
      const section = Array.from(docContext?.querySelectorAll?.('section') || [])
        .find((sec) => sec.querySelector('h2')?.innerText.includes(sectionTitle));
      // console.log('section', section);
      if (section) {
        const preferredItems = section.querySelectorAll('li.artdeco-list__item');
        const listItems = preferredItems.length ? preferredItems : section.querySelectorAll('li');
        return Array.from(listItems)
          .map((item) => getCleanInnerText(item))
          .filter((text) => text && text.length > 0);
      }
      return [];
    };

    const profileData = {
      profilePhotoUrl: this.extractProfilePhotoUrl(),
      name: getElementText('h1'),
      headline: getElementText('.text-body-medium.break-words'),
      about: getElementText('#profile-content section:nth-child(3) div.display-flex.ph5.pv3 span.visually-hidden'),
      experience: getListItemsBySection('Experience'),
      education: getListItemsBySection('Education'),
      skills: getListItemsBySection('Skills'),
      projects: getListItemsBySection('Projects'),
      certifications: getListItemsBySection('Certifications'),
      languages: getListItemsBySection('Languages')
    };

    console.log('✅ Extracted LinkedIn Profile Data:', profileData);

    return profileData;
  }

  static async extractLinkedInProfileDisplay() {
    const selectDocContext = () => {
      const hasRehydrated = (doc) => !!doc?.body && doc.body.getAttribute('data-rehydrated') === 'true';
      if (!hasRehydrated(document)) {
        return document;
      }

      try {
        return this.getLinkedInIframeDocument?.() || document;
      } catch (error) {
        console.warn('LinkedInExtractor: Unable to access LinkedIn iframe document:', error);
        return document;
      }
    };

    const docContext = selectDocContext();
    const queryFirst = (doc, selector) => doc.querySelector(selector);
    const _queryAll = (doc, selector) => Array.from(doc.querySelectorAll(selector));

    // Selectors used to locate the primary company button/container on the profile
    const companyButtonSelectors = [
      '.pv-text-details__right-panel button[aria-label*="Current company" i]',
      '.pv-text-details__right-panel button[aria-label*="Company" i]',
      '.pv-text-details__left-panel button[aria-label*="Current company" i]',
      '.pv-text-details__left-panel button[aria-label*="Company" i]',
      'button[aria-label*="Current company" i]',
      'button[aria-label*="Company" i]',
      'button[aria-label*="Education" i]',
      'button[aria-label*="Current education" i]'
    ];

    const companySelector = companyButtonSelectors.join(',');
    const node = await this.waitForElement(companySelector, 5000, docContext);
    console.log(node);

    // Accumulator for the final profile display fields we care about
    const result = {
      profilePhotoUrl: '',
      profileName: '',
      profileCompanyName: '',
      profileLocation: ''
    };

    // Shared extraction routine that can run against either the top document or the iframe document
    const fillFromDocument = (doc) => {
      // Fill profile photo URL from this document if still missing
      if (!result.profilePhotoUrl) {
        const photoSrc = this.extractProfilePhotoUrl(doc);
        if (photoSrc) {
          result.profilePhotoUrl = photoSrc.trim();
        }
      }

      // Try to read profile name from common heading locations
      const nameElement = queryFirst(
        doc,
        '.pv-text-details__left-panel h1, h1.text-heading-xlarge, h1.inline.t-24, p._017211cd'
      );
      if (!result.profileName && nameElement?.textContent) {
        result.profileName = nameElement.textContent.trim();
      }

      // Prefer the explicit "company" button/label when available
      const companyButton = queryFirst(doc, companyButtonSelectors.join(', '));
      const parseCompanyFromLabel = (label = '') => {
        const match = label.match(/(?:Current\s+company|Company):\s*([^.,]+)/i);
        return match ? match[1].trim() : '';
      };

      if (companyButton && !result.profileCompanyName) {
        const labelNode =
          companyButton.querySelector('.inline-show-more-text') ||
          companyButton.querySelector('.hoverable-link-text') ||
          companyButton.querySelector('span') ||
          companyButton.querySelector('div');

        let company =
          labelNode?.textContent?.trim() ||
          companyButton.textContent?.trim() ||
          '';

        if (!company) {
          const ariaLabel = companyButton.getAttribute('aria-label') || '';
          company = parseCompanyFromLabel(ariaLabel);
        }

        if (company) {
          result.profileCompanyName = company;
        }
      }

      // Use contact info section to infer location when possible
      const contactInfoLink = queryFirst(doc, '#top-card-text-details-contact-info');
      if (contactInfoLink && !result.profileLocation) {
        let sibling = contactInfoLink.closest('span')?.previousElementSibling;
        while (sibling && sibling.nodeType !== Node.ELEMENT_NODE) {
          sibling = sibling.previousSibling;
        }

        const siblingText = sibling?.textContent?.trim();
        if (siblingText && !/followers|connections/i.test(siblingText)) {
          result.profileLocation = siblingText
            .replace(/\s*·.*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }

      // Additional selectors for legacy or alternative location placements
      const locationSelectors = [
        'div.mt2 span.text-body-small',
        'span.text-body-small.t-black--light',
        'span.text-body-small.inline.t-black--light.break-words',
        'span.inline.t-black--light.break-words',
        'li span.text-body-small.inline.t-black--light.break-words'
      ];

      // Try each location selector until we find a plausible non-follower/non-connections string
      if (!result.profileLocation) {
        for (const selector of locationSelectors) {
          const candidate = queryFirst(doc, selector);
          const text = candidate?.textContent?.trim();
          if (text && !/followers|connections/i.test(text)) {
            result.profileLocation = text
              .replace(/\s*·.*$/, '')
              .replace(/\s+/g, ' ')
              .trim();
            break;
          }
        }
      }

    };

    // Track which document contexts we've already processed (top doc, iframe, etc.)
    const needsMoreData = () =>
      !result.profilePhotoUrl ||
      !result.profileName ||
      !result.profileCompanyName ||
      !result.profileLocation;

    try {
      fillFromDocument(docContext);
      if (needsMoreData()) {
        const alternateDoc = docContext === document ? this.getLinkedInIframeDocument?.() : document;
        if (alternateDoc) {
          fillFromDocument(alternateDoc);
        }
      }
    } catch (error) {
      console.warn('LinkedInExtractor: extraction failed for document:', error);
    }

    // Fallback to extension icon if we still have no usable profile photo URL
    if (!result.profilePhotoUrl && chrome?.runtime?.getURL) {
      result.profilePhotoUrl = chrome.runtime.getURL('icons/icon48.png');
    }

    console.log('🔍 [Profile Display] Extraction complete:', {
      hasPhoto: !!result.profilePhotoUrl,
      hasName: !!result.profileName,
      hasCompany: !!result.profileCompanyName,
      hasLocation: !!result.profileLocation,
      name: result.profileName || 'NOT FOUND',
      company: result.profileCompanyName || 'NOT FOUND',
      location: result.profileLocation || 'NOT FOUND'
    });

    return result;
  }

  // search/collections
  static async extractLegacyJobInfo(url) {
    let jobTitleElement, companyElement, companyLogoElement, jobLocationElement;
    const jobId = this.getJobIdFromUrl(url);
    const topCardSelector = '.job-details-jobs-unified-top-card__container--two-pane';
    let topCardContainer = null;
    try {
      topCardContainer = await this.waitForElement(topCardSelector, 2000);
    } catch (error) {
      console.warn('top card container element timeout (legacy flow):', error.message);
      topCardContainer = document.querySelector(topCardSelector);
    }

    const jobTitleSelector = `${topCardSelector} h1`;
    const companySelector = `${topCardSelector} .job-details-jobs-unified-top-card__company-name a`;
    const logoSelector = `${topCardSelector} a[aria-label$="logo"] img, ${topCardSelector} .ivm-view-attr__img-wrapper img`;
    const locationSelector = '.job-details-jobs-unified-top-card__tertiary-description-container .tvm__text, .t-black--light .tvm__text';

    const waitConfigs = [
      {
        key: 'jobTitleElement',
        selector: jobTitleSelector,
        fallback: () => topCardContainer?.querySelector('h1') || document.querySelector(jobTitleSelector)
      },
      {
        key: 'companyElement',
        selector: companySelector,
        fallback: () => document.querySelector(companySelector)
      },
      {
        key: 'companyLogoElement',
        selector: logoSelector,
        fallback: () => document.querySelector(logoSelector) || document.querySelector('.display-flex.align-items-center.flex-1 a[aria-label$="logo"] img')
      },
      {
        key: 'jobLocationElement',
        selector: locationSelector,
        fallback: () => document.querySelector(locationSelector)
      }
    ];

    const settled = await Promise.allSettled(
      waitConfigs.map(({ selector}) => this.waitForElement(selector, 5000))
    );
    console.log('settled', settled[1]?.value?.outerHTML);

    const getElementFromResult = (index) => {
      const result = settled[index];
      const fallback = waitConfigs[index].fallback;
      if (result?.status === 'fulfilled') {
        return result.value;
      }
      return fallback ? fallback() : null;
    };

    jobTitleElement = getElementFromResult(0);
    companyElement = getElementFromResult(1);
    companyLogoElement = getElementFromResult(2);
    jobLocationElement = getElementFromResult(3);

    return {
      jobTitle: jobTitleElement ? jobTitleElement.innerText.trim() : '',
      companyName: companyElement ? companyElement.innerText.trim() : '',
      companyLogoUrl: companyLogoElement ? companyLogoElement.src : chrome.runtime.getURL('icons/icon48.png'),
      jobLocation: jobLocationElement ? jobLocationElement.innerText.trim() : '',
      jobId
    };
  }

  static async extractNewTabJobInfo(url) {
    const jobId = this.getJobIdFromUrl(url);

    console.log('[LinkedIn Debug] Waiting for new-tab job detail container...');
    await this.waitForElement(
      '[data-view-name="job-detail-page"], .job-view-layout.jobs-details, script[type="application/ld+json"]',
      8000
    ).catch((error) => {
      console.warn('[LinkedIn Debug] job-detail-page timeout (new-tab):', error.message);
    });

    const info = {
      jobTitle: '',
      companyName: '',
      companyLogoUrl: '',
      jobLocation: '',
      jobId
    };

    const structured = this.extractStructuredJobData();
    console.log('=== extractStructuredJobData', structured);
    if (structured.jobTitle) info.jobTitle = structured.jobTitle;
    if (structured.companyName) info.companyName = structured.companyName;
    if (structured.companyLogoUrl) info.companyLogoUrl = structured.companyLogoUrl;
    if (structured.jobLocation) info.jobLocation = structured.jobLocation;

    const newLayoutRoot = document.querySelector('[data-view-name="job-detail-page"]');
    if (newLayoutRoot) {
      const companyLink = newLayoutRoot.querySelector('a[href*="linkedin.com/company"], a[href*="linkedin.com/showcase"], a[href*="linkedin.com/school"]');
      if (companyLink && !info.companyName) {
        info.companyName = companyLink.textContent?.trim() || info.companyName;
      }

      if (!info.companyLogoUrl || info.companyLogoUrl === chrome.runtime.getURL('icons/icon48.png')) {
        const logoImg = (companyLink && companyLink.querySelector('img')) || newLayoutRoot.querySelector('figure img');
        const logoSrc = logoImg?.getAttribute('src') || logoImg?.getAttribute('data-delayed-url');
        if (logoSrc) {
          info.companyLogoUrl = logoSrc;
        }
      }

      if (!info.jobTitle) {
        const title = this.extractTitleFromNewLayout(newLayoutRoot);
        if (title) info.jobTitle = title;
      }

      if (!info.jobLocation) {
        const location = this.extractLocationFromNewLayout(newLayoutRoot);
        if (location) info.jobLocation = location;
      }
    }

    // Special layout handling (new jobs layout seen in linkedin_new_tab_special.html)
    const specialLayoutRoot = document.querySelector('.job-view-layout.jobs-details');
    if (specialLayoutRoot) {
      if (!info.companyName) {
        const companyLink = specialLayoutRoot.querySelector('.job-details-jobs-unified-top-card__company-name a');
        if (companyLink?.textContent?.trim()) {
          info.companyName = companyLink.textContent.trim();
        }
      }

      if (!info.companyName) {
        const headerLine = specialLayoutRoot.querySelector('.ml2.t-14.truncate > div[dir="ltr"]');
        const headerCompany = headerLine?.textContent?.split('·')[0]?.trim();
        if (headerCompany) {
          info.companyName = headerCompany;
        }
      }

      if (!info.companyLogoUrl || info.companyLogoUrl === chrome.runtime.getURL('icons/icon48.png')) {
        const logoImg =
          specialLayoutRoot.querySelector('a[aria-label$="logo"] img') ||
          specialLayoutRoot.querySelector('figure img, .ivm-view-attr__img-wrapper img') ||
          specialLayoutRoot.querySelector('[data-view-name="job-details-about-company-logo-link"] img');
        const logoSrc = logoImg?.getAttribute('src') || logoImg?.getAttribute('data-delayed-url');
        if (logoSrc) {
          info.companyLogoUrl = logoSrc;
        }
      }

      if (!info.jobTitle) {
        const titleElement = specialLayoutRoot.querySelector(
          '.job-details-jobs-unified-top-card__job-title h1, h1.t-24'
        );
        const titleText = titleElement?.textContent?.trim();
        if (titleText) {
          info.jobTitle = titleText.replace(/\s*Verified job$/i, '').trim();
        }
      }

      if (!info.jobLocation) {
        const locationElement = specialLayoutRoot.querySelector(
          '.job-details-jobs-unified-top-card__tertiary-description-container .tvm__text'
        );
        const locationText = locationElement?.textContent?.trim();
        if (locationText) {
          info.jobLocation = locationText;
        }
      }

    }

    if (info.jobLocation) {
      info.jobLocation = info.jobLocation.replace(/\s+·.*$/, '').trim();
    }

    if (info.jobTitle) {
      info.jobTitle = info.jobTitle.trim();
    }

    if (info.companyName) {
      info.companyName = info.companyName.trim();
    }

    if (!info.jobTitle) info.jobTitle = '';
    if (!info.companyLogoUrl) info.companyLogoUrl = chrome.runtime.getURL('icons/icon48.png');

    return info;
  }

  static extractStructuredJobData() {
    const result = {
      jobTitle: '',
      companyName: '',
      companyLogoUrl: '',
      jobLocation: ''
    };

    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const json = JSON.parse(script.textContent || '{}');
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          if (!item) continue;
          const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
          if (!types || !types.includes('JobPosting')) continue;

          if (item.title && !result.jobTitle) {
            result.jobTitle = item.title.trim().replace(/\s*Verified job$/i, '').trim();
          }

          const hiringOrg = item.hiringOrganization || {};
          if (hiringOrg.name && !result.companyName) {
            result.companyName = hiringOrg.name.trim();
          }

          if (!result.companyLogoUrl) {
            const rawLogo = hiringOrg.logo || item.logo;
            if (typeof rawLogo === 'string' && rawLogo.trim()) {
              result.companyLogoUrl = rawLogo.trim();
            } else if (rawLogo && typeof rawLogo === 'object' && rawLogo.url) {
              result.companyLogoUrl = String(rawLogo.url).trim();
            }
          }

          if (!result.jobLocation) {
            const locations = Array.isArray(item.jobLocation) ? item.jobLocation : [item.jobLocation];
            for (const loc of locations) {
              const address = loc?.address;
              if (!address) continue;
              const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
                .filter((part) => typeof part === 'string' && part.trim().length > 0)
                .map((part) => part.trim());
              if (parts.length) {
                result.jobLocation = parts.join(', ');
                break;
              }
            }
          }
        }
      } catch (_error) {
        // Ignore malformed JSON blocks and continue searching
      }

      if (result.jobTitle && result.companyName && result.jobLocation && result.companyLogoUrl) {
        break;
      }
    }

    return result;
  }

  static extractTitleFromNewLayout(root) {
    const paragraphs = Array.from(root.querySelectorAll('p'));

    for (let i = 0; i < paragraphs.length; i += 1) {
      const currentText = paragraphs[i].textContent?.trim();
      if (!currentText) continue;

      if (currentText.length > 200) continue;
      if (/use ai|try premium|set alert|more jobs|benefits/i.test(currentText)) continue;
      if (currentText.includes('·')) continue;

      const nextText = paragraphs[i + 1]?.textContent?.trim() || '';
      if (!nextText) continue;
      if (!(/·/.test(nextText) || /remote|hybrid|on[- ]site|,/.test(nextText.toLowerCase()))) {
        continue;
      }

      return currentText.replace(/\s*Verified job$/i, '').trim();
    }

    return '';
  }

  static extractLocationFromNewLayout(root) {
    const paragraphs = Array.from(root.querySelectorAll('p'));
    for (const paragraph of paragraphs) {
      const text = paragraph.textContent?.trim();
      if (!text) continue;
      if (/remote|hybrid|on[- ]site|,/i.test(text) || text.includes('·')) {
        const cleaned = text.split('·')[0].trim();
        if (/promoted by/i.test(cleaned)) continue;
        if (cleaned) {
          return cleaned;
        }
      }
    }
    return '';
  }

  static waitForJobDetails(callback) {
    const extractDescription = () => {
      const legacy = document.querySelector('article.jobs-description__container') || document.querySelector('.job-details-about-the-job-module__description');
      if (legacy && legacy.innerText.trim().length > 0) {
        return legacy.innerText.trim();
      }

      const newLayoutRoot = document.querySelector('[data-view-name="job-detail-page"]');
      if (newLayoutRoot) {
        const heading = Array.from(newLayoutRoot.querySelectorAll('h2, h3'))
          .find((el) => el.textContent?.trim().toLowerCase() === 'about the job');
        const findExpandable = (node) => node?.querySelector?.('[data-testid="expandable-text-box"]');
        let textBox = null;
        if (heading) {
          textBox = findExpandable(heading.parentElement) ||
            findExpandable(heading.parentElement?.nextElementSibling) ||
            findExpandable(heading.closest('div')?.nextElementSibling);
        }

        if (!textBox) {
          textBox = findExpandable(newLayoutRoot);
        }

        const description = textBox?.textContent?.trim();
        if (description) {
          return description;
        }
      }

      return null;
    };

    const tryEmit = () => {
      const description = extractDescription();
      if (description) {
        callback(description);
        return true;
      }
      return false;
    };

    if (tryEmit()) return;

    const observer = new MutationObserver(() => {
      if (tryEmit()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    let attempts = 0;
    const maxAttempts = 7;
    const timeout = setInterval(() => {
      attempts += 1;
      if (tryEmit() || attempts >= maxAttempts) {
        clearInterval(timeout);
        observer.disconnect();
      }
    }, 2000);
  }

  // TODO: Use mutation observer
  static async waitForElement(selector, timeout = 5000, rootDoc = document) {
    if (!rootDoc) {
      console.warn(`Document context missing for selector: ${selector}`);
      return null;
    }

    return new Promise((resolve) => {
      const interval = 100;
      let elapsed = 0;

      const check = () => {
        const element = rootDoc?.querySelector?.(selector);
        if (element) return resolve(element);

        elapsed += interval;
        if (elapsed >= timeout) {
          console.warn(`Timeout: ${selector} not found`);
          return resolve(null);
        }

        setTimeout(check, interval);
      };

      check();
    });
  }
}

export class IndeedExtractor {
  static getJobIdFromUrl(url = window.location.href) {
    try {
      const urlObj = new URL(url);
      const { searchParams, pathname: _pathname } = urlObj;

      return (
        searchParams.get('vjk') ||
        searchParams.get('jk') ||
        "unknown"
      );
    } catch (error) {
      console.warn('⚠️ Invalid URL encountered while extracting Indeed job ID:', url, error);
      return null;
    }
  }

  static async extractJobInfo() {
    // Wait for elements to load
    await this.waitForElement('[data-testid="jobsearch-JobInfoHeader-title"]', 5000);
    
    const jobTitleElement = document.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]');
    const companyElement = document.querySelector('[data-testid="inlineHeader-companyName"] a');
    const jobLocationElement = document.querySelector('[data-testid="inlineHeader-companyLocation"] div');
    const companyLogoElement = document.querySelector('img[data-testid="jobsearch-JobInfoHeader-logo-overlay-lower"]');

    const jobTitle = jobTitleElement ? jobTitleElement.innerText.trim() : "";
    const companyName = companyElement ? companyElement.innerText.trim() : "";
    const jobLocation = jobLocationElement ? jobLocationElement.innerText.trim() : "";
    const companyLogoUrl = companyLogoElement ? companyLogoElement.src : chrome.runtime.getURL("icons/icon48.png");

    const jobId = this.getJobIdFromUrl(window.location.href);

    return {
      jobTitle,
      companyName,
      companyLogoUrl,
      jobLocation,
      jobId
    };
  }

  static getJobDescription() {
    const jobElement = document.querySelector('#jobDescriptionText');
    return jobElement ? jobElement.innerText : "Try again";
  }

  static async waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const interval = 100;
      let elapsedTime = 0;

      const checkElement = setInterval(() => {
        let element = document.querySelector(selector);
        if (element) {
          clearInterval(checkElement);
          resolve(element);
        }
        elapsedTime += interval;
        if (elapsedTime >= timeout) {
          clearInterval(checkElement);
          reject(new Error(`Timeout: ${selector} not found`));
        }
      }, interval);
    });
  }
}

export class SeekExtractor {
  static async extractJobInfo() {
    // Function to wait for an element to appear - exactly like original
    async function waitForElement(selector, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const intervalTime = 100; // Check every 100ms
        let elapsedTime = 0;

        const interval = setInterval(() => {
          let element = document.querySelector(selector);
          if (element) {
            clearInterval(interval);
            console.log(`✅ Found element: ${selector}`);
            resolve(element);
          }

          elapsedTime += intervalTime;
          if (elapsedTime >= timeout) {
            clearInterval(interval);
            console.error(`⏳ Timeout: Element '${selector}' not found`);
            reject(new Error(`Timeout: Element '${selector}' not found`));
          }
        }, intervalTime);
      });
    }

    // Main function to extract job details - exactly like displayJobInfoSeek
    async function extractJobDetails() {
      try {
        console.log("🔎 Waiting for job details to load...");

        // Wait for and assign global variables - exactly like original
        const jobTitleElement = await waitForElement('h1[data-automation="job-detail-title"]', 5000);

        // Extract text or image URL
        const jobTitle = jobTitleElement ? jobTitleElement.innerText.trim() : "";

        console.log("📌 Job Title:", jobTitle);
        
        return jobTitle;
      } catch (error) {
        // This is expected on listing pages or when elements aren't loaded yet
        console.log("⚠️ Job title element not found (might be on listing page):", error.message);
        return "";
      }
    }

    // Execute the function - exactly like displayJobInfoSeek
    const jobTitle = await extractJobDetails();

    // Extract all other elements - handle both recommendation and search result containers
    let companyElement = document.querySelector('span[data-automation="advertiser-name"]'); // Recommendation container
    if (!companyElement) {
      companyElement = document.querySelector('span[data-automation="jobCompany"]'); // Search result container  
    }
    if (!companyElement) {
      // Alternative selector for company name in job cards
      companyElement = document.querySelector('a[data-automation="jobCompany"]');
    }
    
    const jobLocationElement = document.querySelector('span[data-automation="job-detail-location"]');
    const companyLogoElement = document.querySelector('div[data-testid="bx-logo-image"] img');
    const michael_logo = document.getElementsByClassName('lkc6bp0');
    
    const companyName = companyElement ? companyElement.innerText.trim() : "";
    const jobLocation = jobLocationElement ? jobLocationElement.innerText.trim() : "";
    const companyLogoUrl = companyLogoElement?.src || michael_logo[0]?.src || chrome.runtime.getURL("icons/empty.png");

    console.log("🏢 Company Name:", companyName);
    console.log("📍 Job Location:", jobLocation);
    console.log("🖼️ Company Logo URL:", companyLogoUrl);

    return {
      jobTitle,
      companyName,
      companyLogoUrl,
      jobLocation
    };
  }

  static async getJobDescription() {
    // Try different selectors for job descriptions based on page type
    let jobText = "";
    
    // 1. Full job description page (job detail view)
    const jobDescriptionElement = document.querySelector('div[data-automation="jobAdDetails"]');
    if (jobDescriptionElement) {
      jobText = jobDescriptionElement.innerText.trim();
      console.log("📄 Found full job description from jobAdDetails");
      return jobText;
    }
    
    // 2. Fallback to legacy selector
    const legacyElement = document.querySelector('#jobDescriptionText');
    if (legacyElement) {
      jobText = legacyElement.innerText.trim();
      console.log("📄 Found job description from legacy selector");
      return jobText;
    }
    
    // 3. Job card short description (when on listing pages)
    const shortDescElement = document.querySelector('span[data-automation="jobShortDescription"]');
    if (shortDescElement) {
      jobText = shortDescElement.innerText.trim();
      console.log("📄 Found short job description from job card");
      return jobText;
    }
    
    // 4. Alternative job card description
    const jobTeaserElement = document.querySelector('span[data-testid="job-card-teaser"]');
    if (jobTeaserElement) {
      jobText = jobTeaserElement.innerText.trim();
      console.log("📄 Found job teaser description");
      return jobText;
    }
    
    console.log("⚠️ No job description found");
    return "Job description not available";
  }

  // Extract job ID from DOM - prioritize selected/active job card
  static extractJobIdFromDom() {
    console.log("🔍 Searching for job ID from currently selected job card...");
    
    // Priority 0: If we're on a job detail page, extract from multiple sources
    const jobTitleElement = document.querySelector('h1[data-automation="job-detail-title"]');
    if (jobTitleElement) {
      console.log("🔍 On job detail page, extracting job ID...");
      
      // Method 1: Get from current page URL
      const urlMatch = window.location.href.match(/\/job\/(\d+)/);
      if (urlMatch) {
        console.log("🆔 Found job ID from current URL:", urlMatch[1]);
        return urlMatch[1];
      }
      
      // Method 2: Get from job title link href
      const titleLink = jobTitleElement.querySelector('a[href*="/job/"]');
      if (titleLink) {
        const titleMatch = titleLink.href.match(/\/job\/(\d+)/);
        if (titleMatch) {
          console.log("🆔 Found job ID from job title link:", titleMatch[1]);
          return titleMatch[1];
        }
      }
      
      // Method 3: Get from apply button link
      const applyButton = document.querySelector('a[data-automation="job-detail-apply"]');
      if (applyButton && applyButton.href) {
        const applyMatch = applyButton.href.match(/\/job\/(\d+)/);
        if (applyMatch) {
          console.log("🆔 Found job ID from apply button link:", applyMatch[1]);
          return applyMatch[1];
        }
      }
      
      // Method 4: Look for any job links in the same container
      const jobContainer = jobTitleElement.closest('div');
      if (jobContainer) {
        const containerLinks = jobContainer.querySelectorAll('a[href*="/job/"]');
        for (const link of containerLinks) {
          const containerMatch = link.href.match(/\/job\/(\d+)/);
          if (containerMatch) {
            console.log("🆔 Found job ID from container link:", containerMatch[1]);
            return containerMatch[1];
          }
        }
      }
    }
    
    // Priority 1: Look for job IDs in data-automation attributes (like recommendedJobLink_87237977)
    console.log("🎯 Looking for job IDs in data-automation attributes...");
    const automationElements = document.querySelectorAll('[data-automation*="JobLink"], [data-automation*="recommendedJobLink"]');
    for (const element of automationElements) {
      const automation = element.getAttribute('data-automation');
      if (automation) {
        const idMatch = automation.match(/(\d+)$/);
        if (idMatch) {
          console.log("🆔 Found job ID from data-automation:", idMatch[1], "from", automation);
          return idMatch[1];
        }
      }
    }
    
    // Priority 2: Look for job IDs in button IDs (like recs-homepage-save-job-87237977)
    console.log("🔍 Looking for job IDs in save/hide button IDs...");
    const actionButtons = document.querySelectorAll('button[id*="job-"], button[id*="save-job-"], button[id*="hide-job-"]');
    for (const button of actionButtons) {
      const idMatch = button.id.match(/(\d+)$/);
      if (idMatch) {
        console.log("🆔 Found job ID from button ID:", idMatch[1], "from button:", button.id);
        return idMatch[1];
      }
    }
    
    // Priority 3: Look for selected/active job card
    console.log("🎯 Looking for selected job card (aria-selected='true')...");
    const selectedJobCard = document.querySelector('article[aria-selected="true"][data-job-id]');
    if (selectedJobCard && selectedJobCard.dataset.jobId) {
      console.log("🆔 Found job ID from selected job card:", selectedJobCard.dataset.jobId);
      return selectedJobCard.dataset.jobId;
    }
    
    // Priority 4: Look for job links within the selected job card
    const selectedCard = document.querySelector('article[aria-selected="true"]');
    if (selectedCard) {
      console.log("🎯 Found selected job card, searching for job links within it...");
      
      const jobLinkSelectors = [
        'a[href*="/job/"]', // Any job link
        'a[data-automation="jobTitle"]', // Job title link
        'a[id^="job-title-"]', // job-title-87158073
        'a[data-testid="job-card-title"]', // Alternative job card title
        'a[data-automation="job-list-item-link-overlay"]',
        'a[data-testid="job-list-item-link-overlay"]'
      ];
      
      for (const selector of jobLinkSelectors) {
        const jobLink = selectedCard.querySelector(selector);
        if (jobLink && jobLink.href) {
          const match = jobLink.href.match(/\/job\/(\d+)/);
          if (match) {
            console.log("🆔 Found job ID from selected card link:", match[1], "via selector:", selector);
            return match[1];
          }
        }
      }
    }
    
    // Priority 5: Look for any recommendation job links
    console.log("🔍 Looking for any recommendation job links...");
    const recJobLinks = document.querySelectorAll('a[data-automation*="recommendedJobLink"], a[href*="/job/"]');
    for (const link of recJobLinks) {
      const match = link.href.match(/\/job\/(\d+)/);
      if (match) {
        console.log("🆔 Found job ID from job link:", match[1]);
        return match[1];
      }
    }
    
    // Fallback: First job card with data-job-id (old behavior)
    console.log("🔍 Fallback: Looking for any job card with data-job-id...");
    const jobArticle = document.querySelector('article[data-job-id]');
    if (jobArticle && jobArticle.dataset.jobId) {
      console.log("🆔 Found job ID from first job card (fallback):", jobArticle.dataset.jobId);
      return jobArticle.dataset.jobId;
    }
    
    console.log("⚠️ No job ID found in DOM");
    return null;
  }

  // Check if we're on a Seek job page (DOM-based only)
  static isJobPage() {
    return document.querySelector('a[href*="/job/"]') !== null;
  }

  // Get current job identifier - DOM only
  static getCurrentJobIdentifier() {
    const domJobId = this.extractJobIdFromDom();
    return domJobId || null; // Return null if no job ID found in DOM
  }

  // Store current job info in Chrome local storage
  static async storeJobInfo(jobInfo) {
    const jobId = this.getCurrentJobIdentifier();
    const jobData = {
      description: jobInfo.description || "We are hiring...", // Default if no description
      company: jobInfo.companyName || "",
      job_title: jobInfo.jobTitle || "",
      job_location: jobInfo.jobLocation || "",
      company_logo: jobInfo.companyLogoUrl || chrome.runtime.getURL("icons/empty.png"),
      job_url_id: jobId || "",
      job_portal: "SEEK",
      timestamp: Date.now(),
      url: window.location.href
    };

    return new Promise((resolve) => {
      if (chrome && chrome.storage && chrome.storage.local) {
        if (!jobId) {
          console.log("⚠️ No job ID found, cannot store job info");
          resolve(null);
          return;
        }
        
        // Store ONLY with job ID as key (no more current_seek_job dependency)
        const storageKey = `seek_job_${jobId}`;
        
        chrome.storage.local.set({
          [storageKey]: jobData
        }, () => {
          console.log(`💾 Stored job info for job ${jobId}:`, jobData);
          console.log(`💾 Storage key: ${storageKey}`);
          resolve(jobData);
        });
      } else {
        console.log("⚠️ Chrome storage not available");
        resolve(null);
      }
    });
  }

  // Get stored job info from Chrome local storage (current job only)
  static async getStoredJobInfo() {
    return new Promise((resolve) => {
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['current_seek_job'], (result) => {
          resolve(result.current_seek_job || null);
        });
      } else {
        resolve(null);
      }
    });
  }

  static async waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const intervalTime = 100; // Check every 100ms
      let elapsedTime = 0;

      const interval = setInterval(() => {
        let element = document.querySelector(selector);
        if (element) {
          clearInterval(interval);
          // console.log(`✅ Found element: ${selector}`);
          resolve(element);
        }

        elapsedTime += intervalTime;
        if (elapsedTime >= timeout) {
          clearInterval(interval);
          // console.error(`⏳ Timeout: Element '${selector}' not found`);
          reject(new Error(`Timeout: Element '${selector}' not found`));
        }
      }, intervalTime);
    });
  }
}
