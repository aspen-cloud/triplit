import { Session } from '@supabase/supabase-js';
import { getConfig, storeConfig } from './saved-state.js';

export const storeSession = (session: Session) => {
  storeConfig('auth.session', session);
};

export const getSession = () => {
  return getConfig('auth.session') as Session;
};
