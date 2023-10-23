import { triplesToSchema } from '@triplit/db';
import { Project } from '../components';

/**
 * Decode a JWT payload
 * https://stackoverflow.com/a/38552302
 * @param  {String} token The JWT
 * @return {Object}       The decoded payload
 */
export function parseJWT(token: string) {
  let base64Url = token.split('.')[1];
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  let jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join('')
  );
  return JSON.parse(jsonPayload);
}

export function JWTPayloadIsOfCorrectForm(token: string) {
  try {
    const parsedPayload = parseJWT(token);
    return (
      Object.hasOwn(parsedPayload, 'x-triplit-project-id') &&
      Object.hasOwn(parsedPayload, 'x-triplit-token-type')
    );
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function getProjectIdFromApiKey(apiKey: string): string {
  const payload = parseJWT(apiKey);
  return payload['x-triplit-project-id'];
}

async function queryServer(route: string, project: Project) {
  const { server, secure, token } = project;
  try {
    return await fetch(`http${secure ? 's' : ''}://${server}/${route}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
    });
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function fetchSchema(project: Project) {
  const response = await queryServer('schema', project);
  if (response.ok) {
    const { type, schemaTriples } = await response.json();
    if (type === 'schema') {
      return triplesToSchema(schemaTriples);
    }
  }
  return undefined;
}

export type CollectionStats = { collection: string; numEntities: number };

export async function fetchCollectionStats(project: Project) {
  const response = await queryServer('stats', project);
  if (response.ok) {
    return (await response.json()) as CollectionStats[];
  } else {
    console.warn(`Could not fetch collection stats`);
    return [];
  }
}
