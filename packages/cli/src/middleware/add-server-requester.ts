import prompts from 'prompts';
import axios from 'axios';
import * as JWT from 'jsonwebtoken';

export function withServerRequester(cmd) {
  return async ({ flags, args, ctx }) => {
    let token = flags.token ?? process.env.TOKEN;
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
    const url = flags.remote ?? process.env.DB_URL ?? `http://localhost:6543`; // `https://${projectId}.triplit.io`;
    const requestServer = makeRequester({ url, token });
    // TODO: add prod flag
    return cmd({
      flags,
      args,
      ctx: { ...ctx, requestServer, projectId, token, url },
    });
  };
}

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
