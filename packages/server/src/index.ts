import './config.js';

import { setPlatform } from '@triplit/server-core/platform';
import jwt from 'jsonwebtoken';

setPlatform({
  jwt: {
    decode: jwt.decode,
    verify: (token: string, secret: string) =>
      new Promise((res, rej) => {
        try {
          res(jwt.verify(token, secret));
        } catch (e) {
          rej(e);
        }
      }),
  },
});

export { createServer } from './server.js';
