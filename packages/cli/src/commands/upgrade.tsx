import { blue } from 'ansis/colors';
import { Command } from '../command.js';
import { accessTokenMiddleware } from '../middleware/account-auth.js';
import { getOrganization } from '../organization-state.js';

export default Command({
  description: 'Upgrades an organization to a paid plan',
  flags: {},
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
    try {
      const { url, hasExistingSubscription } = await ctx.requestServer(
        'POST',
        '/account/upgrade',
        {
          organizationId: organization.id,
        }
      );
      if (hasExistingSubscription) {
        console.log(
          '\nYou already have a paid subscription for this organization. Use the billing portal to change or cancel your subscription:\n'
        );
      } else {
        console.log(
          '\nTo complete the upgrade, pay via Stripe at the following link:\n'
        );
      }
      console.log(blue(url));
    } catch (error) {
      console.error('Error upgrading', error);
    }
  },
});
