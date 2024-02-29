import { blue } from 'ansis/colors';
import { Command } from '../command.js';
import { accessTokenMiddleware } from '../middleware/account-auth.js';
import { getOrganization } from '../organization-state.js';

export default Command({
  description: 'Upgrades an organization to a paid plan',
  flags: {},
  preRelease: true,
  middleware: [accessTokenMiddleware],
  async run({ flags, ctx, args }) {
    // get the user's organizations
    const organization = getOrganization();
    if (!organization) {
      console.log(
        'You must be a member of an organization to upgrade.\n Run `triplit org` to select or create an organization.'
      );
      return;
    }
    console.log(`To upgrade your organization, go to the following link:`);
    console.log(
      blue(
        `https://triplit.dev/dashboard/organization/${organization.id}/upgrade`
      )
    );
  },
});
