import { WebSocket as UWebSocket } from 'undici';
import { vi } from 'vitest';

// WARNING: Using `vi.unstubAllGlobals` will remove these stubs

/**
 * This websocket is a more compliant implementation of the WebSocket API and will be the default as of Node 24
 * Example of such issues pre undici@7: https://github.com/nodejs/undici/issues/3546
 */
vi.stubGlobal('WebSocket', UWebSocket);
