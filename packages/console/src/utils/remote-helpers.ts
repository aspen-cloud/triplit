import { DBSchema } from '@triplit/entity-db';
import { consoleClient } from 'triplit/client.js';

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
  url: string
): Promise<Response | { ok: false }> {
  const serviceToken = await consoleClient.fetchOne(
    consoleClient.query('tokens').Id('service_' + url),
    { policy: 'local-only' }
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
        authorization: `Bearer ${serviceToken.value}`,
      },
    });
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function fetchSchema(url: string): Promise<DBSchema | undefined> {
  const response = await queryServer('schema', url);
  if (response.ok) {
    const body = await response.json();
    if (body.type === 'schema') {
      return body.schema;
    }
  }
  return undefined;
}

export type CollectionStats = { collection: string; numEntities: number };

export async function fetchCollectionStats(url: string) {
  const response = await queryServer('stats', url);
  if (response.ok) {
    return (await response.json()) as CollectionStats[];
  } else {
    console.warn(`Could not fetch collection stats`);
    return [];
  }
}
