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

export const DEFAULT_HOSTNAME = 'localhost:6543';
const DEFAULT_PROJECT_ID = 'local-project';
const DEFAULT_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ4LXRyaXBsaXQtdG9rZW4tdHlwZSI6InNlY3JldCIsIngtdHJpcGxpdC1wcm9qZWN0LWlkIjoibG9jYWwtcHJvamVjdC1pZCJ9.8Z76XXPc9esdlZb2b7NDC7IVajNXKc4eVcPsO7Ve0ug';

export async function initializeFromUrl() {
  if (typeof window === 'undefined') return null;
  let token,
    server,
    projName = null;
  const url = new URL(window.location.href);
  const isLocalRoute = url.pathname === '/local';

  if (isLocalRoute) {
    token = DEFAULT_TOKEN;
    server = 'http://' + DEFAULT_HOSTNAME;
    projName = DEFAULT_PROJECT_ID;
  } else {
    const params = new URLSearchParams(url.search);
    token = params.get('token');
    if (!(token && JWTPayloadIsOfCorrectForm(token))) return null;
    server = params.get('server');
    if (!server) return null;
    projName = params.get('projName');
  }
  const projId = await addProjectToConsole({
    server,
    token,
    displayName: projName ?? 'triplit-project',
  });
  return projId;
}
