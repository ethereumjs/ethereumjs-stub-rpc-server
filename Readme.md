# Purpose

[![Greenkeeper badge](https://badges.greenkeeper.io/ethereumjs/ethereumjs-stub-rpc-server.svg)](https://greenkeeper.io/)

Allow for easy stubbing of an Ethereum node when testing Ethereum dApp clients.  It allows you to stub out a response to any request with whatever result you like so it is easy to write tests for your dApps without having to run a full Ethereum node or do actual mining.  It is intended to be run inside your tests and a new server should be created/destroyed with each test case, though you could re-use across test cases if you are okay with using the same responses in each test.

This library is not intended to simulate the inner workings of a real Ethereum node, only allow you to define canned responses to requests made of an Ethereum node.  It supports requests over HTTP, WS or IPC.  It dose have some basic simulation build in (can be overriden or removed) for things like `eth_sendTransaction`, `eth_getBlock`, `net_version` (and others) and it has a `.mine()` function to allow you to simulate mining a block that includes pending transactions.  PRs welcome for additional baked-in behaviors, though the goal is to keep them relatively simply with a focus on validating request payloads and returning responses that are shaped correctly.

# Usage

```
describe("my ethereum integration test", () => {
	it("uses a stub server", () => {
		var server = require('ethereumjs-stub-rpc-server').createStubServer('HTTP', 'http://localhost:1337');
		server.addExpectation((requestJso) => requestJso.method === "net_version");
		server.addResponder((requestJso) => (requestJso.method === "net_version") ? "apple" : undefined);
		myPreferredEthereumJsLibrary.netVersion().then((version) => {
			assert.strictEqual(version, "apple");
			server.assertExpectations();
		});
	});
});
```

There are JSDocs for all of the methods that give details on their usage.  You can also see the tests for more full featured examples (in particular, see `adds sent transaction to block when mined` for an interesting one that does mining).