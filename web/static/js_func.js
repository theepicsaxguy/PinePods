// // Truncate or expand based on the element's max-height
// function toggleDescription(guid, expanded) {
//     const content = document.querySelector(`.desc-${guid}`);
//     if (expanded) {
//         content.style.maxHeight = "none";  // Expand fully
//     } else {
//         content.style.maxHeight = "100px"; // Truncate (set to desired truncation height)
//     }
// }

document.addEventListener("DOMContentLoaded", () => {
  const allDescriptions = document.querySelectorAll('[id^="desc-"]');
  allDescriptions.forEach((desc) => {
    const id = desc.id.replace("desc-", "");
    toggleDescription(id, false); // Start all as collapsed
  });
});

window.toggleDescription = function (guid, shouldExpand) {
  const descContainer = document.querySelector(`.desc-${guid}`);
  if (descContainer) {
    if (shouldExpand) {
      descContainer.classList.add("expanded");
      descContainer.classList.remove("collapsed");
    } else {
      descContainer.classList.remove("expanded");
      descContainer.classList.add("collapsed");
    }
  } else {
    console.error("Description container not found for GUID: " + guid);
  }
};

window.addEventListener("load", function () {
  const descriptions = document.querySelectorAll(
    ".episode-description-container",
  );
  descriptions.forEach((desc) => {
    const btn = desc.nextElementSibling; // Assuming button is the next sibling
    if (desc.scrollHeight > desc.clientHeight) {
      if (btn) {
        btn.classList.remove("hidden"); // Show button if content is clipped
      }
    } else {
      if (btn) {
        btn.classList.add("hidden"); // Hide button if content is not clipped
      }
    }
  });
});

function toggle_description(guid) {
  const selector = `#${guid.replace(/[^a-zA-Z0-9-]/g, "")}`; // Use ID selector
  console.log("Trying to select:", selector);
  const descContainer = document.querySelector(selector);

  if (!descContainer) {
    console.error(
      "Description container not found for GUID: " +
        guid +
        " with selector: " +
        selector,
    );
    return;
  }

  const button = descContainer.querySelector(".toggle-desc-btn");
  if (!button) {
    console.error(
      "Button not found in description container for GUID: " + guid,
    );
    return;
  }

  if (descContainer.classList.contains("desc-collapsed")) {
    descContainer.classList.remove("desc-collapsed");
    descContainer.classList.add("desc-expanded");
    button.textContent = "";
  } else {
    descContainer.classList.add("desc-collapsed");
    descContainer.classList.remove("desc-expanded");
    button.textContent = "";
  }
}

// ============================================================
// Google Cast / Chromecast support
// ============================================================

// _castState holds all Cast runtime objects. Using a single object
// avoids polluting the global namespace and makes nullability explicit.
window._castState = {
  ready: false,
  remotePlayer: null,
  remotePlayerController: null,
};

// __onGCastApiAvailable must be defined BEFORE the Cast SDK script
// executes so it is available when the SDK calls it. Defining it here
// (at module evaluation time, before any lazy-load) is the correct
// pattern per the Google Cast CAF documentation.
window.__onGCastApiAvailable = function(isAvailable) {
  if (isAvailable) {
    window.initializeCastApi();
  } else {
    console.log('[Cast] API not available in this browser');
    window.dispatchEvent(new CustomEvent('castApiUnavailable'));
  }
};

window.initializeCastApi = function() {
  if (window._castState.ready) return;

  if (!window.cast || !window.cast.framework) {
    // SDK injected but framework object not yet present; retry shortly.
    console.warn('[Cast] framework not yet available, retrying in 200ms');
    setTimeout(window.initializeCastApi, 200);
    return;
  }

  try {
    const castContext = cast.framework.CastContext.getInstance();

    castContext.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      androidReceiverCompatible: true,
    });

    window._castState.remotePlayer = new cast.framework.RemotePlayer();
    window._castState.remotePlayerController = new cast.framework.RemotePlayerController(
      window._castState.remotePlayer
    );

    // Use SESSION_STATE_CHANGED (recommended by Google) for reliable
    // connect/disconnect events. IS_CONNECTED_CHANGED on RemotePlayer
    // can miss transitions when the page auto-rejoins a session.
    castContext.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      function() {
        const session = castContext.getCurrentSession();
        const connected = !!session;
        const deviceName = connected
          ? (session.getCastDevice().friendlyName || '')
          : '';
        window.dispatchEvent(new CustomEvent('castStateChanged', {
          detail: { isConnected: connected, deviceName: deviceName }
        }));
      }
    );

    window._castState.ready = true;
    console.log('[Cast] API initialized successfully');
    window.dispatchEvent(new CustomEvent('castApiReady'));
  } catch (e) {
    console.error('[Cast] Error initializing Cast API:', e);
    window.dispatchEvent(new CustomEvent('castApiError', {
      detail: { message: String(e) }
    }));
  }
};

