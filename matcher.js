// matcher.js — fuzzy track matching engine with confidence scores

const Matcher = (() => {

  const DEFAULT_THRESHOLD = 75;

  // Clean up common suffixes/prefixes in track names
  function cleanTitle(title) {
    return Utils.normalize(title)
      .replace(/\b(official|music|video|audio|lyric|lyrics|visualizer|hd|4k|live|acoustic|cover|remix|version|edit|extended|radio)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Score a single Spotify candidate against a YouTube track
  function scoreCandidate(ytTrack, spotifyTrack) {
    const ytTitle = cleanTitle(ytTrack.title);
    const ytArtist = Utils.normalize(ytTrack.artist);

    const spTitle = cleanTitle(spotifyTrack.name);
    const spArtists = spotifyTrack.artists.map(a => Utils.normalize(a.name));
    const spMainArtist = spArtists[0] || '';

    // Title similarity (weighted 50%)
    const titleScore = Utils.similarity(ytTitle, spTitle);

    // Artist similarity — check all credited artists (weighted 50%)
    const artistScores = spArtists.map(a => Utils.similarity(ytArtist, a));
    const artistScore = Math.max(...artistScores);

    // Exact artist bonus
    const exactArtistBonus = spArtists.some(a => a === ytArtist) ? 10 : 0;

    // Exact title bonus
    const exactTitleBonus = ytTitle === spTitle ? 10 : 0;

    // Weighted final score (capped at 100)
    const raw = (titleScore * 0.5) + (artistScore * 0.5) + exactArtistBonus + exactTitleBonus;
    return Math.min(100, Math.round(raw));
  }

  // Find best matching Spotify track for a YouTube track
  async function findBestMatch(ytTrack, threshold = DEFAULT_THRESHOLD) {
    const query = `${ytTrack.title} ${ytTrack.artist}`.trim();

    let searchData;
    try {
      searchData = await Spotify.searchTrack(query);
    } catch (e) {
      Utils.log('Search failed for:', query);
      return { matched: false, reason: 'search_error' };
    }

    const candidates = searchData?.tracks?.items || [];
    if (candidates.length === 0) {
      return { matched: false, reason: 'no_results' };
    }

    // Score all candidates
    const scored = candidates.map(candidate => ({
      track: candidate,
      score: scoreCandidate(ytTrack, candidate)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    Utils.log(`Match: "${ytTrack.title}" → "${best.track.name}" (${best.score}%)`);

    if (best.score >= threshold) {
      return {
        matched: true,
        uri: best.track.uri,
        spotifyTitle: best.track.name,
        spotifyArtist: best.track.artists.map(a => a.name).join(', '),
        score: best.score
      };
    }

    return {
      matched: false,
      reason: 'low_confidence',
      bestScore: best.score,
      bestCandidate: best.track.name
    };
  }

  // Match a batch of tracks with rate limiting
  async function matchTracks(ytTracks, threshold = DEFAULT_THRESHOLD, onProgress = null) {
    const results = {
      matched: [],
      skipped: [],
      errors: []
    };

    for (let i = 0; i < ytTracks.length; i++) {
      const track = ytTracks[i];
      if (onProgress) onProgress(i + 1, ytTracks.length, track);

      try {
        const result = await findBestMatch(track, threshold);
        if (result.matched) {
          results.matched.push({
            ytTrack: track,
            uri: result.uri,
            spotifyTitle: result.spotifyTitle,
            spotifyArtist: result.spotifyArtist,
            score: result.score
          });
        } else {
          results.skipped.push({
            ytTrack: track,
            reason: result.reason,
            bestScore: result.bestScore || 0
          });
        }
      } catch (e) {
        results.errors.push({ ytTrack: track, error: e.message });
      }

      // Rate limiting: ~3 requests/second
      await Utils.sleep(350);
    }

    return results;
  }

  return {
    matchTracks,
    findBestMatch,
    DEFAULT_THRESHOLD
  };
})();
