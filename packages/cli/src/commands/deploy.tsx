import { Command } from '../command.js';
import prompts from 'prompts';
import * as Flag from '../flags.js';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import * as path from 'path';
import axios, { AxiosError } from 'axios';
import {
  MANAGEMENT_API_URL,
  accessTokenMiddleware,
} from '../middleware/account-auth.js';
import { getOrganization } from '../organization-state.js';
import { selectOrCreateAnOrganization } from '../remote-utils.js';
import { createConfig, getConfig } from '../project-config.js';
import { CWD } from '../filesystem.js';
import { existsSync, readFileSync } from 'fs';
import { supabase } from '../supabase.js';
import { blue, bold } from 'ansis/colors';
import ora from 'ora';

export default Command({
  description: 'Deploy to Triplit Cloud',
  preRelease: true,
  middleware: [accessTokenMiddleware],
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
    const organization =
      getOrganization() ?? (await selectOrCreateAnOrganization());

    if (!organization) {
      console.error(
        'You are not currently working with an organization. Run `triplit org` to select or create an organization.'
      );
      return;
    }
    const subscriptionStatusSpinner = ora(
      `Checking ${organization.name} subscription status`
    );
    subscriptionStatusSpinner.start();
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, subscription_type_id')
      .eq('organization_id', organization.id)
      .neq('status', 'canceled')
      .maybeSingle();
    if (subscriptionError) {
      subscriptionStatusSpinner.fail();
      console.error('Error fetching subscription', subscriptionError);
      return;
    }
    if (!subscription) {
      subscriptionStatusSpinner.fail();

      console.log(
        `${blue(
          organization.name
        )} is not subscribed to a Triplit plan with hosted deployments.`
      );
      console.log(
        `Run ${blue(
          '`triplit upgrade`'
        )} to upgrade your organization and enable cloud deployments.`
      );
      return;
    }
    subscriptionStatusSpinner.succeed();

    let config = getConfig();
    if (!config) {
      console.log("It looks like you haven't deployed this project before.");
      const possibleProjectName = inferProjectName();
      const { data: existingProject, error: fetchExistingProjectError } =
        await supabase
          .from('projects')
          .select('id, name, organization_id')
          .eq('organization_id', organization.id)
          .eq('name', possibleProjectName)
          .single();

      const shouldUseExistingProject = async () => {
        console.log(
          `A project with the name ${bold(
            possibleProjectName
          )} already exists in this organization.`
        );
        const { proceed } = await prompts({
          type: 'confirm',
          name: 'proceed',
          message: 'Would you like to deploy to this exiting project?',
        });
        return proceed;
      };

      if (existingProject && (await shouldUseExistingProject())) {
        config = createConfig({
          id: existingProject.id,
          name: existingProject.name,
        });
      } else {
        const { proceed } = await prompts({
          type: 'confirm',
          name: 'proceed',
          message: 'Would you like to deploy to a new project?',
        });
        if (!proceed) return;
        const { name } = await prompts({
          type: 'text',
          name: 'name',
          message: 'Enter a name for this project',
          initial: inferProjectName(),
          validate: (value: string) =>
            value.length > 0 ? true : 'Project name must not be empty',
        });
        const { data: newProject, error: projectCreationError } = await supabase
          .from('projects')
          .insert({ name: name, organization_id: organization.id, version: 2 })
          .select()
          .single();
        if (projectCreationError) {
          console.error('Error creating project', projectCreationError);
          return;
        }
        config = createConfig({
          id: newProject.id,
          name: newProject.name,
        });
      }
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
        `Your project has been deployed to ${blue(
          'https://' + projectId + '.triplit.io'
        )}`
      );
      console.log(
        `Visit ${blue(
          'triplit.dev/dashboard/project/' + projectId
        )} to view its connection tokens.`
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

function inferProjectName() {
  let name = path.basename(CWD);
  const packageJsonPath = CWD + '/package.json';
  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (packageJson.name) {
      name = packageJson.name;
    }
  }
  return name;
}
