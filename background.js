// background.js — service worker for message passing

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Keep service worker alive for async ops
  if (message.action === 'KEEP_ALIVE') {
    sendResponse({ ok: true });
    return true;
  }
});

// Handle extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[YT→Spotify] Extension installed');
  console.log('[YT→Spotify] Required Redirect URI for Spotify Dashboard:', chrome.identity.getRedirectURL('spotify'));
});
