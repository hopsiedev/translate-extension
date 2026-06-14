(function () {
  function normalizeTracks(tracks, videoId) {
    return tracks.map(t => {
      let url = t.baseUrl || '';
      // Fix HTML-entity encoding (YouTube sometimes encodes & as &amp; in JSON strings)
      url = url.replace(/&amp;/g, '&');
      // Ensure absolute URL
      if (url.startsWith('//')) url = 'https:' + url;
      if (url.startsWith('/'))  url = 'https://www.youtube.com' + url;
      // If still empty, build from the public timedtext endpoint
      if (!url && videoId) {
        url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${t.languageCode || 'en'}&fmt=json3`;
      }
      return { ...t, baseUrl: url };
    });
  }

  function tryGetCaptions() {
    // Primary: ytInitialPlayerResponse
    const ipr = window.ytInitialPlayerResponse;
    if (ipr && ipr.captions && ipr.captions.playerCaptionsTracklistRenderer) {
      const raw   = ipr.captions.playerCaptionsTracklistRenderer.captionTracks || [];
      const vidId = ipr.videoDetails?.videoId || getVideoIdFromUrl();
      if (raw.length > 0) {
        return { tracks: normalizeTracks(raw, vidId), videoId: vidId };
      }
    }

    // Secondary: ytInitialData (sometimes has subtitles in engagementPanels)
    try {
      const idata = window.ytInitialData;
      if (idata) {
        const panels = idata.engagementPanels || [];
        for (const panel of panels) {
          const renderer = panel?.engagementPanelSectionListRenderer?.content?.transcriptRenderer;
          if (renderer) {
            // Subtitles exist but in transcript form — still signal success so content script knows
            const vidId = getVideoIdFromUrl();
            return { tracks: [], videoId: vidId, hasTranscriptPanel: true };
          }
        }
      }
    } catch (_) {}

    return null;
  }

  function getVideoIdFromUrl() {
    try {
      return new URLSearchParams(window.location.search).get('v') || '';
    } catch (_) { return ''; }
  }

  function dispatch(result) {
    window.dispatchEvent(new CustomEvent('yt-translate-caption-tracks', {
      detail: result || { tracks: [], videoId: getVideoIdFromUrl() }
    }));
  }

  function pollForCaptions(maxAttempts, onDone) {
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      const result = tryGetCaptions();
      if (result || attempts >= maxAttempts) {
        clearInterval(id);
        onDone(result);
      }
    }, 200);
  }

  // ── Initial page load ──────────────────────────────────────────────────────
  pollForCaptions(40, result => dispatch(result));

  // ── SPA navigation (YouTube switches videos without full reload) ───────────
  window.addEventListener('yt-navigate-finish', () => {
    // Small delay to let ytInitialPlayerResponse update for new video
    setTimeout(() => pollForCaptions(40, result => dispatch(result)), 300);
  });
})();
