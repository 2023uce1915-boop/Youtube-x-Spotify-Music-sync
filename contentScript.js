// contentScript.js — runs on music.youtube.com, scrapes track data from DOM

(function () {
  'use strict';

  // Wait for an element to appear in DOM
  function waitForElement(selector, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { observer.disconnect(); resolve(found); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout: ${selector}`)); }, timeout);
    });
  }

  // Scroll to bottom to load all lazy-loaded tracks
  async function scrollToLoadAll(container) {
    let lastHeight = 0;
    let attempts = 0;
    while (attempts < 30) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 1200));
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
      attempts++;
    }
  }

  // Extract tracks from the current page (liked songs or playlist)
  function extractTracks() {
    const tracks = [];

    // Strategy 1: ytmusic-responsive-list-item-renderer (liked songs / playlists)
    const items = document.querySelectorAll('ytmusic-responsive-list-item-renderer');
    items.forEach(item => {
      const titleEl = item.querySelector('.title, .primary-text, yt-formatted-string.title');
      const artistEl = item.querySelector(
        '.secondary-title, .secondary, .subtitle yt-formatted-string a, .flex-columns .secondary-flex-columns yt-formatted-string'
      );

      const title = titleEl?.textContent?.trim();
      const artist = artistEl?.textContent?.trim();

      if (title && artist && title.length > 0) {
        tracks.push({ title, artist, source: 'list' });
      }
    });

    if (tracks.length > 0) return tracks;

    // Strategy 2: ytmusic-shelf-renderer (home or search results)
    const shelfItems = document.querySelectorAll('ytmusic-two-row-item-renderer');
    shelfItems.forEach(item => {
      const titleEl = item.querySelector('.title');
      const subtitleEl = item.querySelector('.subtitle');
      const title = titleEl?.textContent?.trim();
      const artist = subtitleEl?.textContent?.split('•')?.[0]?.trim();
      if (title && artist) {
        tracks.push({ title, artist, source: 'shelf' });
      }
    });

    return tracks;
  }

  // Determine what page we're on
  function getPageContext() {
    const url = window.location.href;
    if (url.includes('playlist?list=LM')) return 'liked';
    if (url.includes('playlist?list=')) return 'playlist';
    if (url.includes('/watch')) return 'watch';
    return 'other';
  }

  // Main scan function triggered by popup
  async function scanPage() {
    const context = getPageContext();

    if (context === 'other' || context === 'watch') {
      return {
        success: false,
        error: 'Please open your Liked Songs or a Playlist on YouTube Music first.'
      };
    }

    try {
      // Wait for content to load
      await waitForElement('ytmusic-responsive-list-item-renderer', 6000).catch(() => null);
      await scrollToLoadAll();

      const raw = extractTracks();

      // Deduplicate
      const seen = new Set();
      const tracks = raw.filter(t => {
        const key = `${t.title.toLowerCase()}|${t.artist.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return {
        success: true,
        tracks,
        count: tracks.length,
        context
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'SCAN_TRACKS') {
      scanPage().then(sendResponse);
      return true; // async response
    }

    if (message.action === 'PING') {
      sendResponse({ alive: true, url: window.location.href, context: getPageContext() });
      return true;
    }
  });

})();
