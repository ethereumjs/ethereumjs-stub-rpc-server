var AbstractServer = require("./abstract-server.js");

var net = require("net");
var oboe = require("oboe");

function IpcServer(ipcPath) {
  AbstractServer.call(this);

  this.outstandingSockets = {};
  this.underlyingServer = net.createServer(function (socket) {
    var key = this.nextKey++;
    var outboundChannel = function (json) {
      socket.write(json);
    }.bind(this);
    this.activeOutboundChannels[key] = outboundChannel;
    this.outstandingSockets[key] = socket;

    // FIXME: UTF surrogates that cross buffer boundaries will break oboe (https://github.com/jimhigson/oboe.js/issues/133)
    oboe(socket).done(function (jso) {
      this.__inboundMessageHandler(JSON.stringify(jso), outboundChannel);
    }.bind(this));
    socket.on('data', function (data) {
      // handled by oboe
    }.bind(this));

    socket.on('error', function (error) {
      // necessary for some reason, if there is an error on the socket and no error handler then the socket will not be destroyable
    });

    socket.on('close', function () {
      delete this.activeOutboundChannels[key];
      delete this.outstandingSockets[key];
    }.bind(this));
  }.bind(this));
  this.underlyingServer.listen(ipcPath);

  this.addResponder(ethSubscribeResponder.bind(this));
}

IpcServer.prototype = Object.create(AbstractServer.prototype);
IpcServer.prototype.constructor = IpcServer;

IpcServer.prototype.makeRequest = function (jso) {
  for (var key in this.outstandingSockets) {
    this.outstandingSockets[key].write(JSON.stringify(jso));
  }
}

IpcServer.prototype.destroy = function (callback) {
  this.underlyingServer.close(() => callback());
  for (var key in this.outstandingSockets) {
    this.outstandingSockets[key].destroy();
  }
}

module.exports = IpcServer;

/**
 * This responder responds to `eth_subscribe` method calls with a null subscription ID
 */
function ethSubscribeResponder(request) {
  if (request.method !== "eth_subscribe") return undefined;
  return "0x00000000000000000000000000000000";
}
