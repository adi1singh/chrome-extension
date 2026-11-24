import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { subscribeActionButtonState, getActionButtonState } from "../utils/actionButtonsBridge.js";

/** ====== Platform-specific constants ====== **/
const PLATFORM_PRESETS = Object.freeze({
  linkedin: {
    segmentRadius: 20,  // px - radius used by both white and blue segments
    mainHeight: 40,      // px - height of the white brand pill (kept equal to container height)
    mainWidth: 160,      // px - minimum width for the white brand pill
  },
  linkedinJobViewPage: {
    segmentRadius: 20,
    mainHeight: 32,
    mainWidth: 146,
  },
  indeed: {
    segmentRadius: 10,
    mainHeight: 44,    
    mainWidth: 165,   
  },
  seek: {
    segmentRadius: 10,
    mainHeight: 40,
    mainWidth: 180,  // Increased to fit "Applying..." text
  },
});

const DEFAULT_PLATFORM_KEY = 'linkedin';
const DEFAULT_PLATFORM_PRESET = PLATFORM_PRESETS[DEFAULT_PLATFORM_KEY];

/** ====== Pre-set Constants DO NOT CHANGE ====== **/
const LOGO_RADIUS         = 6;   // px - radius of the logo badge (kept proportional to IconButton)
const LOGO_BADGE_SIZE     = 28;  // px - baseline diameter of the square badge (scales with platform height)
const LABEL_FONT_SIZE   = 15;   // px - font size for JOBGEN label text
const APPLY_SEGMENT_WIDTH = 60;  // px - visible width of the blue apply segment (default)
const APPLY_SEGMENT_WIDTH_SEEK = 75;  // px - wider for Seek to fit "Applying..." text
const OVERLAP             = 18;  // px - how far blue extends under white (fixed px)
const CARET_WIDTH             = 16; // px - fixed caret width

const WHITE_EDGE_TO_LOGO      = 9; // px - white left edge → logo
const LOGO_TO_LABEL           = 6;  // px - logo → JOBGEN.AI text
const LABEL_TO_CARET          = 5;  // px - JOBGEN.AI text → caret
const CARET_TO_WHITE_EDGE     = 5; // px - caret → white segment right edge

const WHITE_EDGE_TO_APPLY_TXT = 6; // px - white right edge → "Apply" text (blue side)
const APPLY_TXT_TO_EDGE       = 6; // px - "Apply" text → blue segment right edge
const MENU_FONT_SIZE          = 14; // px - dropdown option label size
const MENU_PADDING            = 10; // px - dropdown container padding (all sides)
const MENU_ITEM_PADDING_X     = 12; // px - dropdown option horizontal padding
const MENU_ITEM_PADDING_Y     = 10; // px - dropdown option vertical padding
const MENU_ITEM_GAP           = 4;  // px - vertical gap between dropdown options
const MENU_ITEM_CONTENT_GAP   = 10; // px - spacing between option icon and label

// Baseline dimensions used to derive proportional spacing. Update only if you re-tune the px constants above.
const BASELINE_DIMENSIONS = Object.freeze({
  mainHeight: DEFAULT_PLATFORM_PRESET.mainHeight,
  mainWidth: DEFAULT_PLATFORM_PRESET.mainWidth,
  labelFontSize: LABEL_FONT_SIZE,
});

