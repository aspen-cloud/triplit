import { Middleware } from '../middleware.js';
import { getOrganization } from '../organization-state.js';
import { green } from 'ansis/colors';

export const MANAGEMENT_API_URL =
  process.env.MANAGEMENT_API_URL ?? 'https://api.triplit.dev';

export const organizationMiddleware = Middleware({
  name: 'Current Organization',
  run: async ({ flags, args }) => {
    const organization = getOrganization();
    if (!organization) {
      return `\nCurrently not working within an organization. Run ${green(
        '`triplit org`'
      )} to select or create an organization and then retry.\n`;
    }
    return {
      organization,
    };
  },
});
