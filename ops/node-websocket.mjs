// Upstream passes {headers:{cookie}} as WebSocket's second argument.
// Node's built-in WebSocket ignores this extension. Load ws at deployment time
// so authenticated DSH event streams work without patching bridge sources.
import WebSocket from '../dsh/runtime/node_modules/ws/wrapper.mjs';
globalThis.WebSocket = WebSocket;
