import prompts from 'prompts';
import { supabase } from './supabase.js';
import { Organization } from './organization-state.js';

export async function selectOrCreateAnOrganization() {
  const { data, error } = await supabase.from('organizations').select('*');
  if (error) {
    console.error('Error fetching organizations', error);
    return;
  }
  let organizationId: string | null = null;
  const response = await prompts({
    type: 'select',
    name: 'orgId',
    message: 'Select an organization',
    choices: [
      ...data.map((org) => ({ title: org.name, value: org.id })),
      { title: 'Create a new organization', value: null },
    ],
  });
  organizationId = response.orgId;
  if (organizationId !== null)
    return data.find((org) => org.id === organizationId) as Organization;
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
  const { error: fetchError, data: newOrg } = await supabase
    .from('organizations')
    .select('*')
    .eq('name', organizationName)
    .single();
  if (fetchError) {
    console.error('Error fetching new organization', fetchError);
    return;
  }
  return newOrg as Organization;
}
