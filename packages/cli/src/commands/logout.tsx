import { Command } from '../command.js';
import { clearSession, getSession, storeSession } from '../auth-state.js';
import { clearOrganization } from '../organization-state.js';

export default Command({
  description: 'Sign out of Triplit Cloud',
  preRelease: true,
  async run({ flags, ctx, args }) {
    const existingSession = getSession();
    if (!existingSession) {
      console.log('You are not logged in.');
      return;
    }
    clearSession();
    clearOrganization();
    console.log('You have been logged out.');
  },
});
