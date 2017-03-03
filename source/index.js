var IpcServer = require("./ipc-server.js");
var WsServer = require("./ws-server.js");
var HttpServer = require("./http-server.js");

function createStubServer(transportType, transportAddress) {
  switch (transportType) {
    case 'IPC':
      return new IpcServer(transportAddress);
    case 'WS':
      return new WsServer(transportAddress);
    case 'HTTP':
      return new HttpServer(transportAddress);
    default:
      assert.false(true, "Unknown transport type: " + transportType);
  }
}

module.exports.createStubServer = createStubServer;
module.exports.IpcServer = IpcServer;
module.exports.WsServer = WsServer;
module.exports.HttpServer = HttpServer;