// Lazily injects the Cast SDK script. Safe to call multiple times.
// The callback (window.__onGCastApiAvailable) is already defined above,
// so it will be present when the SDK calls it after loading.
window.loadCastSdk = function() {
  if (document.querySelector('script[data-pinepods-cast]')) return;
  const s = document.createElement('script');
  s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  s.setAttribute('data-pinepods-cast', '1');
  document.head.appendChild(s);
};

window.requestCastSession = function() {
  return new Promise(function(resolve, reject) {
    if (!window._castState.ready) {
      reject(new Error('[Cast] API not ready'));
      return;
    }

    const castContext = cast.framework.CastContext.getInstance();

    // Re-use an already-active session (e.g. auto-joined on page load).
    const existing = castContext.getCurrentSession();
    if (existing) {
      resolve(existing);
      return;
    }

    castContext.requestSession().then(function() {
      const session = castContext.getCurrentSession();
      resolve(session);
    }).catch(function(err) {
      console.error('[Cast] Session request error:', err);
      reject(err);
    });
  });
};

window.loadMediaToCast = function(mediaUrl, title, artworkUrl, startTime) {
  startTime = startTime || 0;
  return new Promise(function(resolve, reject) {
    // Always use CastContext as the authoritative source for the session.
    const session = window._castState.ready
      ? cast.framework.CastContext.getInstance().getCurrentSession()
      : null;

    if (!session) {
      reject(new Error('[Cast] No active session'));
      return;
    }

    // Determine MIME type from URL extension (strip query string first).
    let contentType = 'audio/mpeg';
    const path = mediaUrl.split('?')[0].toLowerCase();
    if (path.endsWith('.m4a') || path.endsWith('.aac')) {
      contentType = 'audio/mp4';
    } else if (path.endsWith('.ogg')) {
      contentType = 'audio/ogg';
    } else if (path.endsWith('.opus')) {
      contentType = 'audio/ogg; codecs=opus';
    } else if (path.endsWith('.flac')) {
      contentType = 'audio/flac';
    } else if (path.endsWith('.wav')) {
      contentType = 'audio/wav';
    } else if (path.endsWith('.webm')) {
      contentType = 'audio/webm';
    }

    const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, contentType);
    mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    mediaInfo.metadata.title = title || 'Podcast';
    mediaInfo.metadata.subtitle = 'Pinepods';
    if (artworkUrl) {
      mediaInfo.metadata.images = [new chrome.cast.Image(artworkUrl)];
    }

    const loadRequest = new chrome.cast.media.LoadRequest(mediaInfo);
    loadRequest.autoplay = true;
    loadRequest.currentTime = startTime;

    session.loadMedia(loadRequest).then(function() {
      console.log('[Cast] Media loaded');
      resolve();
    }).catch(function(err) {
      console.error('[Cast] Error loading media:', err);
      window.dispatchEvent(new CustomEvent('castError', {
        detail: { message: String(err) }
      }));
      reject(err);
    });
  });
};

window.castPlay = function() {
  const rp = window._castState.remotePlayer;
  const rpc = window._castState.remotePlayerController;
  if (rp && rpc && !rp.isPlaying) {
    rpc.playOrPause();
  }
};

window.castPause = function() {
  const rp = window._castState.remotePlayer;
  const rpc = window._castState.remotePlayerController;
  if (rp && rpc && rp.isPlaying) {
    rpc.playOrPause();
  }
};

window.castSeekTo = function(time) {
  const rp = window._castState.remotePlayer;
  const rpc = window._castState.remotePlayerController;
  if (rp && rpc) {
    rp.currentTime = time;
    rpc.seek();
  }
};

window.castSetVolume = function(volume) {
  const rp = window._castState.remotePlayer;
  const rpc = window._castState.remotePlayerController;
  if (rp && rpc) {
    rp.volumeLevel = Math.max(0, Math.min(1, volume));
    rpc.setVolumeLevel();
  }
};

window.castStop = function() {
  if (!window._castState.ready) return;
  const session = cast.framework.CastContext.getInstance().getCurrentSession();
  if (session) {
    session.endSession(true);
  }
};

// Returns true when a Cast session is currently active.
// Uses CastContext (the authoritative source) rather than a cached reference.
window.isCasting = function() {
  if (!window._castState.ready) return false;
  return !!cast.framework.CastContext.getInstance().getCurrentSession();
};

window.getCastState = function() {
  if (!window._castState.ready) return 'unavailable';
  return cast.framework.CastContext.getInstance().getCastState();
};
