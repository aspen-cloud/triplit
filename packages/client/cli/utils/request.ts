import dns from 'node:dns';
import http from 'node:http';
import fetch, { RequestInit } from 'node-fetch';

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
  console.log(path, options);
  return fetch(path, { agent, ...options });
}
