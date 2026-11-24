# Deployment Guide

## Building the Extension

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build for production:**
   ```bash
   npm run build
   ```

3. **The built extension will be in the `dist/` folder**

## Testing Locally

1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `dist/` folder
6. The extension should now be loaded and active

## Testing Sites

Visit these sites to test functionality:
- **LinkedIn**: https://www.linkedin.com/jobs/
- **Indeed AU**: https://au.indeed.com/
- **Seek**: https://au.seek.com/

## Verification Checklist

- [ ] Floating button appears on job sites
- [ ] Button is draggable
- [ ] Clicking button opens job container
- [ ] Job Match tab shows job analysis
- [ ] LinkedIn Optimizer tab works on LinkedIn profiles
- [ ] Star rating system works
- [ ] Save button functions
- [ ] API calls to JobGen.AI work
- [ ] UI matches original extension exactly
- [ ] All fonts and icons load correctly

## Publishing to Chrome Web Store

1. **Prepare for submission:**
   - Ensure manifest.json has correct permissions
   - Remove any development-only code
   - Test thoroughly on all supported sites

2. **Create store listing:**
   - Screenshots of the extension in action
   - Detailed description
   - Privacy policy (if collecting user data)

3. **Upload to Chrome Web Store:**
   - Zip the contents of the `dist/` folder
   - Upload to Chrome Web Store Developer Dashboard
   - Fill out all required fields
   - Submit for review

## Environment Variables

No environment variables are needed. The extension uses:
- Chrome Extension APIs for user email
- JobGen.AI API endpoints (hardcoded)
- Chrome Extension storage

## Troubleshooting

### Extension doesn't load
- Check console for errors in `chrome://extensions/`
- Ensure all required permissions are in manifest.json
- Verify all files are in the dist folder

### API calls fail
- Check network tab for failed requests
- Verify user is logged into Chrome with Google account
- Ensure JobGen.AI API endpoints are accessible

### UI doesn't appear
- Check if site is in supported list (LinkedIn, Indeed, Seek)
- Verify content script is injected
- Check console for JavaScript errors

### Fonts/Icons missing
- Ensure all assets were copied to dist folder
- Check web_accessible_resources in manifest.json
- Verify file paths are correct
