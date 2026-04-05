// spotify.js — Spotify Web API wrapper with PKCE auth

const Spotify = (() => {

  const CLIENT_ID = '7bd8e5f99d5d495cbd5be2daab03136d';
  const REDIRECT_URI = chrome.identity.getRedirectURL('spotify');
  const SCOPES = [
    'playlist-modify-private',
    'playlist-modify-public',
    'user-library-modify',
    'user-library-read',
    'playlist-read-private',
    'user-read-private'
  ].join(' ');

  const API_BASE = 'https://api.spotify.com/v1';

  function generateCodeVerifier(length = 128) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    arr.forEach(v => result += chars[v % chars.length]);
    return result;
  }

  async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function login() {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    await Utils.save('pkce_verifier', verifier);

    console.log('[YT->Spotify] Redirect URI:', REDIRECT_URI);
    console.log('[YT->Spotify] Client ID:', CLIENT_ID);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      show_dialog: 'true'
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params}`;

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        async (redirectUrl) => {
          console.log('[YT->Spotify] Redirect URL:', redirectUrl);
          console.log('[YT->Spotify] Last error:', chrome.runtime.lastError);

          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!redirectUrl) {
            reject(new Error('Auth cancelled or blocked'));
            return;
          }
          try {
            const url = new URL(redirectUrl);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            if (error) throw new Error('Spotify auth error: ' + error);
            if (!code) throw new Error('No auth code returned');
            console.log('[YT->Spotify] Got code, exchanging for tokens...');
            await exchangeCode(code);
            resolve(true);
          } catch (e) {
            console.error('[YT->Spotify] Auth error:', e.message);
            reject(e);
          }
        }
      );
    });
  }

  async function exchangeCode(code) {
    const verifier = await Utils.load('pkce_verifier');
    console.log('[YT->Spotify] Verifier present:', !!verifier);
    if (!verifier) throw new Error('PKCE verifier missing — please try again');

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: verifier
      })
    });

    const data = await response.json();
    console.log('[YT->Spotify] Token response:', response.status, JSON.stringify(data));

    if (!response.ok) {
      throw new Error('Token exchange failed: ' + (data.error_description || data.error || response.status));
    }

    await storeTokens(data);
    await Utils.remove('pkce_verifier');
    console.log('[YT->Spotify] Tokens stored successfully!');
  }

  async function storeTokens(data) {
    const expiresAt = Date.now() + data.expires_in * 1000;
    await Utils.save('spotify_access_token', data.access_token);
    await Utils.save('spotify_refresh_token', data.refresh_token);
    await Utils.save('spotify_expires_at', expiresAt);
  }

  async function refreshToken() {
    const refreshTok = await Utils.load('spotify_refresh_token');
    if (!refreshTok) throw new Error('No refresh token — please log in again');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshTok,
        client_id: CLIENT_ID
      })
    });
    if (!response.ok) throw new Error('Token refresh failed');
    const data = await response.json();
    await storeTokens(data);
    return data.access_token;
  }

  async function getAccessToken() {
    const expiresAt = await Utils.load('spotify_expires_at');
    const accessToken = await Utils.load('spotify_access_token');
    if (!accessToken) throw new Error('Not authenticated with Spotify');
    if (Date.now() > expiresAt - 60000) return await refreshToken();
    return accessToken;
  }

  async function isLoggedIn() {
    const token = await Utils.load('spotify_access_token');
    return !!token;
  }

  async function logout() {
    await Utils.remove('spotify_access_token');
    await Utils.remove('spotify_refresh_token');
    await Utils.remove('spotify_expires_at');
  }

  async function request(method, endpoint, body = null, retries = 3) {
    const token = await getAccessToken();
    const options = {
      method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(API_BASE + endpoint, options);
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '2') * 1000;
      await Utils.sleep(retryAfter);
      if (retries > 0) return request(method, endpoint, body, retries - 1);
      throw new Error('Rate limit exceeded');
    }
    if (response.status === 401) {
      await refreshToken();
      if (retries > 0) return request(method, endpoint, body, retries - 1);
    }
    if (response.status === 204) return null;
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error('Spotify API error ' + response.status + ': ' + (err.error?.message || 'Unknown'));
    }
    return response.json();
  }

  async function getMe() { return request('GET', '/me'); }

  async function searchTrack(query) {
    return request('GET', '/search?q=' + encodeURIComponent(query) + '&type=track&limit=5');
  }

  async function getUserPlaylists() {
    let playlists = [], url = '/me/playlists?limit=50';
    while (url) {
      const data = await request('GET', url.replace(API_BASE, ''));
      playlists = playlists.concat(data.items);
      url = data.next;
    }
    return playlists;
  }

  async function getPlaylistTracks(playlistId) {
    let tracks = [], url = '/playlists/' + playlistId + '/tracks?limit=100&fields=next,items(track(id,uri))';
    while (url) {
      const data = await request('GET', url.replace(API_BASE, ''));
      tracks = tracks.concat(data.items.map(i => i.track?.uri).filter(Boolean));
      url = data.next;
    }
    return tracks;
  }

  async function createPlaylist(userId, name, description = '') {
    return request('POST', '/users/' + userId + '/playlists', { name, description, public: false });
  }

  async function addTracksToPlaylist(playlistId, uris) {
    const batches = Utils.chunk(uris, 100);
    for (const batch of batches) {
      await request('POST', '/playlists/' + playlistId + '/tracks', { uris: batch });
      await Utils.sleep(200);
    }
  }

  async function findOrCreateSyncPlaylist(userId) {
    const PLAYLIST_NAME = 'YouTube Music Sync';
    const existing = await getUserPlaylists();
    const found = existing.find(p => p.name === PLAYLIST_NAME);
    if (found) return found;
    return createPlaylist(userId, PLAYLIST_NAME, 'Auto-synced from YouTube Music');
  }

  function getRedirectUri() {
    return REDIRECT_URI;
  }

  return { login, logout, isLoggedIn, getMe, searchTrack, getUserPlaylists, getPlaylistTracks, createPlaylist, addTracksToPlaylist, findOrCreateSyncPlaylist, getRedirectUri };
})();
