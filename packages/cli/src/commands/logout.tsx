import { Command } from '../command.js';
import { clearSession, getSession, storeSession } from '../auth-state.js';
import { clearOrganization } from '../organization-state.js';
import { blue } from 'ansis/colors';

export default Command({
  description: 'Sign out of Triplit Cloud',
  preRelease: true,
  async run({ flags, ctx, args }) {
    const existingSession = getSession();
    if (!existingSession) {
      console.error('\nYou are not logged in.\n');
      return;
    }
    clearSession();
    clearOrganization();
    console.log(blue('\nYou have been logged out.\n'));
  },
});
