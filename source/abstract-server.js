"use strict";

function AbstractServer() {
  this.nextKey = 1;
  this.activeOutboundChannels = {};
  this.expectations = [];
  this.responders = [];
  this.transactions = {};
  this.blocks = [];
  this.blocks.push({
    number: "0x0",
    hash: "0xb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10c0000",
    parentHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    nonce: "0xe04d296d2460cfb8472af2c5fd05b5a214109c25688d3704aed5484f9a7792f2",
    sha3Uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
    logsBloom: "0xe670ec64341771606e55d6b4ca35a1a6b75ee3d5145a99d05921026d1527331",
    transactionsRoot: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
    stateRoot: "0xd5855eb08b3387c0af375e9cdb6acfc05eb8f519e419b874b6ff2ffda7ed1dff",
    miner: "0x4e65fda2159562a496f9f3522f89122a3088497a",
    difficulty: "0x027f07", // 163591
    totalDifficulty: "0x027f07", // 163591
    extraData: "0x0000000000000000000000000000000000000000000000000000000000000000",
    size: "0x027f07", // 163591
    gasLimit: "0x9f759", // 653145
    gasUsed: "0x9f759", // 653145
    timestamp: "0x54e34e8e", // 1424182926
    sealFields: [],
    transactions: [],
    uncles: [],
  });

  this.clearResponders();
  this.addResponder(ethGetLogsResponder.bind(this));
  this.addResponder(ethBlockNumberResponder.bind(this));
  this.addResponder(ethCallResponder.bind(this));
  this.addResponder(ethGetBlockByHashResponder.bind(this));
  this.addResponder(ethGetBlockByNumberResponder.bind(this));
  this.addResponder(ethGetTransactionByHashResponder.bind(this));
  this.addResponder(ethSendTransactionResponder.bind(this));
  this.addResponder(netVersionResponder.bind(this));
}

AbstractServer.prototype.addExpectation = function (requestMatcher) {
  this.expectations.push({ requestMatcher: requestMatcher });
}

AbstractServer.prototype.addExpectations = function (count, requestMatcher) {
  var seen = 0;
  this.expectations.push({ requestMatcher: function (jso) {
    if (!requestMatcher(jso)) return false;
    if (++seen !== count) this.addExpectations(count - seen, requestMatcher);
    return true;
  }.bind(this) });
}

AbstractServer.prototype.addResponder = function (responseGenerator) {
  this.responders.unshift({ responseGenerator: responseGenerator });
}

AbstractServer.prototype.clearResponders = function () {
  this.responders = [];
  this.responders.unshift({ responseGenerator: noMethodFoundResponder });
}

AbstractServer.prototype.assertExpectations = function () {
  var unfulfilledExpectations = this.expectations.length;
  if (unfulfilledExpectations === 0) return;
  throw new Error(this.expectations.length + " expected requests were not seen.");
}

AbstractServer.prototype.mine = function () {
  var parentBlock = this.blocks[this.blocks.length - 1];
  var parentBlockNumber = parseInt(parentBlock.number);
  var newBlockNumber = parentBlockNumber + 1;
  var newBlockNumberString = "0x" + newBlockNumber.toString(16);
  var newBlockHash = "0xb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10c" + ("0000" + newBlockNumber.toString(16)).slice(-4)
  var newBlock = {
    number: newBlockNumberString,
    hash: newBlockHash,
    parentHash: parentBlock.hash,
    sealFields: [],
    transactions: [],
    uncles: []
  };
  var nextTransactionIndex = 1;
  for (var transactionHash in this.transactions) {
    var transaction = this.transactions[transactionHash];
    if (transaction.blockNumber !== null) continue;
    transaction.blockNumber = newBlockNumberString;
    transaction.blockHash = newBlockHash;
    transaction.transactionIndex = "0x" + (nextTransactionIndex++).toString(16);
    newBlock.transactions.push(transaction);
  }
  this.blocks.push(newBlock);
  var jso = { jsonrpc: "2.0", method: "eth_subscription", params: { subscription: "0x00000000000000000000000000000000", result: newBlock } };
  this.makeRequest(jso);
}

/**
 * Used internally.  Makes a request to the connected client.  This only works IPC/WS.
 */
AbstractServer.prototype.makeRequest = function (jso) {
  throw new Error("makeRequest should be implemented by derived server types.");
}

/**
 * Internal.  Processes a single inbound request and responds on `outboundChannel`.
 * 
 * @param {object} json - The JSON-RPC request.
 * @param {function(string):void} outboundChannel - The function to call when a response is ready.  Parameter is the response JSON to send.  Must be a valid JSON-RPC response.
 */
