import { Command } from '../command.js';
import * as Flag from '../flags.js';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import * as path from 'path';
import axios, { AxiosError } from 'axios';
import {
  MANAGEMENT_API_URL,
  accessTokenMiddleware,
} from '../middleware/account-auth.js';
import { getConfig } from '../project-config.js';
import { blue, green } from 'ansis/colors';
import ora from 'ora';
import { organizationMiddleware } from '../middleware/organization.js';

export default Command({
  description: 'Deploy to Triplit Cloud',
  preRelease: true,
  middleware: [accessTokenMiddleware, organizationMiddleware],
  flags: {
    projectId: Flag.String({
      description: 'Project ID',
      required: false,
    }),
    triplitDir: Flag.String({
      description: 'Triplit directory',
      char: 'd',
      default: './triplit',
    }),
  },
  async run({ flags, ctx, args }) {
    // const subscriptionStatusSpinner = ora(
    //   `Checking ${organization.name} subscription status`
    // );
    // subscriptionStatusSpinner.start();
    // const { data: subscription, error: subscriptionError } = await supabase
    //   .from('subscriptions')
    //   .select('id, stripe_subscription_id, status, subscription_type_id')
    //   .eq('organization_id', organization.id)
    //   .neq('status', 'canceled')
    //   .maybeSingle();
    // if (subscriptionError) {
    //   subscriptionStatusSpinner.fail();
    //   console.error('Error fetching subscription', subscriptionError);
    //   return;
    // }
    // if (!subscription) {
    //   subscriptionStatusSpinner.fail();

    //   console.log(
    //     `${blue(
    //       organization.name
    //     )} is not subscribed to a Triplit plan with hosted deployments.`
    //   );
    //   console.log(
    //     `Run ${blue(
    //       '`triplit upgrade`'
    //     )} to upgrade your organization and enable cloud deployments.`
    //   );
    //   return;
    // }
    // subscriptionStatusSpinner.succeed();

    let config = getConfig();
    if (!config) {
      console.log(
        "\nIt looks like your current workspace isn't linked to a Triplit Cloud project.\n"
      );
      console.log(
        `Run ${green('`triplit link`')} to link this workspace to a project.\n`
      );
      return;
    }
    const buildingSpinner = ora('Building project');
    buildingSpinner.start();
    const workerPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../deploy/worker.js'
    );
    const result = await esbuild.build({
      target: 'es2022',
      format: 'esm',
      entryPoints: [workerPath],
      bundle: true,
      // outfile: './triplit/.deploy/index.js',
      write: false,
      alias: {
        '@/schema': './triplit/schema.ts',
      },
    });
    if (result.errors.length) {
      buildingSpinner.fail();
      for (const error of result.errors) {
        console.error(error.text);
      }
      return;
    }
    buildingSpinner.succeed();
    const uploadSpinner = ora('Uploading to Triplit Cloud');
    uploadSpinner.start();
    const projectId = flags.projectId ?? config.id;
    try {
      const response = await axios.post(
        `${MANAGEMENT_API_URL}/deploy/${flags.projectId ?? config.id}`,
        result.outputFiles[0].text,
        {
          headers: {
            'Content-Type': 'text/plain',
            Authorization: 'Bearer ' + ctx.accessToken,
          },
        }
      );
      uploadSpinner.succeed('Deployment complete');
      console.log(
        `\nSet up you local .env file using the dashboard:\n\n${
          blue('https://triplit.dev/dashboard/project/' + projectId) + '\n'
        }`
      );
    } catch (err) {
      uploadSpinner.fail();
      if (err instanceof AxiosError) {
        // log info about Axios Error
        if (err.response) {
          console.log(err.response.status);
          console.log(err.response.data);
          return;
        }
        if (err.request) {
          console.log(err.code);
          return;
        }
      }
      console.error(err);
    }
  },
});
