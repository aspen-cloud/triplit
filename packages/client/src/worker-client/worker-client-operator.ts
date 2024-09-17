import * as ComLink from 'comlink';
import { ClientComlinkWrapper } from './client-comlink-wrapper.js';

const internalClient = new ClientComlinkWrapper();

// @ts-expect-error
self.addEventListener('connect', (evt: MessageEvent) => {
  const port = evt.ports[0];
  ComLink.expose(internalClient, port);
});

ComLink.expose(internalClient, self as ComLink.Endpoint);
