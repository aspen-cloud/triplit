import { getSession, storeSession } from '../auth-state.js';
import { Middleware } from '../middleware.js';
import { supabase } from '../supabase.js';

export const accessTokenMiddleware = Middleware({
  name: 'Access Token',
  run: async ({ flags, args }) => {
    let session = getSession();
    if (!session) {
      throw new Error('No session found. Please login first then try again.');
    }
    // Check if session is expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (now > expiresAt) {
      const { data, error } = await supabase.auth.refreshSession(session);
      if (error) {
        throw new Error(error.message);
      }
      session = data.session;
      storeSession(data.session);
    }
    return {
      accessToken: session.access_token,
    };
  },
});
