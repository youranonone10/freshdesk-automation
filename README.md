# Freshdesk AI Resolution Assistant (Chrome + Brave)

Manifest V3 browser extension that enhances Freshdesk tickets with:

- Automatic ticket/conversation analysis
- Freshdesk solution article lookup
- Claude-powered response suggestions
- Side panel UI with summary, analysis, and action buttons

## Project structure

- `/manifest.json` - Extension manifest (MV3)
- `/src/background.js` - Background service worker for API + caching
- `/src/content.js` - Injected side panel + ticket analysis UX
- `/src/styles.css` - Side panel styling
- `/src/popup.html` + `/src/popup.js` - Quick actions popup
- `/src/options.html` + `/src/options.js` - Settings for API keys/domain

## Setup

1. Open `chrome://extensions` (Chrome) or `brave://extensions` (Brave).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository folder.
4. Open extension **Settings** page and configure:
   - Freshdesk domain (`yourcompany.freshdesk.com`)
   - Freshdesk API key
   - Anthropic API key
   - Claude model (optional; default is `claude-3-5-sonnet-latest`)

## Usage

1. Open a Freshdesk ticket page (URL like `/a/tickets/{id}` or `/helpdesk/tickets/{id}`).
2. The side panel appears automatically and runs analysis.
3. Review:
   - Ticket summary
   - Conversation analysis
   - Suggested resolution
   - Relevant articles
4. Use action buttons:
   - **Apply to Reply Box**
   - **Copy**
   - **Refresh**

## Notes

- API calls are handled in the background service worker.
- Article lookups are cached in local storage for 15 minutes to reduce API traffic.
- Credentials are stored via browser extension storage (`chrome.storage.sync`).
