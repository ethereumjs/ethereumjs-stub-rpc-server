"use strict";

/**
 * This is the base prototype for all other servers (IPC, WS, HTTP).  It contains most of the business logic and stubbing logic.
 */
function AbstractServer() {
  this.nextKey = 1;
  this.activeOutboundChannels = {};
  this.expectations = [];
  this.responders = [];
  this.transactions = {};
  this.blocks = [];
  this.blocks.push({
    number: "0x1",
    hash: "0xb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10cb10c0000",
    parentHash: null,
    sealFields: [],
    transactions: [],
    uncles: []
  });

  this.clearResponses();
  this.addResponder(ethBlockNumberResponder.bind(this));
  this.addResponder(ethCallResponder.bind(this));
  this.addResponder(ethGetBlockByHashResponder.bind(this));
  this.addResponder(ethGetBlockByNumberResponder.bind(this));
  this.addResponder(ethGetTransactionByHashResponder.bind(this));
  this.addResponder(ethSendTransactionResponder.bind(this));
  this.addResponder(ethSubscribeResponder.bind(this));
  this.addResponder(netVersionResponder.bind(this));
}

/**
 * Setup an expectation that can be asserted on later.
 * 
 * @param {function(object):boolean} requestMatcher - A function that takes in a JSON-RPC JSO and returns true if it matches the expectation, false otherwise.
 */
AbstractServer.prototype.addExpectation = function (requestMatcher) {
  this.expectations.push({ requestMatcher: requestMatcher });
}

/**
 * Setup an expectation that should be met multiple times.
 * 
 * @param {function(object):boolean} requestMatcher - A function that takes in a JSON-RPC JSO and returns true if it matches the expectation, false otherwise.
 */
AbstractServer.prototype.addExpectations = function (count, requestMatcher) {
  var seen = 0;
  this.expectations.push({ requestMatcher: function (jso) {
    if (!requestMatcher(jso)) return false;
    if (++seen !== count) this.addExpectations(count - seen, requestMatcher);
    return true;
  }.bind(this) });
}

/**
 * Adds a new stub response for incoming messages.  Responders are processed in reverse order they are added (most recently added responder is checked first).  If the responder does not apply to the incoming message, it should return `undefined` which will cause the stub server to try the next responder.  The first responder to return something other than `undefined` is used and the remaining responders will be skipped.
 * 
 * @param {function(object):any} responseGenerator - A function that takes in a JSON-RPC JSO and returns either an Error or an object/primitive that will be used as the result object.
 */
AbstractServer.prototype.addResponder = function (responseGenerator) {
  this.responders.unshift({ responseGenerator: responseGenerator });
}

/**
 * Clears all setup responders *except* the fallback error responder.  Note that this will clear all default responders as well as any custom responders.
 */
AbstractServer.prototype.clearResponses = function () {
  this.responders = [];
  this.responders.unshift({ responseGenerator: noMethodFoundResponder });
}

/**
 * Asserts that all expectations (added via `except(...)`) were met.
 */
AbstractServer.prototype.assertExpectations = function () {
  var unfulfilledExpectations = this.expectations.length;
  if (unfulfilledExpectations === 0) return;
  throw new Error(this.expectations.length + " expected requests were not seen.");
}

/**
 * Mine a block.  The block will contain any transactions that have been submitted but not yet mined.  The server will remember this block so it can be fetched later.
 */
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
  if (!request.params || !request.params[0]) return new Error("eth_getBlockByNumber requires a block number as the first parameter");
  var blockNumber = request.params[0];
  if (blockNumber === "latest") blockNumber = this.blocks.length - 1;
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
  for (var block in this.blocks) {
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
 * This responder responds to `eth_subscribe` method calls with a null subscription ID
 */
function ethSubscribeResponder(request) {
  if (request.method !== "eth_subscribe") return undefined;
  return "0x00000000000000000000000000000000";
}

module.exports = AbstractServer;
