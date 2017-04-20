var AbstractServer = require("./abstract-server.js");

var WebSocket = require("ws");

function WsServer(address) {
  AbstractServer.call(this);

  var portString = /^(.*):\/\/([A-Za-z0-9\-\.]+):([0-9]+)?(.*)$/.exec(address)[3];
  var portNumber = Number(portString);
  this.outstandingSockets = {};
  this.underlyingServer = new WebSocket.Server({ port: portNumber });
  this.underlyingServer.on('connection', function (webSocket) {
    var key = this.nextKey++;
    var outboundChannel = function (json) {
      // don't bother attempting to write to the socket unless its readyState is 1. this avoids a race condition where the socket is in the process of closing when some messages are received. we can't actually write to the socket in this state so we just drop the messages
      if (webSocket.readyState !== 1) return;
      webSocket.send(json);
    }.bind(this);
    this.activeOutboundChannels[key] = outboundChannel;
    this.outstandingSockets[key] = webSocket;

    webSocket.on('message', function (data) {
      this.__inboundMessageHandler(data, outboundChannel);
    }.bind(this));

    webSocket.on('close', function () {
      delete this.activeOutboundChannels[key];
      delete this.outstandingSockets[key];
    }.bind(this));
  }.bind(this));

  this.addResponder(ethSubscribeResponder.bind(this));
}

WsServer.prototype = Object.create(AbstractServer.prototype);
WsServer.prototype.constructor = WsServer;

WsServer.prototype.makeRequest = function (jso) {
  for (var key in this.outstandingSockets) {
    this.outstandingSockets[key].send(JSON.stringify(jso));
  }
}

WsServer.prototype.destroy = function (callback) {
  this.underlyingServer.close(callback);
}

module.exports = WsServer;

/**
 * This responder responds to `eth_subscribe` method calls with a null subscription ID
 */
function ethSubscribeResponder(request) {
  if (request.method !== "eth_subscribe") return undefined;
  return "0x00000000000000000000000000000000";
}
