import dns from 'node:dns';
import http from 'node:http';
import fetch, { RequestInit } from 'node-fetch';

/**
 * This is a custom agent that will resolve custom subdomains on localhost
 * e.g. http://myprojectid.localhost:8787
 *
 * Caveat: It doesn't currently support HTTPS I think it would need
 * to use a separate node:https agent which isn't currently needed
 */
const agent = new http.Agent({
  lookup: (hostname, options, callback) => {
    if (hostname.includes('localhost')) {
      const address = '127.0.0.1';
      const family = 4;
      // @ts-ignore I think node is typed incorrectly here
      return callback(null, address, family);
    }
    return dns.lookup(hostname, options, callback);
  },
});

export async function request(path: string, options?: RequestInit) {
  if (path.startsWith('http://')) {
    return fetch(path, { agent, ...options });
  }
  return fetch(path, { ...options });
}
