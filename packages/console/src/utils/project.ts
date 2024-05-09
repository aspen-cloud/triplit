import { ImportProjectFormValues } from 'src/components/import-project-form.js';
import { JWTPayloadIsOfCorrectForm, getProjectIdFromApiKey } from './server.js';
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

export async function initializeFromUrl() {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const token = params.get('token');
  if (!(token && JWTPayloadIsOfCorrectForm(token))) return null;
  const server = params.get('server');
  if (!server) return null;
  const projName = params.get('projName');
  const projId = await addProjectToConsole({
    server,
    token,
    displayName: projName ?? 'triplit-project',
  });
  return projId;
}
