# YT Music → Spotify Sync — Chrome Extension

Transfers your YouTube Music taste (liked songs / playlists) to a Spotify playlist automatically. 
But you need to have a spotify premium for it to work or else spotify will not give access to wep api and also chrome developer dashboard charges 5 $ so u also cant add the extension their such a rip off 

---

## Setup Instructions

### Step 1 — Get a Spotify Client ID

1. Go to https://developer.spotify.com/dashboard
2. Log in and click **Create App**
3. Fill in:
   - App name: `YT Music Sync`
   - Redirect URI: you'll fill this in next
4. Click **Save**
5. Copy your **Client ID**

### Step 2 — Get your Redirect URI

1. Open Chrome and go to: `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked** and select this folder
4. Note your extension ID (looks like: `abcdefghijklmnopqrstuvwxyz123456`)
5. Your redirect URI is: `https://<YOUR_EXTENSION_ID>.chromiumapp.org/spotify`

### Step 3 — Add Redirect URI to Spotify App

1. Back in Spotify Dashboard → your app → **Edit Settings**
2. Add the redirect URI from Step 2
3. Save

### Step 4 — Add Client ID to extension

1. Open `spotify.js`
2. Replace `YOUR_SPOTIFY_CLIENT_ID` with your actual Client ID:
   ```js
   const CLIENT_ID = 'your_actual_client_id_here';
   ```

### Step 5 — Load the extension

1. Go to `chrome://extensions`
2. Click **Load unpacked**
3. Select this folder
4. The extension icon will appear in your toolbar

---

## How to Use

1. **Connect Spotify** — click the extension icon → Connect Spotify → log in
2. **Open YouTube Music** — go to music.youtube.com → open Liked Songs or any Playlist
3. **Scan** — click "Scan YouTube Music" in the popup
4. **Sync** — click "Sync to Spotify" — matched tracks are added to a "YouTube Music Sync" playlist

---

## Features

- Extracts liked songs and playlist tracks from YouTube Music via DOM scraping
- Fuzzy matching engine with confidence scores (Levenshtein distance + artist exact match bonus)
- Adjustable match threshold (50–95%)
- Deduplication — won't add songs already in your playlist
- Rate-limit aware — respects Spotify API limits
- Real-time progress with per-track logging
- Token auto-refresh — stays logged in

---

## File Structure

/extension
-  manifest.json        Chrome extension config (MV3)
-  popup.html           Extension popup UI
-  popup.js             Popup logic — orchestrates scan + sync
-  contentScript.js     Runs on music.youtube.com — scrapes DOM
-  spotify.js           Spotify Web API + PKCE auth
-  matcher.js           Fuzzy matching engine with confidence scores
-  utils.js             Shared helpers (normalize, levenshtein, storage)
-  background.js        Service worker
─  styles.css           Popup styles

---

## Notes

- YouTube Music's DOM changes occasionally — if scraping breaks, the selectors in `contentScript.js` may need updating
- Spotify free accounts support playlist creation and modification
- The extension is fully client-side — no backend, no data sent anywhere except Spotify's API
