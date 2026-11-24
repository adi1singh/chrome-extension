# JobGen Action Buttons Guidance

## Goal
Inject branded JobGen action buttons (Save, Autofill, Apply) on LinkedIn job cards whenever the job supports Easy Apply. The buttons should complement LinkedIn's existing controls, work in both the right-panel viewer and the standalone job view, and be ready for reuse on other job platforms.

## Key Requirements
- Display the JobGen buttons **only when an Easy Apply button is visible**.
- Support **both right-panel job cards and full-page tabs** (watch for DOM changes and shadow roots).
- **Do not alter or replace LinkedIn's native controls** (especially the built-in Save button).
- Present a compact split-pill with a JobGen menu (Save, Autofill) and a primary Apply CTA without crowding LinkedIn controls. Keep overall height around 44–48px with 8–10px vertical padding, 12–18px horizontal padding, 16px icons, and no drop shadows.
- Style the buttons with JobGen branding (icon + polished states) while blending with native UI.
- Implement the buttons as a **reusable React component** so the group can be rendered on other sites later.

## Current Implementation Highlights
- `ActionButtons.jsx` encapsulates the split pill UI (logo dropdown + Apply CTA) and injects its own CSS once per page.
- `setupLinkedInJobGenButtons()` (in `src/utils/linkedinHelpers.js`) observes the DOM, locates the Easy Apply host, and renders the React component via `createRoot`. If Easy Apply disappears, the component unmounts cleanly.
- `JobContainer.jsx` registers its existing `handleSaveButton`, `handleAutofillButton`, and `handleApplyButton` via `actionButtonsBridge.js`, so injected buttons reuse the same flows as the sidebar controls without relying on window globals.

## Usage Guidelines
1. **Rendering**: Call `setupLinkedInJobGenButtons()` whenever the extension determines the page is a LinkedIn job view. The helper is idempotent.
2. **Reusing Elsewhere**: Import `ActionButtons` and render it wherever needed, passing handlers for menu items or Apply.
   In production we wire this through `JobContainer.jsx`, where
   ```jsx
   const actionHandlersRef = useRef({
     save: () => handleSaveButton(),
     autofill: () => handleAutofillButton(),
     apply: () => handleApplyButton(),
   });
   ```
   is registered with the action button bridge so every injected instance (LinkedIn, Indeed, etc.) reuses the same core flows automatically.
3. **Platform Detection**: Before rendering, ensure the extension’s site detection updates the bridge with the active `currentSite` (see `updateActionButtonState` usage in `JobContainer.jsx`). `ActionButtons` reads this to select the proper platform preset.
4. **Platform-Specific Constants**: When onboarding a new site, add a preset to `PLATFORM_PRESETS` with the target pill width/height/radius but keep shared constants (logo radius, label font size, etc.) untouched. Validate the layout in both menu-closed and menu-open states.
5. **DOM Safety**: Keep the JobGen container separate from host controls; never remove or restyle native buttons.
6. **Visual Cohesion**: Use the component’s built-in grouping styles. Avoid manual overrides unless the host layout requires additional spacing.

## Reference Files
- `src/components/ActionButtons.jsx`
- `src/utils/linkedinHelpers.js`
- `src/content/App.jsx`
- `src/components/JobContainer.jsx`
