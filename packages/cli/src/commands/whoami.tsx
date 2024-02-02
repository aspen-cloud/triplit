import { blue } from 'ansis/colors';
import { Command } from '../command.js';
import * as Flag from '../flags.js';
import { accessTokenMiddleware } from '../middleware/account-auth.js';
import { supabase } from '../supabase.js';
import prompts from 'prompts';

export default Command({
  description: 'Checks the status of the current user',
  flags: {},
  middleware: [accessTokenMiddleware],
  async run({ flags, ctx, args }) {
    // get the user's organizations
    const { data, error } = await supabase.from('organizations').select('*');
    if (error) {
      console.error('Error fetching organizations', error);
      return;
    }
    console.log("\nYou're logged in as", blue(ctx.session.user.email ?? ''));
    if (data.length === 0) {
      console.log('You are not a member of any organizations.');
      return;
    }
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('organization_id, subscription_type_id');
    if (subscriptionError) {
      console.error('Error fetching subscriptions', subscriptionError);
      return;
    }
    const orgsAndSubs = data.map((org) => {
      const sub = subscriptions.find((sub) => sub.organization_id === org.id);
      return {
        ...org,
        subscription:
          mapSubscriptionType(sub?.subscription_type_id) ?? 'self-hosted',
      };
    });
    console.log('\nYou are a member of the following organizations:\n');
    orgsAndSubs.forEach((org) => {
      console.log(`- ${org.name}, ${org.subscription}`);
    });
    console.log('\n');
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
