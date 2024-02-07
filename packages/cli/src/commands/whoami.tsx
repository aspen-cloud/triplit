import { blue } from 'ansis/colors';
import { Command } from '../command.js';
import { accessTokenMiddleware } from '../middleware/account-auth.js';
import { getOrganization } from '../organization-state.js';

export default Command({
  description: 'Checks the status of the current user',
  flags: {},
  preRelease: true,
  middleware: [accessTokenMiddleware],
  async run({ ctx }) {
    console.log("\nYou're logged in as", blue(ctx.session.user.email ?? ''));
    const organization = getOrganization();
    if (organization) {
      console.log(
        "You're currently working with the organization",
        blue(organization.name)
      );
    }
  },
});

function mapSubscriptionType(subscription_type_id: any) {
  if (subscription_type_id === 2) {
    return 'Triplit Pro';
  }
  if (subscription_type_id === 1) {
    return 'Triplit Ultra';
  }
}
