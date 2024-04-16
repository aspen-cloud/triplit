import { Command } from '../../command.js';
import { accessTokenMiddleware } from '../../middleware/account-auth.js';
import prompts from 'prompts';
import { createConfig, printDashboardLink } from '../../project-config.js';
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
    const project = await createProjectWithPrompts(organization.id);
    createConfig(project);
    printDashboardLink(project);
  },
});

async function createProjectWithPrompts(organizationId: string) {
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
  const { data: newProject, error: insertError } = await createProject({
    name: projectName,
    organization_id: organizationId,
  });
  // const { data: newProject, error: insertError } = await createProjectViaAPI({
  //   name: projectName,
  //   organization_id: organizationId,
  // });
  if (insertError) {
    creatingSpinner.fail('Error creating project');
    console.error(insertError);
    return;
  }
  creatingSpinner.succeed();
  return { id: newProject.id, name: newProject.name };
}

async function createProject(args: {
  name: string;
  organization_id: string;
}): Promise<{ data: any; error: any }> {
  try {
    return await supabase
      .from('projects')
      .insert({
        name: args.name,
        organization_id: args.organization_id,
        version: 2,
      })
      .select('id, name')
      .single();
  } catch (e) {
    return { data: undefined, error: e };
  }
}

// Eventually use this function to create a project via the API
async function createProjectViaAPI(args: {
  name: string;
  organization_id: string;
}): Promise<{ data: any; error: any }> {
  try {
    const token = (await supabase.auth.getSession()).data?.session.access_token;
    if (!token) {
      return { data: undefined, error: 'No access token found' };
    }

    const res = await fetch('https://api.triplit.io/projects', {
      body: JSON.stringify(args),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      method: 'POST',
    });
    if (!res.ok) {
      return { data: undefined, error: await res.text() };
    }

    return { data: await res.json(), error: undefined };
  } catch (e) {
    return { data: undefined, error: e };
  }
}
