import './src/style/index.scss';
import './src/lib/getScreenId';
import './src/lib/screen';
// 可用的constraints;
console.log(navigator.mediaDevices.getSupportedConstraints());

var videosContainer = document.getElementById("videos-container") || document.body;
var roomsList = document.getElementById('rooms-list');
var screensharing = new Screen();
var channel = location.href.replace(/\/|:|#|%|\.|\[|\]/g, '');
var sender = Math.round(Math.random() * 999999999) + 999999999;
// 信令服务器;
var SIGNALING_SERVER = 'https://webrtcweb.com:9559/';
io.connect(SIGNALING_SERVER).emit('new-channel', {
  channel: channel,
  sender: sender
});
var socket = io.connect(SIGNALING_SERVER + channel);
socket.on('connect', function () {
  // setup peer connection & pass socket object over the constructor!
});
socket.send = function (message) {
  socket.emit('message', {
      sender: sender,
      data: message
  });
};
screensharing.openSignalingChannel = function(callback) {
  return socket.on('message', callback);
};
screensharing.onscreen = function(_screen) {
  var alreadyExist = document.getElementById(_screen.userid);
  if (alreadyExist) return;
  if (typeof roomsList === 'undefined') roomsList = document.body;
  var tr = document.createElement('tr');
  tr.id = _screen.userid;
  tr.innerHTML = '<td>' + _screen.userid + ' shared his screen.</td>' +
          '<td><button class="join">Preview His Screen</button></td>';
  roomsList.insertBefore(tr, roomsList.firstChild);
  var button = tr.querySelector('.join');
  button.setAttribute('data-userid', _screen.userid);
  button.setAttribute('data-roomid', _screen.roomid);
  button.onclick = function() {
      var button = this;
      button.disabled = true;
      var _screen = {
          userid: button.getAttribute('data-userid'),
          roomid: button.getAttribute('data-roomid')
      };
      screensharing.view(_screen);
  };
};
// on getting each new screen
screensharing.onaddstream = function(media) {

  media.video.id = media.userid;
  var video = media.video;
  video.setAttribute('controls', true);
  videosContainer.insertBefore(video, videosContainer.firstChild);
  video.play();
  rotateVideo(video);
};
// using firebase for signaling
// screen.firebase = 'signaling';
// if someone leaves; just remove his screen
screensharing.onuserleft = function(userid) {
  var video = document.getElementById(userid);
  if (video && video.parentNode) video.parentNode.removeChild(video);
};
// check pre-shared screens
screensharing.check();
document.getElementById('share-screen').onclick = function() {
  screensharing.share();
  this.disabled = true;
};
document.getElementById('share-screen').onclick = function() {
  var username = document.getElementById('user-name');
  username.disabled = this.disabled = true;
  screensharing.isModerator = true;
  screensharing.userid = username.value;
  screensharing.share();
};
function rotateVideo(video) {
  video.style[navigator.mozGetUserMedia ? 'transform' : '-webkit-transform'] = 'rotate(0deg)';
  // setTimeout(function() {
  //     video.style[navigator.mozGetUserMedia ? 'transform' : '-webkit-transform'] = 'rotate(360deg)';
  // }, 1000);
}
// 判断是否是该页面;
// (function() {
//   var uniqueToken = document.getElementById('unique-token');
//   if (uniqueToken)
//       if (location.hash.length > 2) uniqueToken.parentNode.parentNode.parentNode.innerHTML = '<h2 style="text-align:center;"><a href="' + location.href + '" target="_blank">Share this link</a></h2>';
//       else uniqueToken.innerHTML = uniqueToken.parentNode.parentNode.href = '#' + (Math.random() * new Date().getTime()).toString(36).toUpperCase().replace( /\./g , '-');
// })();
screensharing.onNumberOfParticipantsChnaged = function(numberOfParticipants) {
  if(!screensharing.isModerator) return;
  document.title = numberOfParticipants + ' users are viewing your screen!';
  var element = document.getElementById('number-of-participants');
  if (element) {
      element.innerHTML = numberOfParticipants + ' users are viewing your screen!';
  }
};

// todo: need to check exact chrome browser because opera also uses chromium framework
var isChrome = !!navigator.webkitGetUserMedia;
// DetectRTC.js - https://github.com/muaz-khan/WebRTC-Experiment/tree/master/DetectRTC
// Below code is taken from RTCMultiConnection-v1.8.js (http://www.rtcmulticonnection.org/changes-log/#v1.8)
var DetectRTC = {};
(function () {
  var screenCallback;
  DetectRTC.screen = {
      chromeMediaSource: 'screen',
      getSourceId: function(callback) {
        if(!callback) throw '"callback" parameter is mandatory.';
        screenCallback = callback;
        window.postMessage('get-sourceId', '*');
      },
      isChromeExtensionAvailable: function(callback) {
        if(!callback) return;
        if(DetectRTC.screen.chromeMediaSource == 'desktop') return callback(true);
        // ask extension if it is available
        window.postMessage('are-you-there', '*');
        setTimeout(function() {
          if(DetectRTC.screen.chromeMediaSource == 'screen') {
              callback(false);
          }
          else callback(true);
        }, 2000);
      },
      onMessageCallback: function(data) {
        if (!(typeof data == 'string' || !!data.sourceId)) return;
        console.log('chrome message', data);
        // "cancel" button is clicked
        if(data == 'PermissionDeniedError') {
          DetectRTC.screen.chromeMediaSource = 'PermissionDeniedError';
          if(screenCallback) return screenCallback('PermissionDeniedError');
          else throw new Error('PermissionDeniedError');
        }
        // extension notified his presence
        if(data == 'rtcmulticonnection-extension-loaded') {
          if(document.getElementById('install-button')) {
            document.getElementById('install-button').parentNode.innerHTML = '<strong>Great!</strong> <a href="https://chrome.google.com/webstore/detail/screen-capturing/ajhifddimkapgcifgcodmmfdlknahffk" target="_blank">Google chrome extension</a> is installed.';
          }
          DetectRTC.screen.chromeMediaSource = 'desktop';
        }
        // extension shared temp sourceId
        if(data.sourceId) {
          DetectRTC.screen.sourceId = data.sourceId;
          if(screenCallback) screenCallback( DetectRTC.screen.sourceId );
        }
      },
      getChromeExtensionStatus: function (callback) {
        if (!!navigator.mozGetUserMedia) return callback('not-chrome');
        var extensionid = 'ajhifddimkapgcifgcodmmfdlknahffk';
        var image = document.createElement('img');
        // 检查是否存在;
        image.src = 'chrome-extension://' + extensionid + '/icon.png';
        image.onload = function () {
          DetectRTC.screen.chromeMediaSource = 'screen';
          window.postMessage('are-you-there', '*');
          setTimeout(function () {
              if (!DetectRTC.screen.notInstalled) {
                  callback('installed-enabled');
              }
          }, 2000);
        };
        image.onerror = function () {
          DetectRTC.screen.notInstalled = true;
          callback('not-installed');
        };
      }
  };
  // check if desktop-capture extension installed.
  if(window.postMessage && isChrome) {
    DetectRTC.screen.isChromeExtensionAvailable();
  }
})();
DetectRTC.screen.getChromeExtensionStatus(function(status) {
  if(status == 'installed-enabled') {
    if(document.getElementById('install-button')) {
      document.getElementById('install-button').parentNode.innerHTML = '<strong>Great!</strong> <a href="https://chrome.google.com/webstore/detail/screen-capturing/ajhifddimkapgcifgcodmmfdlknahffk" target="_blank">Google chrome extension</a> is installed.';
    }
    DetectRTC.screen.chromeMediaSource = 'desktop';
  }
});
window.addEventListener('message', function (event) {
  if (event.origin != window.location.origin) {
    return;
  }
  DetectRTC.screen.onMessageCallback(event.data);
});
console.log('current chromeMediaSource', DetectRTC.screen.chromeMediaSource);
