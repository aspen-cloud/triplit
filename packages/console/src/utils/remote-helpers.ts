import { triplesToSchema } from '@triplit/db';
import { consoleClient } from 'triplit/client.js';
import { Server } from 'triplit/schema.js';
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
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function isServiceToken(token: string) {
  try {
    const parsedPayload = parseJWT(token);
    return (
      Object.hasOwn(parsedPayload, 'x-triplit-token-type') &&
      parsedPayload['x-triplit-token-type'] === 'secret'
    );
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function queryServer(
  route: string,
  server: Server
): Promise<Response | { ok: false }> {
  const { url } = server;
  const serviceToken = await consoleClient.fetchOne(
    consoleClient
      .query('tokens')
      .id('service_' + url)
      .build()
  );
  if (!serviceToken) {
    console.error(`Could not find service token for server ${url}`);
    return { ok: false };
  }
  try {
    return await fetch(`${url}/${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${serviceToken}`,
      },
    });
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function fetchSchema(project: Server) {
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

export async function fetchCollectionStats(project: Server) {
  const response = await queryServer('stats', project);
  if (response.ok) {
    return (await response.json()) as CollectionStats[];
  } else {
    console.warn(`Could not fetch collection stats`);
    return [];
  }
}