const PRESET_RELATIONS = Object.freeze({
  applySegmentWidth: APPLY_SEGMENT_WIDTH / BASELINE_DIMENSIONS.mainWidth,
  overlap: OVERLAP / BASELINE_DIMENSIONS.mainWidth,
  whiteEdgeToLogo: WHITE_EDGE_TO_LOGO / BASELINE_DIMENSIONS.mainHeight,
  logoBadgeSize: LOGO_BADGE_SIZE / BASELINE_DIMENSIONS.mainHeight,
  logoToLabel: LOGO_TO_LABEL / BASELINE_DIMENSIONS.mainHeight,
  labelToCaret: LABEL_TO_CARET / BASELINE_DIMENSIONS.mainHeight,
  caretToWhiteEdge: CARET_TO_WHITE_EDGE / BASELINE_DIMENSIONS.mainHeight,
  whiteEdgeToApplyText: WHITE_EDGE_TO_APPLY_TXT / BASELINE_DIMENSIONS.mainWidth,
  applyTextToEdge: APPLY_TXT_TO_EDGE / BASELINE_DIMENSIONS.mainWidth,
  menuPadding: MENU_PADDING / BASELINE_DIMENSIONS.mainHeight,
  menuItemPaddingX: MENU_ITEM_PADDING_X / BASELINE_DIMENSIONS.mainWidth,
  menuItemPaddingY: MENU_ITEM_PADDING_Y / BASELINE_DIMENSIONS.mainHeight,
  menuItemGap: MENU_ITEM_GAP / BASELINE_DIMENSIONS.mainHeight,
  menuItemContentGap: MENU_ITEM_CONTENT_GAP / BASELINE_DIMENSIONS.mainHeight,
  caretWidth: CARET_WIDTH / BASELINE_DIMENSIONS.mainHeight,
  menuFontSize: MENU_FONT_SIZE / BASELINE_DIMENSIONS.labelFontSize,
});

const roundPx = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

function computePresetSpacing({
  mainHeight = DEFAULT_PLATFORM_PRESET.mainHeight,
  mainWidth = DEFAULT_PLATFORM_PRESET.mainWidth,
  labelFontSize = LABEL_FONT_SIZE,
  platformKey = DEFAULT_PLATFORM_KEY,
} = {}) {
  const scaleHeight = (ratio, fallback) => (Number.isFinite(ratio) ? roundPx(mainHeight * ratio) : fallback);
  const scaleWidth = (ratio, fallback) => (Number.isFinite(ratio) ? roundPx(mainWidth * ratio) : fallback);
  const scaleFont = (ratio, fallback) => (Number.isFinite(ratio) ? roundPx(labelFontSize * ratio) : fallback);

  const logoBadgeSize = scaleHeight(PRESET_RELATIONS.logoBadgeSize, LOGO_BADGE_SIZE);
  const logoToLabel = scaleHeight(PRESET_RELATIONS.logoToLabel, LOGO_TO_LABEL);
  const labelToCaret = scaleHeight(PRESET_RELATIONS.labelToCaret, LABEL_TO_CARET);

  // Use wider apply segment for Seek to fit "Applying..." text
  const applyWidth = (platformKey === 'seek') ? APPLY_SEGMENT_WIDTH_SEEK : APPLY_SEGMENT_WIDTH;
  
  return {
    logoRadius: LOGO_RADIUS,
    logoBadgeSize,
    applySegmentWidth: scaleWidth(PRESET_RELATIONS.applySegmentWidth, applyWidth),
    overlap: scaleWidth(PRESET_RELATIONS.overlap, OVERLAP),
    whiteEdgeToLogo: scaleHeight(PRESET_RELATIONS.whiteEdgeToLogo, WHITE_EDGE_TO_LOGO),
    logoToLabel,
    labelToCaret,
    labelToCaretAdjust: roundPx(Math.max(labelToCaret - logoToLabel, 0)),
    caretToWhiteEdge: scaleHeight(PRESET_RELATIONS.caretToWhiteEdge, CARET_TO_WHITE_EDGE),
    whiteEdgeToApplyText: scaleWidth(PRESET_RELATIONS.whiteEdgeToApplyText, WHITE_EDGE_TO_APPLY_TXT),
    applyTextToEdge: scaleWidth(PRESET_RELATIONS.applyTextToEdge, APPLY_TXT_TO_EDGE),
    menuPadding: scaleHeight(PRESET_RELATIONS.menuPadding, MENU_PADDING),
    menuItemPaddingX: scaleWidth(PRESET_RELATIONS.menuItemPaddingX, MENU_ITEM_PADDING_X),
    menuItemPaddingY: scaleHeight(PRESET_RELATIONS.menuItemPaddingY, MENU_ITEM_PADDING_Y),
    menuItemGap: scaleHeight(PRESET_RELATIONS.menuItemGap, MENU_ITEM_GAP),
    menuItemContentGap: scaleHeight(PRESET_RELATIONS.menuItemContentGap, MENU_ITEM_CONTENT_GAP),
    caretWidth: scaleHeight(PRESET_RELATIONS.caretWidth, CARET_WIDTH),
    menuFontSize: scaleFont(PRESET_RELATIONS.menuFontSize, MENU_FONT_SIZE),
  };
}

