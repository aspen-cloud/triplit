import { blue } from 'ansis/colors';
import { Command } from '../command.js';
import { accessTokenMiddleware } from '../middleware/account-auth.js';
import { getOrganization, storeOrganization } from '../organization-state.js';
import prompts from 'prompts';
import { selectOrCreateAnOrganization } from '../remote-utils.js';

export default Command({
  description: 'Checks the status of the current user',
  flags: {},
  preRelease: true,
  middleware: [accessTokenMiddleware],
  async run({ ctx }) {
    const organization = getOrganization();
    if (organization) {
      console.log(
        "You're currently working with the organization",
        blue(organization.name)
      );
      const result = await prompts({
        type: 'confirm',
        name: 'value',
        message: 'Would you like to switch organizations?',
      });
      if (result.value) {
        const organization = await selectOrCreateAnOrganization();
        if (!organization) {
          console.log('No organization selected');
          return;
        }
        storeOrganization(organization);
        console.log(`Switched to organization: ${blue(organization.name)}`);
      }
      return;
    } else {
      const result = await prompts({
        type: 'confirm',
        name: 'value',
        message: 'Would you like to change to an organization workspace?',
      });
      if (result.value) {
        const organization = await selectOrCreateAnOrganization();
        if (!organization) {
          console.log('No organization selected');
          return;
        }
        storeOrganization(organization);
        console.log(`Switched to organization: ${blue(organization.name)}`);
      }
      return;
    }
  },
});
