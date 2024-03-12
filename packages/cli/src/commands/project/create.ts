import { Command } from '../../command.js';
import { accessTokenMiddleware } from '../../middleware/account-auth.js';
import prompts from 'prompts';
import { createConfig } from '../../project-config.js';
import { supabase } from '../../supabase.js';
import ora from 'ora';
import { inferProjectName } from '../../filesystem.js';
import { organizationMiddleware } from '../../middleware/organization.js';

export default Command({
  description: 'Create a new Triplit Cloud project',
  flags: {},
  preRelease: false,
  middleware: [accessTokenMiddleware, organizationMiddleware],
  async run({ ctx }) {
    const { organization } = ctx;
    const project = await createProject(organization.id);
    createConfig(project);
  },
});

async function createProject(organizationId: string) {
  const { projectName } = await prompts(
    {
      type: 'text',
      name: 'projectName',
      initial: inferProjectName(),
      validate: (name) =>
        name.length > 0 ? true : 'Project name cannot be empty',
      message: 'Enter a name for the new project',
    },
    { onCancel: () => process.exit(0) }
  );
  const creatingSpinner = ora('Creating new project: ' + projectName);
  creatingSpinner.start();
  const { data: newProject, error: insertError } = await supabase
    .from('projects')
    .insert({ name: projectName, organization_id: organizationId, version: 2 })
    .select('id, name')
    .single();
  if (insertError) {
    creatingSpinner.fail('Error creating project');
    console.error(insertError);
    return;
  }
  creatingSpinner.succeed();
  return { id: newProject.id, name: newProject.name };
}
