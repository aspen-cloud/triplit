// Platform / runtime specific operations go here so they can be used in other parts of our shared code

import { PlatformSetupError } from './errors.js';

// When initializing a server, set this up first
export interface ServerPlatform {
  jwt: {
    verify(token: string, secret: string): Promise<any>;
    decode(token: string): any;
  };
}

// Went down the road of using classes and injecting a server implementation, but this is much simpler
// We shouldnt ever have more than one platform running at a time, so this should be fine
let serverPlatform: ServerPlatform | undefined;

export function getPlatform() {
  if (!serverPlatform) {
    throw new PlatformSetupError();
  }
  return serverPlatform;
}

export function maybeGetPlatform() {
  return serverPlatform;
}

export function setPlatform(platform: ServerPlatform) {
  if (serverPlatform) {
    console.warn('Platform already set');
  }
  serverPlatform = platform;
}
