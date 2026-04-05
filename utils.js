// utils.js — shared helpers

const Utils = {

  // Normalize a track/artist string for comparison
  normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/\(official\s*(video|audio|music video|lyric video|visualizer)?\)/gi, '')
      .replace(/\[official\s*(video|audio|music video|lyric video|visualizer)?\]/gi, '')
      .replace(/\b(official|video|audio|lyrics?|hd|hq|4k|remaster(ed)?|ft\.?|feat\.?)\b/gi, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // Levenshtein distance for fuzzy matching
  levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  },

  // Similarity score 0-100 between two strings
  similarity(a, b) {
    const na = this.normalize(a);
    const nb = this.normalize(b);
    if (na === nb) return 100;
    if (!na || !nb) return 0;
    const maxLen = Math.max(na.length, nb.length);
    const dist = this.levenshtein(na, nb);
    return Math.round((1 - dist / maxLen) * 100);
  },

  // Sleep helper for rate limiting
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Save to chrome.storage.local
  async save(key, value) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
  },

  // Load from chrome.storage.local
  async load(key) {
    return new Promise(resolve =>
      chrome.storage.local.get([key], result => resolve(result[key]))
    );
  },

  // Remove from chrome.storage.local
  async remove(key) {
    return new Promise(resolve => chrome.storage.local.remove([key], resolve));
  },

  // Chunk array into batches
  chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  },

  // Deduplicate tracks by title+artist
  deduplicateTracks(tracks) {
    const seen = new Set();
    return tracks.filter(t => {
      const key = `${this.normalize(t.title)}|${this.normalize(t.artist)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  log(msg, data = null) {
    const prefix = '[YT→Spotify]';
    data ? console.log(prefix, msg, data) : console.log(prefix, msg);
  }
};
