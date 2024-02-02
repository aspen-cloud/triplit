import { blue } from 'ansis/colors';
import { Command } from '../command.js';
import * as Flag from '../flags.js';
import { accessTokenMiddleware } from '../middleware/account-auth.js';
import { supabase } from '../supabase.js';
import prompts from 'prompts';

export default Command({
  description: 'Upgrades an organization to a paid plan',
  flags: {},
  middleware: [accessTokenMiddleware],
  async run({ flags, ctx, args }) {
    // get the user's organizations
    const { data, error } = await supabase.from('organizations').select('*');
    if (error) {
      console.error('Error fetching organizations', error);
      return;
    }
    let organizationId = null;
    const response = await prompts({
      type: 'select',
      name: 'orgId',
      message: 'Select an organization to upgrade',
      choices: [
        ...data.map((org) => ({ title: org.name, value: org.id })),
        { title: 'Create a new organization', value: null },
      ],
    });
    organizationId = response.orgId;
    if (organizationId === null) {
      const { organizationName } = await prompts({
        type: 'text',
        name: 'organizationName',
        message: 'Enter a name for the new organization',
        validate: (value: string) =>
          value.length > 0 ? true : 'Organization name cannot be empty',
      });
      const { error: orgError, data: newId } = await supabase.rpc(
        'insert_organization_and_member',
        { org_name: organizationName }
      );
      if (orgError) {
        console.error('Error creating organization', orgError);
        return;
      }
      organizationId = newId;
    }
    try {
      const { url } = await ctx.requestServer('POST', '/account/upgrade', {
        organizationId,
      });
      console.log(
        '\nTo complete the upgrade, pay via Stripe at the following link:\n'
      );
      console.log(blue(url));
    } catch (error) {
      console.error('Error upgrading', error);
    }
  },
});
