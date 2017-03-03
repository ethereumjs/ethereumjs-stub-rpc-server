declare interface JsonRpcRequest {
  public jsonrpc: string;
  public id: number;
  public method: string;
  public params: any[];
}

/**
 * This is the base class for all servers types (IPC, WS, HTTP).  It contains most of the business logic and stubbing logic.
 */
declare class AbstractServer {
  protected constructor();

  /**
   * Setup an expectation that can be asserted on later.
   * 
   * @param requestMatcher - A function that takes in a JSON-RPC JSO and returns true if it matches the expectation, false otherwise.
   */
  addExpectation(requestMatcher: (request: JsonRpcRequest) => boolean): void;

  /**
   * Setup an expectation that should be met multiple times.
   * 
   * @param count - the number of times this expectation should be seen
   * @param requestMatcher - A function that takes in a JSON-RPC JSO and returns true if it matches the expectation, false otherwise.
   */
  addExpectations(count: number, responseGenerator: (request: JsonRpcRequest) => any): void;

  /**
   * Adds a new stub response for incoming messages.  Responders are processed in reverse order they are added (most recently added responder is checked first).  If the responder does not apply to the incoming message, it should return `undefined` which will cause the stub server to try the next responder.  The first responder to return something other than `undefined` is used and the remaining responders will be skipped.
   * 
   * @param {function(object):any} responseGenerator - A function that takes in a JSON-RPC JSO and returns either an Error or an object/primitive that will be used as the result object.
   */
  addResponder(responseGenerator: (request: JsonRpcRequest) => any): void;

  /**
   * Clears all setup responders *except* the fallback error responder.  Note that this will clear all default responders as well as any custom responders.
   */
  clearResponders(): void;

  /**
   * Asserts that all expectations (added via `except(...)`) were met.
   */
  assertExpectations(): void;

  /**
   * Mine a block.  The block will contain any transactions that have been submitted but not yet mined.  The server will remember this block so it can be fetched later.
   */
  mine(): void;
}

/**
 * Implementation of AbstractServer that uses HTTP as its transport.
 */
declare class HttpServer extends AbstractServer {
  constructor(address: string);
}

/**
 * Implementation of AbstractServer that uses Web Sockets for its transport.
 */
declare class WsServer extends AbstractServer {
  constructor(address: string);
}

/**
 * Implementation of AbstractServer that uses IPC as its transport.
 */
declare class IpcServer extends AbstractServer {
  constructor(address: string);
}

declare function createStubServer(transportType: string, transportAddress: string): AbstractServer;

export { createStubServer, HttpServer, WsServer, IpcServer };