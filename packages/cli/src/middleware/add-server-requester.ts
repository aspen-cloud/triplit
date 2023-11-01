import prompts from 'prompts';
import axios from 'axios';
import * as JWT from 'jsonwebtoken';
import { Middleware } from '../middleware.js';
import * as Flag from '../flags.js';

export const serverRequesterMiddleware = Middleware({
  name: 'Server Requester',
  flags: {
    token: Flag.String({
      description: 'API Token (Service Key)',
      required: false,
      char: 't',
    }),
    remote: Flag.String({
      description: 'Remote URL to connect to',
      required: false,
      char: 'r',
    }),
  },
  run: async ({ flags, args }) => {
    let token = flags.token ?? process.env.TRIPLIT_SERVICE_TOKEN;
    if (!token) {
      // request token
      ({ token } = await prompts({
        message: 'API Token (Service Key)',
        name: 'token',
        type: 'password',
        validate: (tokenInput) => {
          const resp = JWT.decode(tokenInput);
          if (resp) return true;
          return 'Not a valid token';
        },
      }));
    }

    if (!token) return;

    const decodedToken = JWT.decode(token);
    // @ts-ignore
    const projectId = decodedToken?.['x-triplit-project-id'];
    const url =
      flags.remote ?? process.env.TRIPLIT_DB_URL ?? `http://localhost:6543`; // `https://${projectId}.triplit.io`;
    const requestServer = makeRequester({ url, token });
    // TODO: add prod flag
    return { requestServer, projectId, token, url };
  },
});

function makeRequester({ url, token }) {
  return async function request(
    method: 'GET' | 'POST',
    path: string,
    params?: any
  ) {
    const payload = method === 'GET' ? { params } : { data: params };

    try {
      const resp = await axios.request({
        method,
        url: `${url}${path}`,
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        ...payload,
      });

      // axios will throw on non-2xx status codes: https://axios-http.com/docs/handling_errors
      return resp.data;
    } catch (e) {
      if (e.response) {
        throw e.response.data;
      } else if (e.request) {
        throw `No response was received from server: ${url}. Please ensure you are connected to the internet and are pointing to the correct server.`;
      }
      throw `An error occured while requesting the remote database: ${e.message}`;
    }
  };
}
