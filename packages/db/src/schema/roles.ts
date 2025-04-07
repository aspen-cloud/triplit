import { Roles } from './types/index.js';

export const DEFAULT_ROLES: Roles = {
  anonymous: {
    match: {
      'x-triplit-token-type': 'anon',
    },
  },
  authenticated: {
    match: {
      sub: '$sub',
    },
  },
};
