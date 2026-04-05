// popup.js — orchestrates UI and sync logic

(async () => {
  'use strict';

  // --- State ---
  let scannedTracks = [];
  let isSyncing = false;

  // --- DOM refs ---
  const btnConnect = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');
  const btnScan = document.getElementById('btn-scan');
  const btnSync = document.getElementById('btn-sync');
  const authStatus = document.getElementById('auth-status');
  const authLabel = document.getElementById('auth-label');
  const scanResult = document.getElementById('scan-result');
  const scanCount = document.getElementById('scan-count');
  const syncProgress = document.getElementById('sync-progress');
  const progressBar = document.getElementById('progress-bar');
  const progressLabel = document.getElementById('progress-label');
  const syncStats = document.getElementById('sync-stats');
  const statMatched = document.getElementById('stat-matched');
  const statSkipped = document.getElementById('stat-skipped');
  const statErrors = document.getElementById('stat-errors');
  const thresholdSlider = document.getElementById('threshold-slider');
  const thresholdLabel = document.getElementById('threshold-label');
  const logSection = document.getElementById('log-section');
  const logBox = document.getElementById('log-box');
  const toast = document.getElementById('toast');

  // --- Helpers ---
  function showToast(msg, type = 'info') {
    toast.textContent = msg;
    toast.className = `toast toast-${type}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  function log(msg) {
    logSection.classList.remove('hidden');
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function setAuthUI(loggedIn, username = '') {
    if (loggedIn) {
      authStatus.className = 'auth-status connected';
      authLabel.textContent = username ? `Connected as ${username}` : 'Connected to Spotify';
      btnConnect.classList.add('hidden');
      btnDisconnect.classList.remove('hidden');
      btnScan.disabled = false;
    } else {
      authStatus.className = 'auth-status disconnected';
      authLabel.textContent = 'Not connected to Spotify';
      btnConnect.classList.remove('hidden');
      btnDisconnect.classList.add('hidden');
      btnScan.disabled = true;
      btnSync.disabled = true;
    }
  }

  function updateProgress(current, total, trackName) {
    const pct = Math.round((current / total) * 100);
    progressBar.style.width = `${pct}%`;
    progressLabel.textContent = `(${current}/${total}) ${trackName}`;
  }

  // --- Show Redirect URI ---
  function showRedirectUri() {
    const msg = document.getElementById('redirect-uri-msg');
    const val = document.getElementById('redirect-uri-val');
    if (msg && val) {
      val.textContent = Spotify.getRedirectUri();
      msg.classList.remove('hidden');
    }
  }

  // --- Init ---
  async function init() {
    showRedirectUri();
    const loggedIn = await Spotify.isLoggedIn();
    if (loggedIn) {
      try {
        const me = await Spotify.getMe();
        setAuthUI(true, me.display_name || me.id);
      } catch {
        setAuthUI(false);
      }
    } else {
      setAuthUI(false);
    }

    // Restore scanned tracks from storage
    const saved = await Utils.load('scanned_tracks');
    if (saved?.length) {
      scannedTracks = saved;
      scanCount.textContent = scannedTracks.length;
      scanResult.classList.remove('hidden');
      btnSync.disabled = !loggedIn;
      log(`Restored ${scannedTracks.length} previously scanned tracks`);
    }
  }

  // --- Connect Spotify ---
  btnConnect.addEventListener('click', async () => {
    btnConnect.disabled = true;
    btnConnect.textContent = 'Connecting...';
    try {
      await Spotify.login();
      const me = await Spotify.getMe();
      setAuthUI(true, me.display_name || me.id);
      showToast('Connected to Spotify!', 'success');
      if (scannedTracks.length > 0) btnSync.disabled = false;
    } catch (e) {
      showToast(`Connection failed: ${e.message}`, 'error');
      log(`Auth error: ${e.message}`);
    } finally {
      btnConnect.disabled = false;
      btnConnect.textContent = 'Connect Spotify';
    }
  });

  // --- Disconnect ---
  btnDisconnect.addEventListener('click', async () => {
    await Spotify.logout();
    setAuthUI(false);
    showToast('Disconnected from Spotify');
  });

  // --- Scan YouTube Music ---
  btnScan.addEventListener('click', async () => {
    btnScan.disabled = true;
    btnScan.textContent = 'Scanning...';
    scanResult.classList.add('hidden');

    try {
      // Find active YouTube Music tab
      const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });
      if (tabs.length === 0) {
        showToast('Please open YouTube Music in a tab first', 'error');
        return;
      }

      const tab = tabs[0];

      // Ping content script
      const ping = await chrome.tabs.sendMessage(tab.id, { action: 'PING' }).catch(() => null);
      if (!ping?.alive) {
        showToast('Could not reach YouTube Music tab — try refreshing it', 'error');
        return;
      }

      log(`Scanning page: ${ping.context}`);

      // Trigger scan
      const result = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_TRACKS' });

      if (!result.success) {
        showToast(result.error, 'error');
        log(`Scan failed: ${result.error}`);
        return;
      }

      scannedTracks = result.tracks;
      await Utils.save('scanned_tracks', scannedTracks);

      scanCount.textContent = scannedTracks.length;
      scanResult.classList.remove('hidden');
      btnSync.disabled = false;

      showToast(`Found ${scannedTracks.length} tracks!`, 'success');
      log(`Scanned ${scannedTracks.length} tracks from ${result.context}`);

    } catch (e) {
      showToast(`Scan error: ${e.message}`, 'error');
      log(`Scan error: ${e.message}`);
    } finally {
      btnScan.disabled = false;
      btnScan.textContent = 'Scan YouTube Music';
    }
  });

  // --- Threshold slider ---
  thresholdSlider.addEventListener('input', () => {
    thresholdLabel.textContent = `${thresholdSlider.value}%`;
  });

  // --- Sync to Spotify ---
  btnSync.addEventListener('click', async () => {
    if (isSyncing) return;
    if (scannedTracks.length === 0) {
      showToast('No tracks to sync — scan YouTube Music first', 'error');
      return;
    }

    isSyncing = true;
    btnSync.disabled = true;
    btnSync.textContent = 'Syncing...';
    syncProgress.classList.remove('hidden');
    syncStats.classList.add('hidden');

    const threshold = parseInt(thresholdSlider.value);
    log(`Starting sync — ${scannedTracks.length} tracks, threshold: ${threshold}%`);

    try {
      // Match tracks
      log('Matching tracks with Spotify...');
      const results = await Matcher.matchTracks(
        scannedTracks,
        threshold,
        (current, total, track) => {
          updateProgress(current, total, `${track.title} — ${track.artist}`);
          log(`Matching: ${track.title} by ${track.artist}`);
        }
      );

      log(`Matched: ${results.matched.length}, Skipped: ${results.skipped.length}, Errors: ${results.errors.length}`);

      if (results.matched.length === 0) {
        showToast('No tracks matched above threshold', 'error');
        progressLabel.textContent = 'No matches found';
        return;
      }

      // Get Spotify user
      progressLabel.textContent = 'Creating playlist...';
      const me = await Spotify.getMe();

      // Find or create sync playlist
      const playlist = await Spotify.findOrCreateSyncPlaylist(me.id);
      log(`Playlist: "${playlist.name}" (${playlist.id})`);

      // Get existing tracks to avoid duplicates
      progressLabel.textContent = 'Checking for duplicates...';
      const existingUris = new Set(await Spotify.getPlaylistTracks(playlist.id));
      const newUris = results.matched
        .map(m => m.uri)
        .filter(uri => !existingUris.has(uri));

      log(`Adding ${newUris.length} new tracks (${results.matched.length - newUris.length} already in playlist)`);

      if (newUris.length > 0) {
        progressLabel.textContent = `Adding ${newUris.length} tracks...`;
        await Spotify.addTracksToPlaylist(playlist.id, newUris);
      }

      // Show final stats
      progressBar.style.width = '100%';
      progressLabel.textContent = 'Done!';
      syncStats.classList.remove('hidden');
      statMatched.textContent = results.matched.length;
      statSkipped.textContent = results.skipped.length;
      statErrors.textContent = results.errors.length;

      showToast(`Synced ${newUris.length} tracks to Spotify!`, 'success');
      log(`Sync complete — ${newUris.length} tracks added to "${playlist.name}"`);

      // Log skipped tracks
      if (results.skipped.length > 0) {
        results.skipped.forEach(s => {
          log(`Skipped: "${s.ytTrack.title}" (score: ${s.bestScore || 0}%)`);
        });
      }

    } catch (e) {
      showToast(`Sync failed: ${e.message}`, 'error');
      log(`Sync error: ${e.message}`);
      progressLabel.textContent = `Error: ${e.message}`;
    } finally {
      isSyncing = false;
      btnSync.disabled = false;
      btnSync.textContent = 'Sync to Spotify';
    }
  });

  // Boot
  await init();

})();
