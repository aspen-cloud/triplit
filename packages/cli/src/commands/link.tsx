import { blue, green } from 'ansis/colors';
import { Command } from '../command.js';
import { accessTokenMiddleware } from '../middleware/account-auth.js';
import { Organization, getOrganization } from '../organization-state.js';
import prompts from 'prompts';
import { createConfig, getConfig } from '../project-config.js';
import { supabase } from '../supabase.js';
import ora from 'ora';

export default Command({
  description: 'Link your local workspace to a Triplit Cloud project',
  flags: {},
  preRelease: false,
  middleware: [accessTokenMiddleware],
  async run({ ctx }) {
    const organization = getOrganization();
    if (!organization) {
      console.log(
        'In order to link to a Triplit Cloud project, you need to be working with an organization. Run `triplit org` to select or create an organization.'
      );
      return;
    }
    let config = getConfig();
    if (config) {
      console.log(
        `\nYou are already linked to a project: ${blue(config.name)}\n`
      );
      const { proceed } = await prompts({
        type: 'confirm',
        name: 'proceed',
        message:
          'Would you like to link this workspace to a different project?',
      });
      if (!proceed) {
        return;
      }
    }
    const project = await selectProject(organization);
    if (!project) return;
    createConfig(project);
  },
});

async function selectProject(organization: Organization) {
  const fetchingSpinner = ora('Fetching Triplit Cloud projects');
  fetchingSpinner.start();
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', organization.id);
  if (error) {
    fetchingSpinner.fail('Error fetching projects');
    console.error(error);
    return;
  }
  fetchingSpinner.succeed();

  if (projects.length === 0) {
    console.log(
      `\nYou don't have any projects in ${blue(
        organization.name
      )}. Create a new project with ${green('`triplit project create`')}\n`
    );
    return null;
  }
  const { selection } = await prompts(
    {
      type: 'select',
      name: 'selection',
      message: 'Select a project to link to',
      choices: projects.map((p) => ({ title: p.name, value: p.id })),
    },
    { onCancel: () => process.exit(0) }
  );
  return {
    id: selection,
    name: projects.find((p) => p.id === selection)?.name,
  };
}
