import * as ComLink from 'comlink';
import { WorkerInternalClient } from './worker-internal-client.js';

const internalClient = new WorkerInternalClient();

internalClient.client;

// @ts-expect-error
self.addEventListener('connect', (evt: MessageEvent) => {
  const port = evt.ports[0];
  ComLink.expose(internalClient, port);
});

ComLink.expose(internalClient, self as ComLink.Endpoint);
