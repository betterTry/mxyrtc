
// https://github.com/muaz-khan/DetectRTC
var DetectRTC = {};

var screenCallback;

DetectRTC.screen = {
    chromeMediaSource: 'screen',
    getSourceId: function (callback) {
	    screenCallback = callback;
      window.postMessage('get-sourceId', '*');
    },
    onMessageCallback: function (data) {
  		// 发生了错误;
      if (data == 'PermissionDeniedError') {
        DetectRTC.screen.chromeMediaSource = 'PermissionDeniedError';
        if (screenCallback) return screenCallback('PermissionDeniedError');
        else throw new Error('PermissionDeniedError');
      }

      // extension notified his presence
      if (data == 'rtcmulticonnection-extension-loaded') {
        // content-script 有回应了;
        console.log('content-script 有回应了');
        DetectRTC.screen.chromeMediaSource = 'desktop';
      }

      // extension shared temp sourceId
      if (data.sourceId) {
        DetectRTC.screen.sourceId = data.sourceId;
        if (screenCallback) screenCallback(DetectRTC.screen.sourceId);
      }
    },
    getChromeExtensionStatus: function (callback) {
      // 先看看加载了没;
      var extensionid = 'ajhifddimkapgcifgcodmmfdlknahffk';
      var image = document.createElement('img');
      image.src = 'chrome-extension://' + extensionid + '/icon.png';
      image.onload = function () {
  			if (!DetectRTC.screen) DetectRTC.screen = {};
  			if (!DetectRTC.screen.chromeMediaSource) DetectRTC.screen.chromeMediaSource = '';

        // 插件已经有了回应;
  			if (DetectRTC.screen.chromeMediaSource === 'desktop') {
  				callback('installed-enabled');
  				return;
  			}
        DetectRTC.screen.chromeMediaSource = 'screen';
        window.postMessage('are-you-there', '*'); // 看扩展是否ok;
        setTimeout(function () {
          // 看看扩展是不是已经ok了;
          if (DetectRTC.screen.chromeMediaSource == 'screen') {
            callback('installed-disabled');
          } else {
            callback('installed-enabled');
			    }
        }, 1000);
      };
      // 没安装;
      image.onerror = function () {
        callback('not-installed');
      };
    }
};

// 进来先监听;
window.addEventListener('message', function (event) {
  // 接受来自parent和content-script的指令;
	if (!event.data || !(typeof event.data == 'string' || event.data.sourceId || event.data.captureSourceId || event.data.getChromeExtensionStatus)) return;

  // 如果接收到了请求插件信息的信号;
	if(event.data.getChromeExtensionStatus) {
		DetectRTC.screen.getChromeExtensionStatus(function (status) { // 拿到插件信息;
      // 向消息体发送消息;
			window.parent.postMessage({
        chromeExtensionStatus: status // 发送消息;
      }, '*');
		});
		return;
	}

  if (event.data.captureSourceId) captureSourceId();

  // 把其他消息进行处理, 这里面是处理content-script的消息;
  DetectRTC.screen.onMessageCallback(event.data);
});

function captureSourceId() {
	// 检查是否安装了插件，并且拿到sourceId;
  DetectRTC.screen.getChromeExtensionStatus(function (status) {
    // 如果非可用状态，先不发sourceId;
    if (status != 'installed-enabled') {
      window.parent.postMessage({
          chromeExtensionStatus: status // 此时的状态; not-installed; installed-enabled; installed-disabled;
      }, '*');
      return;
    }
    DetectRTC.screen.getSourceId(function (sourceId) {
      // 发送chromeMediaSourceId;
      window.parent.postMessage({
          chromeMediaSourceId: sourceId
      }, '*');
    });
  });
}