AbstractServer.prototype.__inboundMessageHandler = function (json, outboundChannel) {
  var request;
  try {
    request = JSON.parse(json);
  } catch (error) {
    var message = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Bad Request", data: error.message } };
    var messageJson = JSON.stringify(message);
    outboundChannel(messageJson);
    return;
  }

  // basic request validation
  if (request.jsonrpc === undefined) throw new Error("Stub server received a JSON-RPC request without a 'jsonrpc' property.");
  if (request.jsonrpc !== "2.0") throw new Error("Stub server received a JSON-RPC request whose jsonrpc property was not '2.0'.  Actual: " + request.jsonrpc);
  if (request.id === undefined) throw new Error("Stub server received a JSON-RPC request without an 'id' property.");
  if (typeof request.id !== "number") throw new Error("Stub server received a JSON-RPC request whose 'id' property was not a number.  Actual: " + request.id);
  if (request.method === undefined) throw new Error("Stub server received a JSON-RPC request without a 'method' property.");
  if (typeof request.method !== "string") throw new Error("Stub server received a JSON-RPC request whose 'method' property was not a string.  Actual: " + request.method);
  if (request.params !== undefined && !(request.params instanceof Array)) throw new Error("Stub server received a JSON-RPC request whose 'params' property was not an array.  Actual: " + request.params);
  
  // check if any expectations were met by this request
  this.expectations.forEach(function (expectation, index) {
    if (expectation.requestMatcher(request))
      this.expectations.splice(index, 1);
  }.bind(this));

  // respond with any stubbed responses
  for (var responder of this.responders) {
    var resultOrError = responder.responseGenerator(request);
    if (resultOrError === undefined) continue;
    var response = {
      jsonrpc: "2.0",
      id: request.id,
    };
    if (resultOrError instanceof Error) {
      response.error = {
        code: resultOrError.code || -1,
        message: resultOrError.message || "Unknown error occurred.  Error returned by the responseGenerator provided to stub-rpc-server did not contain a message.",
        data: resultOrError.data,
      };
    }
    else {
      response.result = resultOrError;
    }
    var responseJson = JSON.stringify(response);
    outboundChannel(responseJson);
    break;
  }
}

/**
 * This responder responds to all requests with an error.
 */
function noMethodFoundResponder(request) {
  var error = new Error("Method not found.");
  error.code = -32601;
  return error;
}

/**
 * This responder responds to `net_version` method calls with a default string
 */
function netVersionResponder(request) {
  if (request.method !== "net_version") return undefined;
  return "default stub rpc server version";
}

/**
 * This responder responds to `eth_getBlockByNumber` method calls with a reasonably shaped block
 */
function ethGetBlockByNumberResponder(request) {
  if (request.method !== "eth_getBlockByNumber") return undefined;
  if (!request.params || !request.params[0] || typeof request.params[0] !== "string") return new Error("eth_getBlockByNumber requires a block number (string) as the first parameter.");
  var blockNumber;
  if (request.params[0] === "latest") blockNumber = this.blocks.length - 1;
  else if (request.params[0] === "earliest") blockNumber = 0;
  else if (request.params[0] === "pending") throw new Error("'pending' not supported.");
  else blockNumber = parseInt(request.params[0], 16);
  var block = this.blocks[blockNumber];
  return (block === undefined) ? null : block;
}

/**
 * This responder responds to eth_getBlockByHash with a previously mined (AbstractServer.prototype.mine) block or null if no such block exists.
 * 
 * @param {object} request - JSON-RPC request
 */
function ethGetBlockByHashResponder(request) {
  if (request.method !== "eth_getBlockByHash") return undefined;
  if (!request.params || !request.params[0]) return new Error("eth_getBlockByHash requires a block hash as the first parameter");
  var blockHash = request.params[0];
  for (var i = 0; i < this.blocks.length; ++i) {
    var block = this.blocks[i];
    if (block.hash === blockHash) return block;
  }
  return null;
}

/**
 * Responds to eth_blockNumber requests with the number of the most recently mined block.
 * 
 * @param {object} request - JSON-RPC request
 */
function ethBlockNumberResponder(request) {
  if (request.method !== "eth_blockNumber") return undefined;
  return this.blocks[this.blocks.length - 1].number;
}

/**
 * Responds to eth_sendTransaction requests with the next available fake hash.  Remembers the transaction so the next call to `AbstractServer.mine` will include it in the mined block.
 * 
 * @param {object} request - JSON-RPC request
 */
function ethSendTransactionResponder(request) {
  if (request.method !== "eth_sendTransaction") return undefined;
  if (request.params === undefined) throw new Error("Stub server received a JSON-RPC 'eth_sendTransaction' request without a 'params' property.");
  if (request.params.length !== 1) throw new Error("Stub server received a JSON-RPC 'eth_sendTransaction' request with more or less than 1 parameter.  Actual: " + request.params.length);
  let from = request.params[0].from;
  if (from === undefined) throw new Error("Stub server received a JSON-RPC 'eth_sendTransaction' request without a 'from' property on the provided transaction.");
  if (typeof from !== "string") throw new Error("Stub server received a JSON-RPC 'eth_sendTransaction' request whose 'from' property on the provided transaction was not a string.  Actual: " + from);
  if (!/^0x[0-9a-zA-Z]{40}$/.test(from)) throw new Error("Stub server received a JSON-RPC 'eth_sendTransaction' request whose 'from' property on the provided transaction was not an address.");

  var transaction = request.params[0];
  var transactionHash = "0xbadf00dbadf00dbadf00dbadf00dbadf00dbadf00dbadf00dbadf00dbadf" + ("0000" + (Object.keys(this.transactions).length + 1).toString(16)).slice(-4);
  transaction.hash = transactionHash;
  transaction.blockNumber = null;
  transaction.blockHash = null;
  this.transactions[transactionHash] = transaction;
  return transactionHash;
}

/**
 * Responds to eth_getTransactionByHash with a previously sent transaction or null if no such transaction was found.  The transaction will include details of the block it was mined in if it has been mined.
 * 
 * @param {object} request - JSON-RPC request
 */
function ethGetTransactionByHashResponder(request) {
  if (request.method !== "eth_getTransactionByHash") return undefined;
  var transaction = this.transactions[request.params[0]];
  if (transaction == undefined) return null;
  return transaction;
}

/**
 * Responds to eth_callResponder with the null response.
 * 
 * @param {object} request - JSON-RPC request
 */
function ethCallResponder(request) {
  if (request.method === "eth_call") return "0x";
}

/**
 * This responder responds to `eth_getLogs` method calls with an empty array
 */
function ethGetLogsResponder(request) {
  if (request.method !== "eth_getLogs") return undefined;
  return [];
}

module.exports = AbstractServer;
