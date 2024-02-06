import { getConfig, storeConfig } from './saved-state.js';

export type Organization = {
  id: string;
  created_at: string;
  name: string;
};

const KEY = 'auth.organization';

export const storeOrganization = (org: Organization) => {
  storeConfig(KEY, org);
};

export const getOrganization = () => {
  return getConfig(KEY) as Organization | null;
};

export const clearOrganization = () => {
  storeConfig(KEY, null);
};
