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

window.castApiReady = false;
window.currentCastSession = null;
window.remotePlayer = null;
window.remotePlayerController = null;

window.initializeCastApi = function() {
  if (window.castApiReady) return;
  
  if (!window.cast || !window.cast.framework) {
    console.log("Cast API not available, retrying...");
    setTimeout(window.initializeCastApi, 500);
    return;
  }

  try {
    const castContext = cast.framework.CastContext.getInstance();
    
    castContext.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      androidReceiverCompatible: true,
    });

    window.remotePlayer = new cast.framework.RemotePlayer();
    window.remotePlayerController = new cast.framework.RemotePlayerController(window.remotePlayer);

    window.remotePlayerController.addEventListener(cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED, function(event) {
      window.dispatchEvent(new CustomEvent('castStateChanged', {
        detail: { isConnected: window.remotePlayer.isConnected }
      }));
    });

    window.remotePlayerController.addEventListener(cast.framework.RemotePlayerEventType.MEDIA_INFO_CHANGED, function(event) {
      window.dispatchEvent(new CustomEvent('castMediaChanged', {
        detail: { 
          isPlaying: window.remotePlayer.isPlaying,
          currentTime: window.remotePlayer.currentTime,
          volume: window.remotePlayer.volumeLevel
        }
      }));
    });

    window.castApiReady = true;
    console.log("Cast API initialized successfully");
    
    window.dispatchEvent(new CustomEvent('castApiReady'));
  } catch (e) {
    console.error("Error initializing Cast API:", e);
  }
};

window.requestCastSession = function() {
  return new Promise((resolve, reject) => {
    if (!window.castApiReady) {
      reject(new Error("Cast API not ready"));
      return;
    }

    const castContext = cast.framework.CastContext.getInstance();
    castContext.requestSession().then(session => {
      window.currentCastSession = session;
      console.log("Cast session started:", session.getSessionId());
      resolve(session);
    }).catch(err => {
      console.error("Cast session error:", err);
      reject(err);
    });
  });
};

window.loadMediaToCast = function(mediaUrl, title, artworkUrl, startTime = 0) {
  return new Promise((resolve, reject) => {
    if (!window.currentCastSession) {
      reject(new Error("No active Cast session"));
      return;
    }

    const session = window.currentCastSession;
    let contentType = 'audio/mpeg';
    if (mediaUrl.endsWith('.m4a') || mediaUrl.endsWith('.aac')) {
      contentType = 'audio/mp4';
    } else if (mediaUrl.endsWith('.ogg')) {
      contentType = 'audio/ogg';
    }

    const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, contentType);
    mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    mediaInfo.metadata.title = title || 'Podcast';
    if (artworkUrl) {
      mediaInfo.metadata.images = [{ url: artworkUrl }];
    }

    const loadRequest = new chrome.cast.media.LoadRequest(mediaInfo);
    loadRequest.autoplay = true;
    loadRequest.currentTime = startTime;

    session.loadMedia(loadRequest).then(() => {
      console.log("Media loaded to Cast device");
      resolve();
    }).catch(err => {
      console.error("Error loading media:", err);
      reject(err);
    });
  });
};

window.castPlay = function() {
  if (window.remotePlayer && window.remotePlayerController) {
    window.remotePlayerController.playOrPause();
  }
};

window.castPause = function() {
  if (window.remotePlayer && window.remotePlayerController) {
    window.remotePlayerController.playOrPause();
  }
};

window.castSeekTo = function(time) {
  if (window.remotePlayer && window.remotePlayerController) {
    window.remotePlayer.currentTime = time;
    window.remotePlayerController.seek();
  }
};

window.castSetVolume = function(volume) {
  if (window.remotePlayer && window.remotePlayerController) {
    window.remotePlayer.volumeLevel = Math.max(0, Math.min(1, volume));
    window.remotePlayerController.setVolumeLevel();
  }
};

window.castStop = function() {
  if (window.currentCastSession) {
    window.currentCastSession.endSession(true);
    window.currentCastSession = null;
  }
};

window.isCasting = function() {
  return window.remotePlayer && window.remotePlayer.isConnected;
};

window.getCastState = function() {
  if (!window.castApiReady) return 'unavailable';
  const castContext = cast.framework.CastContext.getInstance();
  return castContext.getCastState();
};

window.addEventListener('load', function() {
  if (window.cast && window.cast.framework) {
    window.initializeCastApi();
  } else {
    window['__onGCastApiAvailable'] = function(isAvailable) {
      if (isAvailable) {
        window.initializeCastApi();
      } else {
        console.log("Cast API not available");
      }
    };
  }
});
