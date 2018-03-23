// Latest file can be found here: https://cdn.webrtc-experiment.com/getScreenId.js
// Documentation     - https://github.com/muaz-khan/getScreenId.
/*
getScreenId(function (error, sourceId, screen_constraints) {
  // error    == null || 'permission-denied' || 'not-installed' || 'installed-disabled' || 'not-chrome'
  // sourceId == null || 'string' || 'firefox'

  if(sourceId == 'firefox') {
      navigator.mozGetUserMedia(screen_constraints, onSuccess, onFailure);
  }
  else navigator.webkitGetUserMedia(screen_constraints, onSuccess, onFailure);
});
*/

(function() {
  window.getScreenId = function(callback) {
    // for Firefox:
    // sourceId == 'firefox'
    // screen_constraints = {...}
    if (!!navigator.mozGetUserMedia) {
      callback(null, 'firefox', {
          video: {
              mozMediaSource: 'window',
              mediaSource: 'window'
          }
      });
      return;
    }
    window.addEventListener('message', onIFrameCallback);
    /**
     * @enum {chromeMediaSourceId} permission-denied; sourceId;
     */
    function onIFrameCallback(event) {
      if (!event.data) return;
      if (event.data.chromeMediaSourceId) { // 拿到了sourceId;
        if (event.data.chromeMediaSourceId === 'PermissionDeniedError') {
          // content-script透传回来的错误信息;
          callback('permission-denied');
        } else {
          callback(null, event.data.chromeMediaSourceId, getScreenConstraints(null, event.data.chromeMediaSourceId));
        }
        // this event listener is no more needed
        window.removeEventListener('message', onIFrameCallback);
      }

      // 没拿到sourceId的情况;
      if (event.data.chromeExtensionStatus) { // 只拿到了status;
        console.log('没拿到sourceId');
        callback(event.data.chromeExtensionStatus, null, getScreenConstraints(event.data.chromeExtensionStatus));
        // this event listener is no more needed
        window.removeEventListener('message', onIFrameCallback);
      }
    }

    setTimeout(postGetSourceIdMessage, 100);
  };

  // 根据status拿到constraints;
  function getScreenConstraints(error, sourceId) {
    var screen_constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: error ? 'screen' : 'desktop', // screen是没拿到sourceId的时候;
          maxWidth: window.screen.width > 1920 ? window.screen.width : 1920,
          maxHeight: window.screen.height > 1080 ? window.screen.height : 1080
        },
        optional: []
      }
    };
    if (sourceId) {
      screen_constraints.video.mandatory.chromeMediaSourceId = sourceId;
    }
    return screen_constraints;
  }

  // 发送 get sourceId的指令;
  function postGetSourceIdMessage() {
    if (!iframe) {
      loadIFrame(postGetSourceIdMessage);
      return;
    }
    if (!iframe.isLoaded) {
      setTimeout(postGetSourceIdMessage, 100);
      return;
    }
    // 向iframe发送消息;
    iframe.contentWindow.postMessage({
      captureSourceId: true
    }, '*');
  }

  var iframe;

  // this function is used in RTCMultiConnection v3
  window.getScreenConstraints = function(callback) {
    loadIFrame(function() {
      getScreenId(function(error, sourceId, screen_constraints) {
        if(!screen_constraints) {
            screen_constraints = {
                video: true
            };
        }

        callback(error, screen_constraints.video);
      });
    });
  };

  function loadIFrame(loadCallback) {
    if (iframe) {
      loadCallback();
      return;
    }

    iframe = document.createElement('iframe');
    iframe.onload = function() {
      iframe.isLoaded = true;
      loadCallback();
    };
    iframe.src = 'https://www.webrtc-experiment.com/getSourceId/'; // https://wwww.yourdomain.com/getScreenId.html
    iframe.style.display = 'none';
    (document.body || document.documentElement).appendChild(iframe);
  }

  window.getChromeExtensionStatus = function(callback) {
    // for Firefox:
    if (!!navigator.mozGetUserMedia) {
      callback('installed-enabled');
      return;
    }

    window.addEventListener('message', onIFrameCallback);

    function onIFrameCallback(event) {
      if (!event.data) return;

      if (event.data.chromeExtensionStatus) {
        callback(event.data.chromeExtensionStatus);

        // this event listener is no more needed
        window.removeEventListener('message', onIFrameCallback);
      }
    }

    setTimeout(postGetChromeExtensionStatusMessage, 100);
  };

  function postGetChromeExtensionStatusMessage() {
    if (!iframe) {
        loadIFrame(postGetChromeExtensionStatusMessage);
        return;
    }

    if (!iframe.isLoaded) {
        setTimeout(postGetChromeExtensionStatusMessage, 100);
        return;
    }

    iframe.contentWindow.postMessage({
        getChromeExtensionStatus: true
    }, '*');
  }
})();
