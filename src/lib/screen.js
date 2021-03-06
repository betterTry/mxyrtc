(function() {

  // via: https://bugs.chromium.org/p/chromium/issues/detail?id=487935#c17
  // you can capture screen on Android Chrome >= 55 with flag: "Experimental ScreenCapture android"
  window.IsAndroidChrome = false;
  try {
      if (navigator.userAgent.toLowerCase().indexOf("android") > -1 && /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)) {
          window.IsAndroidChrome = true;
      }
  } catch (e) {}

  // a middle-agent between public API and the Signaler object
  window.Screen = function(channel) {
    var signaler, self = this;
    // 房间号;
    this.channel = channel || location.href.replace(/\/|:|#|%|\.|\[|\]/g, '');

    // get alerted for each new meeting
    this.onscreen = function(screen) {
      if (self.detectedRoom) return;
      self.detectedRoom = true;

      self.view(screen);
    };

    function initSignaler(roomid) {
      signaler = new Signaler(self, (roomid && roomid.length) || self.channel);
    }

    function captureUserMedia(callback, extensionAvailable) {
      // 拿screenId;
      getScreenId(function(error, sourceId, screen_constraints) {
        // 安卓;
        if (IsAndroidChrome) {
          screen_constraints = {
            mandatory: {
                chromeMediaSource: 'screen'
            },
            optional: []
          };
          screen_constraints = {
            video: screen_constraints
          };
          error = null;
        }

        console.log('拿到了constraints');
        console.log('screen_constraints', JSON.stringify(screen_constraints, null, '\t'));
        navigator.getUserMedia(screen_constraints, function(stream) {
          stream.onended = function() {
              if (self.onuserleft) self.onuserleft('self');
          };
          // 开启视频;

          self.stream = stream;
          var video = document.createElement('video');
          video.id = 'self';
          video[isFirefox ? 'mozSrcObject' : 'srcObject'] = stream;
          video.autoplay = true;
          video.controls = true;
          // 视频开启;
          console.log('开启视频');
          video.play();

          // 将此传递给socket管道;
          console.log('传输stream');
          self.onaddstream({
            video: video,
            stream: stream,
            userid: 'self',
            type: 'local'
          });
          callback(stream); // 将流导出;
        }, function(error) {
          // https;
          if (isChrome && location.protocol === 'http:') {
            alert('You\'re not testing it on SSL origin (HTTPS domain) otherwise you didn\'t enable --allow-http-screen-capture command-line flag on canary.');
          } else if (isChrome) {
          // 无权限或者跨域;
            alert('Screen capturing is either denied or not supported. Please install chrome extension for screen capturing or run chrome with command-line flag: --enable-usermedia-screen-capturing');
          } else if (isFirefox) {
            alert(Firefox_Screen_Capturing_Warning);
          }
          console.log('发生了错误');
          console.error(error);
        });
      });
    }

    var Firefox_Screen_Capturing_Warning = 'Make sure that you are using Firefox Nightly and you enabled: media.getusermedia.screensharing.enabled flag from about:config page. You also need to add your domain in "media.getusermedia.screensharing.allowed_domains" flag.';

    // share new screen
    this.share = function(roomid) {
      console.log('触发分享');
      captureUserMedia(function() {
        // 连接Signaler;
        console.log('连接Signaler');
        !signaler && initSignaler(roomid);
        signaler.broadcast({
            roomid: (roomid && roomid.length) || self.channel,
            userid: self.userid
        });
      });
    };

    // view pre-shared screens
    this.view = function(room) {
      // 加入房间看;
      !signaler && initSignaler();
      signaler.join({
        to: room.userid,
        roomid: room.roomid
      });
    };

    // check pre-shared screens
    this.check = initSignaler;
  };

  /**
   * 代表服中转服务器对象;
   * @param {root screen对象}
   * @param {roomid 房间号}
   */
  function Signaler(root, roomid) {
      var socket;
      var userid = root.userid || getToken();
      root.userid && (root.userid = userid);
      var signaler = this;
      var peers = {};
      var candidates = {};
      var numberOfParticipants = 0;

      // 当SignalerChannel 转发过来消息时;
      this.onmessage = function(message) {
        console.log('开始监听消息');
        // 收到消息时;
        // 新房间开通;
        if (message.roomid == roomid && message.broadcasting && !signaler.sentParticipationRequest)
          root.onscreen(message);
        else {
          // for pretty logging
          console.debug(JSON.stringify(message, function(key, value) {
            if (value.sdp) {
              console.log(value.sdp.type, '————', value.sdp.sdp);
              return '';
            } else return value;
          }, '————'));
        }
        // if someone shared SDP
        if (message.sdp && message.to == userid)
          this.onsdp(message);

        // if someone shared ICE
        if (message.candidate && message.to == userid)
          this.onice(message);

        // if someone sent participation request
        if (message.participationRequest && message.to == userid) {
          var _options = options;
          _options.to = message.userid;
          _options.stream = root.stream;
          peers[message.userid] = Offer.createOffer(_options);

          numberOfParticipants++;

          if (root.onNumberOfParticipantsChnaged) root.onNumberOfParticipantsChnaged(numberOfParticipants);
        }
      };

      // 有人发送了sdp;
      this.onsdp = function(message) {
        console.log('收到了sdp');
        var sdp = JSON.parse(message.sdp);

        if (sdp.type == 'offer') {
          var _options = options;
          _options.stream = root.stream;
          _options.sdp = sdp;
          _options.to = message.userid;
          // 存下用户的answer, 并发送answer;
          peers[message.userid] = Answer.createAnswer(_options);
        }

        if (sdp.type == 'answer') {
          // 收到了answer;
          peers[message.userid].setRemoteDescription(sdp);
        }
      };

      // if someone shared ICE
      this.onice = function(message) {
        console.log('收到了ice');
        message.candidate = JSON.parse(message.candidate);
        console.log(message.candidate);

        var peer = peers[message.userid];
        if (!peer) {
          var candidate = candidates[message.userid];
          if (candidate) candidates[message.userid][candidate.length] = message.candidate;
          else candidates[message.userid] = [message.candidate];
        } else {
          // addIceCandidate;
          peer.addIceCandidate(message.candidate);

          var _candidates = candidates[message.userid] || [];
          if (_candidates.length) {
            for (var i = 0; i < _candidates.length; i++) {
              peer.addIceCandidate(_candidates[i]); // 把之前存放的candidates都消费掉;
            }
            candidates[message.userid] = [];
          }
        }
      };

      var options = {
        onsdp: function(sdp, to) {
          console.log('local-sdp', JSON.stringify(sdp.sdp, null, '\t'));
          signaler.signal({
            sdp: JSON.stringify(sdp),
            to: to
          });
        },
        // 发送candidate;
        onicecandidate: function(candidate, to) {
          signaler.signal({
            candidate: JSON.stringify(candidate),
            to: to
          });
        },
        onaddstream: function(stream, _userid) {
          console.debug('onaddstream', '>>>>>>', stream);
          stream.onended = function() {
            if (root.onuserleft) root.onuserleft(_userid);
          };

          var video = document.createElement('video');
          video.id = _userid;
          video[isFirefox ? 'mozSrcObject' : 'src'] = isFirefox ? stream : window.webkitURL.createObjectURL(stream);
          video.autoplay = true;
          video.controls = true;
          video.play();

          function onRemoteStreamStartsFlowing() {
            if (isMobileDevice) {
                return afterRemoteStreamStartedFlowing();
            }

            if (!(video.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA || video.paused || video.currentTime <= 0)) {
                afterRemoteStreamStartedFlowing();
            } else
            setTimeout(onRemoteStreamStartsFlowing, 300);
          }

          function afterRemoteStreamStartedFlowing() {
            if (!root.onaddstream) return;
            root.onaddstream({
              video: video,
              stream: stream,
              userid: _userid,
              type: 'remote'
            });
          }

          onRemoteStreamStartsFlowing();
        }
      };

      // call only for session initiator
      this.broadcast = function(_config) {
          signaler.roomid = _config.roomid || getToken();

          if (_config.userid) {
              userid = _config.userid;
          }

          signaler.isbroadcaster = true;
          (function transmit() {
              signaler.signal({
                  roomid: signaler.roomid,
                  broadcasting: true
              });

              if (!signaler.stopBroadcasting && !root.transmitOnce)
                  setTimeout(transmit, 3000);
          })();

          // if broadcaster leaves; clear all JSON files from Firebase servers
          if (socket.onDisconnect) socket.onDisconnect().remove();
      };

      // called for each new participant
      this.join = function(_config) {
        signaler.roomid = _config.roomid;
        this.signal({
          participationRequest: true,
          to: _config.to
        });
        signaler.sentParticipationRequest = true;
      };

      window.addEventListener('beforeunload', function() {
        // 走之前先离开房间;
        leaveRoom();
      }, false);

      window.addEventListener('keyup', function(e) {
        if (e.keyCode == 116) { // 刷新页面时;
          leaveRoom();
        }
      }, false);

      function leaveRoom() {
        console.log('离开房间');
        signaler.signal({
          leaving: true
        });
        // stop broadcasting room
        if (signaler.isbroadcaster) signaler.stopBroadcasting = true;
        // leave user media resources
        if (root.stream) root.stream.stop();
        // if firebase; remove data from their servers
        if (window.Firebase) socket.remove();
      }

      root.leave = leaveRoom;

      // signaling implementation
      // if no custom signaling channel is provided; use Firebase
      if (!root.openSignalingChannel) {
          if (!window.Firebase) throw 'You must link <https://cdn.firebase.com/v0/firebase.js> file.';

          // Firebase is capable to store data in JSON format
          // root.transmitOnce = true;
          socket = new window.Firebase('https://' + (root.firebase || 'signaling') + '.firebaseIO.com/' + root.channel);
          socket.on('child_added', function(snap) {
              var data = snap.val();

              var isRemoteMessage = false;
              if (typeof userid === 'number' && parseInt(data.userid) != userid) {
                  isRemoteMessage = true;
              }
              if (typeof userid === 'string' && data.userid + '' != userid) {
                  isRemoteMessage = true;
              }

              if (isRemoteMessage) {
                  if (data.to) {
                      if (typeof userid == 'number') data.to = parseInt(data.to);
                      if (typeof userid == 'string') data.to = data.to + '';
                  }

                  if (!data.leaving) signaler.onmessage(data);
                  else {
                      numberOfParticipants--;
                      if (root.onNumberOfParticipantsChnaged) {
                          root.onNumberOfParticipantsChnaged(numberOfParticipants);
                      }

                      root.onuserleft(data.userid);
                  }
              }

              // we want socket.io behavior;
              // that's why data is removed from firebase servers
              // as soon as it is received
              // data.userid != userid &&
              if (isRemoteMessage) snap.ref().remove();
          });

          // method to signal the data
          this.signal = function(data) {
              data.userid = userid;
              socket.push(data);
          };
      } else {
        console.log('openSignalingChannel');
          // custom signaling implementations
          // e.g. WebSocket, Socket.io, SignalR, WebSycn, XMLHttpRequest, Long-Polling etc.
          socket = root.openSignalingChannel(function(message) {
            // 处理 websocket的消息;
            message = JSON.parse(message);

            var isRemoteMessage = false;
            if (typeof userid === 'number' && parseInt(message.userid) != userid) {
              isRemoteMessage = true;
            }
            if (typeof userid === 'string' && message.userid + '' != userid) {
              isRemoteMessage = true;
            }

            if (isRemoteMessage) {
              if (message.to) {
                if (typeof userid == 'number') message.to = parseInt(message.to);
                if (typeof userid == 'string') message.to = message.to + '';
              }
              // 如果不是走了, 把消息给到signaler;
              if (!message.leaving) signaler.onmessage(message);
              else {
                root.onuserleft(message.userid);
                numberOfParticipants--;
                if (root.onNumberOfParticipantsChnaged) root.onNumberOfParticipantsChnaged(numberOfParticipants);
              }
            }
          });

          // 通过message发送消息;
          this.signal = function(data) {
            data.userid = userid;
            socket.send(JSON.stringify(data));
          };
      }
  }

  // 先拿到peerconnection;
  var RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
  var RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
  var RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;

  navigator.getUserMedia = navigator.mozGetUserMedia || navigator.webkitGetUserMedia;

  var isFirefox = !!navigator.mozGetUserMedia;
  var isChrome = !!navigator.webkitGetUserMedia;
  var isMobileDevice = !!navigator.userAgent.match(/Android|iPhone|iPad|iPod|BlackBerry|IEMobile/i);

  var iceServers = [];

  iceServers.push({
      urls: 'stun:stun.l.google.com:19302'
  });

  iceServers.push({
      urls: 'turn:webrtcweb.com:80',
      credential: 'muazkh',
      username: 'muazkh'
  });

  iceServers.push({
      urls: 'turn:webrtcweb.com:443',
      credential: 'muazkh',
      username: 'muazkh'
  });

  iceServers.push({
      urls: 'turn:webrtcweb.com:3344',
      credential: 'muazkh',
      username: 'muazkh'
  });

  iceServers.push({
      urls: 'turn:webrtcweb.com:4433',
      credential: 'muazkh',
      username: 'muazkh'
  });

  iceServers.push({
      urls: 'turn:webrtcweb.com:4455',
      credential: 'muazkh',
      username: 'muazkh'
  });

  iceServers.push({
      urls: 'turn:webrtcweb.com:5544?transport=tcp',
      credential: 'muazkh',
      username: 'muazkh'
  });

  iceServers = {
      iceServers: iceServers
  };

  var optionalArgument = {
      optional: [{
          DtlsSrtpKeyAgreement: true
      }]
  };

  function getToken() {
      return Math.round(Math.random() * 9999999999) + 9999999999;
  }

  function onSdpSuccess() {}

  function onSdpError(e) {
      console.error('sdp error:', e);
  }

  // var offer = Offer.createOffer(config);
  // offer.setRemoteDescription(sdp);
  // offer.addIceCandidate(candidate);
  var offerConstraints = {
      optional: [],
      mandatory: {
          OfferToReceiveAudio: false,
          OfferToReceiveVideo: false
      }
  };

  var Offer = {
    createOffer: function(config) {
      console.log('创建offer');
      // 先创建peer;
      var peer = new RTCPeerConnection(iceServers, optionalArgument);
      console.log(peer.defaultIceServers);

      // addstream;
      peer.addStream(config.stream);
      peer.onicecandidate = function(event) { // 本地的icecandidate好了，可以发送了;
          if (event.candidate) config.onicecandidate(event.candidate, config.to);
      };
      // 创建offer;
      peer.createOffer(function(sdp) {
          sdp.sdp = setBandwidth(sdp.sdp);
          peer.setLocalDescription(sdp); // 创建本地sdp;
          config.onsdp(sdp, config.to);
      }, onSdpError, offerConstraints);

      this.peer = peer;

      return this;
    },
    // 收到对方的Answer后，将其设为远端连接;
    setRemoteDescription: function(sdp) {
      console.log('setting remote descriptions', sdp.sdp);
      this.peer.setRemoteDescription(new RTCSessionDescription(sdp), onSdpSuccess, onSdpError);
    },
    addIceCandidate: function(candidate) {
      console.log('adding ice', candidate.candidate);
      this.peer.addIceCandidate(new RTCIceCandidate({
        sdpMLineIndex: candidate.sdpMLineIndex,
        candidate: candidate.candidate
      }));
    }
  };

  // var answer = Answer.createAnswer(config);
  // answer.setRemoteDescription(sdp);
  // answer.addIceCandidate(candidate);
  var answerConstraints = {
      optional: [],
      mandatory: {
          OfferToReceiveAudio: false,
          OfferToReceiveVideo: true
      }
  };
  var Answer = {
    /**
     * @param {config}
     */
    createAnswer: function(config) {
      // 创建新的peer;
      var peer = new RTCPeerConnection(iceServers, optionalArgument);
      // onaddstream函数;
      peer.onaddstream = function(event) {
        config.onaddstream(event.stream, config.to);
      };
      // 当candidate available时会自动调用;
      peer.onicecandidate = function(event) {
        // 将信令发送;
        if (event.candidate) config.onicecandidate(event.candidate, config.to);
      };

      console.log('setting remote descriptions', config.sdp.sdp);
      // config.sdp是对方的offer;
      peer.setRemoteDescription(new RTCSessionDescription(config.sdp), onSdpSuccess, onSdpError);
      peer.createAnswer(function(sdp) {
        sdp.sdp = setBandwidth(sdp.sdp);
        peer.setLocalDescription(sdp);
        config.onsdp(sdp, config.to);
      }, onSdpError, answerConstraints);

      this.peer = peer;
      return this;
    },
    addIceCandidate: function(candidate) {
      console.log('adding ice', candidate.candidate);
      this.peer.addIceCandidate(new RTCIceCandidate({
        sdpMLineIndex: candidate.sdpMLineIndex,
        candidate: candidate.candidate
      }));
    }
  };

  function setBandwidth(sdp) {
      if (isFirefox) return sdp;
      if (isMobileDevice) return sdp;

      // https://github.com/muaz-khan/RTCMultiConnection/blob/master/dev/BandwidthHandler.js
      if (typeof BandwidthHandler !== 'undefined') {
          window.isMobileDevice = isMobileDevice;
          window.isFirefox = isFirefox;

          var bandwidth = {
              screen: 300, // 300kbits minimum
              video: 256 // 256kbits (both min-max)
          };
          var isScreenSharing = false;

          sdp = BandwidthHandler.setApplicationSpecificBandwidth(sdp, bandwidth, isScreenSharing);
          sdp = BandwidthHandler.setVideoBitrates(sdp, {
              min: bandwidth.video,
              max: bandwidth.video
          });
          return sdp;
      }

      // removing existing bandwidth lines
      sdp = sdp.replace(/b=AS([^\r\n]+\r\n)/g, '');

      // "300kbit/s" for screen sharing
      sdp = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:300\r\n');

      return sdp;
  }

  function loadScript(src, onload) {
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      document.documentElement.appendChild(script);
      console.log('loaded', src);
  }

  !window.getScreenId && loadScript('/getScreenId.js');
})()
