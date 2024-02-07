import { getSession, storeSession } from '../auth-state.js';
import { Middleware } from '../middleware.js';
import { supabase } from '../supabase.js';
import axios from 'axios';

const MANAGEMENT_API = 'http://localhost:8787';

export const accessTokenMiddleware = Middleware({
  name: 'Access Token',
  run: async ({ flags, args }) => {
    let session = getSession();
    if (!session) {
      return 'No session found. Run `triplit login` and then retry.';
    }
    // Check if session is expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (now > expiresAt) {
      const { data, error } = await supabase.auth.refreshSession(session);
      if (error) {
        return error.message;
      }
      session = data.session;
      storeSession(data.session);
    }
    const requestServer = makeAPIRequester(session.access_token);
    return {
      accessToken: session.access_token,
      session,
      requestServer,
    };
  },
});

function makeAPIRequester(token: string) {
  return async function request(
    method: 'GET' | 'POST',
    path: string,
    params?: any
  ) {
    const payload = method === 'GET' ? { params } : { data: params };
    const url = MANAGEMENT_API + path;
    try {
      const resp = await axios.request({
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        ...payload,
      });

      // axios will throw on non-2xx status codes: https://axios-http.com/docs/handling_errors
      return resp.data;
    } catch (e: any) {
      if (e.response) {
        throw e.response.data;
      } else if (e.request) {
        throw `No response was received from server: ${url}. Please ensure you are connected to the internet and are pointing to the correct server.`;
      }
      throw `An error occured while requesting the remote database: ${e.message}`;
    }
  };
}
