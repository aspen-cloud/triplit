import { blue } from 'ansis/colors';
import { Command } from '../command.js';
import { accessTokenMiddleware } from '../middleware/account-auth.js';
import { getOrganization } from '../organization-state.js';
import ora from 'ora';

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
    const upgradeSpinner = ora(
      `Creating a secure upgrade link for ${organization.name}`
    );
    try {
      upgradeSpinner.start();
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
        upgradeSpinner.warn();
      } else {
        console.log(
          '\nTo complete the upgrade, pay via Stripe at the following link:\n'
        );
        upgradeSpinner.succeed();
      }
      console.log(blue(url));
    } catch (error) {
      upgradeSpinner.fail();
      console.error('Error upgrading', error);
    }
  },
});
