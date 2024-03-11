import { ImportProjectFormValues } from 'src/components/import-project-form.js';
import { getProjectIdFromApiKey } from './server.js';
import { TokenReadError } from '@triplit/server-core';
import { consoleClient } from 'triplit/client.js';

export async function addProjectToConsole(formValues: ImportProjectFormValues) {
  const { displayName, token, server } = formValues;
  try {
    const projectId = getProjectIdFromApiKey(token);
    const [protocol, origin] = server.split('://');
    await consoleClient.insert('projects', {
      displayName,
      token,
      projectId,
      server: origin,
      secure: protocol === 'https',
      id: origin,
    });
    return origin;
  } catch (e) {
    console.error(e);
    throw new TokenReadError();
  }
}