const STYLE_ID = "jobgen-action-buttons-style";
const BRAND_COLOR = "#2B6BF5";

const DEFAULT_ICON_PATH = "icons/icon48.png";

const defaultMenuItems = [
  { key: "save", label: "Save" },
  { key: "autofill", label: "Autofill" },
];

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
  /* Reset host page overrides on our interactive elements */
  .jg-actions .jg-container button,
  .jg-actions .jg-menu__item {
    appearance: none;
    background: none;
    border: none;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    line-height: normal;
    box-sizing: border-box;
  }
  :root { --jg-primary: ${BRAND_COLOR}; --jg-ink: #0f2f5c; }

  .jg-actions { position: relative; display: inline-block; font-family: Inter, Segoe UI, sans-serif; color: var(--jg-ink); overflow: visible; }

  /* Force our font on button text, defeating host button-descendant rules */
  .jg-actions .jg-container .jg-brand,
  .jg-actions .jg-container .jg-brand__label,
  .jg-actions .jg-container .jg-apply,
  .jg-actions .jg-container .jg-apply__label {
    font-family: Inter, Segoe UI, sans-serif !important;
  }

  /* Container that holds and stacks both buttons */
  .jg-actions .jg-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: var(--h);
    padding-right: var(--apply-w);
    overflow: visible; /* ensure apply button can extend */
  }

  /* Top layer - complete white pill (rounded both sides) */
  .jg-actions .jg-container .jg-brand {
    position: relative;
    z-index: 2;                            /* above the blue */
    display: inline-flex;
    align-items: center;
    gap: var(--logo-to-label-gap, ${LOGO_TO_LABEL}px);
    height: var(--h);
    padding: 0 var(--caret-to-white-edge, ${CARET_TO_WHITE_EDGE}px) 0 var(--white-edge-to-logo, ${WHITE_EDGE_TO_LOGO}px);
    background: #ffffff;
    color: var(--jg-ink);
    border: 2px solid rgba(43,107,245,0.9);
    border-radius: var(--radius, 999px);   /* rounded BOTH sides */
    transition: background 0.18s ease, border-color 0.18s ease;
    width: var(--brand-w);
    height: var(--brand-h);
  }

  /* Base layer - blue button that sneaks under the white by OVERLAP */
  .jg-actions .jg-container .jg-apply {
    position: absolute;
    top: 0; right: 0;
    z-index: 1;
    height: var(--h);
    min-width: calc(var(--apply-w) + var(--overlap)); /* minimum width */
    width: max-content; /* expand to fit content */
    max-width: none; /* no maximum - allow full text */
    padding: 0 16px 0 calc(var(--overlap) + 12px); /* more padding for text */
    display: inline-flex;
    align-items: center;
    justify-content: center; /* center the text */
    gap: 10px;
    white-space: nowrap; /* prevent text wrapping */
    overflow: visible; /* ensure text is not clipped */
    background: linear-gradient(135deg, #3f8cff, #1d63f1);
    color: #fff;
    border: none;
    /* blue sits below, only its right end is visible when slid out */
    border-radius: 0 var(--radius, 999px) var(--radius, 999px) 0;
    cursor: pointer;
    font-size: var(--label-font-size, ${LABEL_FONT_SIZE}px);
    font-weight: 700;
    letter-spacing: 0.01em;
    /* start hidden under the white mask by MASKED_PORTION */
    transform: translateX(calc(-1 * var(--overlap)));
    opacity: 0;
    transition:
      transform 240ms cubic-bezier(.2,.8,.2,1),
      opacity   160ms ease,
      background 0.18s ease;
  }

  /* Reveal blue when hovered, when menu is open, or during click on white */
  .jg-actions .jg-container:hover .jg-apply,
  .jg-actions .jg-container.jg-open .jg-apply,
  .jg-actions .jg-container .jg-brand:active + .jg-apply {
    transform: translateX(0);
    opacity: 1;
  }


  /* Logo badge — keep glyph inside the circle */
  .jg-actions .jg-container .jg-brand__badge {
    width: var(--logo-badge-size, ${LOGO_BADGE_SIZE}px);
    height: var(--logo-badge-size, ${LOGO_BADGE_SIZE}px);
    border-radius: var(--logo-radius, ${LOGO_RADIUS}px);
    overflow: hidden;                      /* ensures glyph stays inside */
    display: grid; place-items: center;
    background: var(--jg-primary);
    color: #fff;
    flex: 0 0 auto;
  }
  .jg-actions .jg-container .jg-brand__badge > img, .jg-actions .jg-container .jg-brand__badge > svg {
    width: 80%; height: 80%; display: block;
  }

  .jg-actions .jg-container .jg-brand__label { font-weight: 700; font-size: var(--label-font-size, ${LABEL_FONT_SIZE}px); letter-spacing: .01em; }
  .jg-actions .jg-container .jg-apply__label {
    font-weight: 600;
    font-size: var(--label-font-size, ${LABEL_FONT_SIZE}px);
    position: relative;
    top: -1px;
    white-space: nowrap;
    overflow: visible;
  }
  .jg-actions .jg-container .jg-icon { width: 18px; height: 18px; display: inline-block; }
  .jg-actions .jg-container .jg-icon--caret {
    width: var(--caret-width, ${CARET_WIDTH}px);
    min-width: var(--caret-width, ${CARET_WIDTH}px);
    margin-left: var(--label-to-caret-adjust, 0px);
  }

  /* Dropdown */
  .jg-actions .jg-menu {
    position: absolute;
    top: calc(100% + 10px);
    left: var(--menu-left, 18px);
    z-index: 3;
    width: var(--menu-width, 180px);
    min-width: var(--menu-width, 180px);
    height: var(--menu-height, calc(var(--brand-h) * 2));
    padding: var(--menu-pad, ${MENU_PADDING}px);
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid rgba(27, 91, 210, 0.18);
    border-radius: var(--menu-radius, 16px);
    backdrop-filter: blur(10px);
    animation: jg-menu-enter 120ms ease-out;
    display: flex;
    flex-direction: column;
    gap: var(--menu-item-gap, ${MENU_ITEM_GAP}px);
  }
  .jg-actions .jg-menu__item {
    display: flex;
    align-items: center;
    gap: var(--menu-item-content-gap, ${MENU_ITEM_CONTENT_GAP}px);
    width: 100%;
    min-height: var(--menu-item-height, auto);
    padding: var(--menu-item-pad-y, ${MENU_ITEM_PADDING_Y}px) var(--menu-item-pad-x, ${MENU_ITEM_PADDING_X}px);
    border-radius: var(--menu-item-radius, 10px);
    background: transparent;
    border: 0;
    cursor: pointer;
    color: var(--jg-ink);
    text-align: left;
    transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
    box-sizing: border-box;
  }
  .jg-actions .jg-menu__item-label {
    font-size: var(--menu-item-font-size, ${MENU_FONT_SIZE}px);
    font-weight: 600;
  }
  .jg-actions .jg-menu__item:hover {
    background: linear-gradient(135deg, rgba(76, 134, 255, 0.16), rgba(47, 96, 235, 0.22));
    color: #0d2d75;
    transform: translateX(2px);
    border-radius: var(--menu-item-radius, 10px);
  }
  .jg-actions .jg-menu__item[disabled] {
    opacity: 0.55;
    transform: none;
    pointer-events: none;
    background: transparent;
  }

  @keyframes jg-menu-enter {
    from { opacity: 0; transform: translateY(-6px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* Focus rings */
  .jg-actions .jg-container .jg-brand:focus-visible,
  .jg-actions .jg-container .jg-apply:focus-visible,
  .jg-actions .jg-menu__item:focus-visible {
    outline: 2px solid rgba(43,107,245,.35); outline-offset: 2px;
  }
  `;
  (document.head || document.documentElement).appendChild(style);
}

const Caret = () => (
  <svg className="jg-icon jg-icon--caret" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M4.5 7.5L10 12.5L15.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
// const Arrow = () => (
//   <svg className="jg-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
//     <path d="M5 12h14" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
//     <path d="M13 6l6 6-6 6" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
//   </svg>
// );
export default function ActionButtons({ menuItems, onAction, onApply, platformKey: propPlatformKey, customHeight, currentJobId: _currentJobId, jobStatus, hasActiveFlow }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const containerRef = useRef(null);
  const brandRef = useRef(null);
  
  const [menuMetrics, setMenuMetrics] = useState(() => ({
    left: 0,
    width: DEFAULT_PLATFORM_PRESET.mainWidth || 180,
    height: (customHeight || DEFAULT_PLATFORM_PRESET.mainHeight) * 2,
  }));
  const [bridgeState, setBridgeState] = useState(getActionButtonState());

  const shouldKeepMenuOpen = useMemo(() => {
    const flag = bridgeState?.keepMenuOpen;
    return flag === undefined ? true : Boolean(flag);
  }, [bridgeState?.keepMenuOpen]);

  const platformKey = useMemo(() => {
    const raw = bridgeState?.currentSite;
    const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : DEFAULT_PLATFORM_KEY;
    const baseKey = Object.prototype.hasOwnProperty.call(PLATFORM_PRESETS, normalized)
      ? normalized
      : DEFAULT_PLATFORM_KEY;
    
    // special case for linkedin view job page
    if (baseKey === 'linkedin') {
      const href = typeof window !== 'undefined' && window?.location ? window.location.href : '';
      if (typeof href === 'string' && href.toLowerCase().includes('jobs/view/')) {
        return Object.prototype.hasOwnProperty.call(PLATFORM_PRESETS, 'linkedinJobViewPage')
          ? 'linkedinJobViewPage'
          : baseKey;
      }
    }

    return baseKey;
  }, [bridgeState?.currentSite]);

  const determinedPlatformKey = propPlatformKey || platformKey;
  const platformPreset = PLATFORM_PRESETS[determinedPlatformKey] || DEFAULT_PLATFORM_PRESET;
  const {
    segmentRadius,
    mainHeight: presetMainHeight,
    mainWidth,
  } = platformPreset;
  
  // Use custom height if provided, otherwise use preset
  const mainHeight = customHeight || presetMainHeight;
  const labelFontSize = LABEL_FONT_SIZE;

  const logoUrl = useMemo(() => {
    if (typeof chrome !== "undefined" && chrome?.runtime?.getURL) {
      return chrome.runtime.getURL(DEFAULT_ICON_PATH);
    }
    return DEFAULT_ICON_PATH;
  }, []);

  const measureMenu = useCallback(() => {
    if (!containerRef.current || !brandRef.current) return;
    const wrapRect = containerRef.current.getBoundingClientRect();
    const brandRect = brandRef.current.getBoundingClientRect();
    const left = Math.max(0, brandRect.left - wrapRect.left);
    const width = brandRect.width;
    const height = brandRect.height * 2;
    setMenuMetrics({ left, width, height });
  }, []);

  useEffect(() => ensureStyles(), []);

  const spacing = useMemo(
    () => computePresetSpacing({ mainHeight, mainWidth, platformKey: determinedPlatformKey }),
    [mainHeight, mainWidth, determinedPlatformKey]
  );

  useLayoutEffect(() => {
    measureMenu();
  }, [measureMenu, mainHeight, mainWidth]);

  const items = useMemo(() => {
    const base = menuItems && menuItems.length ? menuItems : defaultMenuItems;
    return base.map((item) => {
      if (item.key === 'save') {
        // Use jobStatus prop if provided, otherwise use bridgeState
        // Only show "Saved" if status is EXACTLY "Applied" or "Saved" (strict comparison)
        const saveLabel = (jobStatus === 'Applied' || jobStatus === 'Saved') ? 'Saved' : (bridgeState.saveLabel || 'Save');
        const saveDisabled = (jobStatus === 'Applied' || jobStatus === 'Saved') || bridgeState.saveDisabled;
        
        console.log('🔍 [SAVE_LABEL] jobStatus:', jobStatus, 'label:', saveLabel, 'disabled:', saveDisabled);
        
        return {
          ...item,
          label: saveLabel,
          disabled: saveDisabled,
        };
      }
      if (item.key === 'autofill') {
        // Autofill button text based on status
        let autofillLabel = 'Autofill';
        let autofillDisabled = false;
        
        // Check onboarding completion first
        if (!bridgeState.onboardingComplete || bridgeState.hasRequiredFieldsMissing) {
          autofillDisabled = true;
        } else if (jobStatus === 'Applied' && !hasActiveFlow) {
          // Only show "Applied" if status is EXACTLY "Applied" AND no active flow
          autofillLabel = 'Applied';
          autofillDisabled = true;
        } else if (hasActiveFlow) {
          // Show "Autofilling..." ONLY if there's an active flow
          autofillLabel = 'Autofilling...';
          autofillDisabled = true;
        }
        // Otherwise default to "Autofill"
        
        console.log('🔍 [AUTOFILL_LABEL] jobStatus:', jobStatus, 'hasActiveFlow:', hasActiveFlow, 'onboardingComplete:', bridgeState.onboardingComplete, 'hasRequiredFieldsMissing:', bridgeState.hasRequiredFieldsMissing, 'label:', autofillLabel);
        
        return {
          ...item,
          label: autofillLabel,
          disabled: autofillDisabled,
        };
      }
      return item;
    });
  }, [menuItems, bridgeState, jobStatus, hasActiveFlow]);

  // Close menu on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!e.composedPath().includes(wrapRef.current)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    measureMenu();
    const handleResize = () => measureMenu();
    window.addEventListener("resize", handleResize);

    let ro;
    if (window.ResizeObserver && brandRef.current) {
      ro = new ResizeObserver(() => measureMenu());
      ro.observe(brandRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      ro?.disconnect();
    };
  }, [open, items, measureMenu]);

  useEffect(() => {
    const unsubscribe = subscribeActionButtonState((state) => {
      setBridgeState(state);
    });
    return unsubscribe;
  }, []);

  // Determine Apply button label based on status
  const applyButtonLabel = useMemo(() => {
    console.log('🔍 [APPLY_LABEL] jobStatus:', jobStatus, 'hasActiveFlow:', hasActiveFlow, 'onboardingComplete:', bridgeState.onboardingComplete, 'hasRequiredFieldsMissing:', bridgeState.hasRequiredFieldsMissing);
    
    // Only show "Applied" if status is EXACTLY the string "Applied" AND no active flow
    if (jobStatus === 'Applied' && !hasActiveFlow) {
      console.log('✅ [APPLY_LABEL] Showing "Applied"');
      return 'Applied';
    }
    // Only show "Applying..." if there's an active flow
    if (hasActiveFlow) {
      console.log('✅ [APPLY_LABEL] Showing "Applying..."');
      return 'Applying...';
    }
    // Default to "Apply" for all other cases (None, Saved, undefined, null, "", etc.)
    console.log('✅ [APPLY_LABEL] Showing "Apply" (default)');
    return 'Apply';
  }, [jobStatus, hasActiveFlow, bridgeState.onboardingComplete, bridgeState.hasRequiredFieldsMissing]);

  if (bridgeState?.isAuthenticated === false) {
    return null;
  }

  const computedMenuWidth = menuMetrics.width || mainWidth;
  const computedMenuHeight = menuMetrics.height || (mainHeight * 2);
  const menuItemCount = Math.max(items.length, 1);
  const totalMenuVerticalPadding = spacing.menuPadding * 2;
  const totalMenuItemGap = spacing.menuItemGap * (menuItemCount - 1);
  const availableMenuItemHeight = Math.max(
    computedMenuHeight - totalMenuVerticalPadding - totalMenuItemGap,
    0
  );
  const menuItemHeight = menuItemCount ? roundPx(availableMenuItemHeight / menuItemCount) : 0;

  // Inline CSS variables driven by your constants
  const styleVars = {
    "--h": `${mainHeight}px`,
    "--brand-h": `${mainHeight}px`,
    "--brand-w": `${mainWidth}px`,
    "--apply-w": `${spacing.applySegmentWidth}px`,
    "--overlap": `${spacing.overlap}px`,
    "--apply-pad-left": `${spacing.whiteEdgeToApplyText}px`,
    "--apply-pad-right": `${spacing.applyTextToEdge}px`,
    "--radius": `${segmentRadius}px`,
    "--menu-radius": `${segmentRadius}px`,
    "--menu-item-radius": `${segmentRadius}px`,
    "--logo-radius": `${spacing.logoRadius}px`,
    "--logo-badge-size": `${spacing.logoBadgeSize}px`,
    "--label-font-size": `${labelFontSize}px`,
    "--logo-to-label-gap": `${spacing.logoToLabel}px`,
    "--label-to-caret-adjust": `${spacing.labelToCaretAdjust}px`,
    "--white-edge-to-logo": `${spacing.whiteEdgeToLogo}px`,
    "--caret-to-white-edge": `${spacing.caretToWhiteEdge}px`,
    "--caret-width": `${spacing.caretWidth}px`,
    "--menu-left": `${menuMetrics.left}px`,
    "--menu-width": `${computedMenuWidth}px`,
    "--menu-height": `${computedMenuHeight}px`,
    "--menu-pad": `${spacing.menuPadding}px`,
    "--menu-item-gap": `${spacing.menuItemGap}px`,
    "--menu-item-pad-x": `${spacing.menuItemPaddingX}px`,
    "--menu-item-pad-y": `${spacing.menuItemPaddingY}px`,
    "--menu-item-font-size": `${spacing.menuFontSize}px`,
    "--menu-item-height": `${menuItemHeight}px`,
    "--menu-item-content-gap": `${spacing.menuItemContentGap}px`,
  };

  const handleApply = () => {
    onApply && onApply();
  };
  

  return (
    <div ref={wrapRef} className="jg-actions">
      <div
        ref={containerRef}
        className={`jg-container${open ? " jg-open" : ""}`}
        style={styleVars}
      >
        {/* Base: blue apply (extends left under the white by OVERLAP) */}
        <button 
          type="button" 
          className="jg-apply" 
          onClick={handleApply} 
          aria-label={applyButtonLabel}
          disabled={!bridgeState.onboardingComplete || bridgeState.hasRequiredFieldsMissing || jobStatus === 'Applied' || hasActiveFlow}
          style={(!bridgeState.onboardingComplete || bridgeState.hasRequiredFieldsMissing || jobStatus === 'Applied' || hasActiveFlow) ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
        >
          <span className="jg-apply__label">{applyButtonLabel}</span>
        </button>

        {/* Top: full white pill */}
        <button
          type="button"
          className="jg-brand"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="jg-actions-menu"
          onClick={() => {
            setOpen((prev) => {
              const next = !prev;
              if (!next) {
                // closing: drop focus to let hover-out hide the blue segment
                try { brandRef.current && brandRef.current.blur(); } catch { /* Optional operation; preserve the existing fallback. */ }
              }
              return next;
            });
          }}
          ref={brandRef}
        >
          <span className="jg-brand__badge">
            <img src={logoUrl} alt="" />
          </span>
          <span className="jg-brand__label">JOBGEN.AI</span>
          <Caret />
        </button>

        {open && (
          <div id="jg-actions-menu" className="jg-menu" role="menu">
            {items.map((it) => (
              <button
                key={it.key}
                role="menuitem"
                type="button"
                className="jg-menu__item"
                disabled={Boolean(it.disabled)}
                onClick={() => {
                  if (it.disabled) return;
                  onAction && onAction(it.key);
                  if (!shouldKeepMenuOpen) {
                    setOpen(false);
                    try { brandRef.current && brandRef.current.blur(); } catch { /* Optional operation; preserve the existing fallback. */ }
                  }
                }}
              >
                <span className="jg-menu__item-label">{it.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
