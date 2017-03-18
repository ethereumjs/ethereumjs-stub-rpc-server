var AbstractServer = require("./abstract-server.js");

var http = require("http");

function HttpServer(address) {
  AbstractServer.call(this);

  this.outstandingSockets = {};

  var portString = /^(.*):\/\/([A-Za-z0-9\-\.]+):([0-9]+)?(.*)$/.exec(address)[3];
  var portNumber = Number(portString);
  this.underlyingServer = http.createServer(function (request, response) {
    var body = [];
    request.on('error', function (error) {
      assert.isFalse(true, (error || {}).message || error);
    }.bind(this));
    response.on('error', function (error) {
      assert.isFalse(true, (error || {}).message || error);
    }.bind(this));
    request.on('data', function (chunk) {
      body.push(chunk);
    }.bind(this));
    request.on('end', function () {
      var requestJson = Buffer.concat(body).toString();
      this.__inboundMessageHandler(requestJson, function (responseJson) {
        response.statusCode = 200;
        response.end(responseJson);
      }.bind(this));
    }.bind(this))
  }.bind(this));
  this.underlyingServer.on('connection', function (socket) {
    var key = this.nextKey++;
    this.outstandingSockets[key] = socket;
    socket.on('close', function () {
      delete this.outstandingSockets[key];
    }.bind(this));
  }.bind(this));
  this.underlyingServer.listen({ port: portNumber });
}

HttpServer.prototype = Object.create(AbstractServer.prototype);
HttpServer.prototype.constructor = HttpServer;

HttpServer.prototype.makeRequest = function (jso) { }

HttpServer.prototype.destroy = function (callback) {
  if (!this.underlyingServer.listening) return callback();
  this.underlyingServer.close(callback);
  for (var key in this.outstandingSockets) {
    this.outstandingSockets[key].destroy();
  }
}

module.exports = HttpServer;
