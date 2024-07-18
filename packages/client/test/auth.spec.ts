import { expect, it } from 'vitest';
import { TriplitClient } from '../src/client/triplit-client.ts';

/**
 * {
 *  "hello": "world",
 *  "x-triplit-project-id": "project",
 *  "x-triplit-token-type": "external",
 *  "x-triplit-user-id": "Frylock"
 * }
 *
 * requires use of x-triplit-user-id
 */
const EXTERNAL_TOKEN_V1 =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJoZWxsbyI6IndvcmxkIiwieC10cmlwbGl0LXByb2plY3QtaWQiOiJwcm9qZWN0IiwieC10cmlwbGl0LXRva2VuLXR5cGUiOiJleHRlcm5hbCIsIngtdHJpcGxpdC11c2VyLWlkIjoiRnJ5bG9jayJ9.JUfSESd-Ogykpw2S7tzJpH6a7q6dsaC1XnqFE59_IEc';

/**
 * {
 *  "hello": "world",
 *  "x-triplit-project-id": "project",
 *  "x-triplit-token-type": "external",
 *  "userId": "Meatwad"
 * }
 */
const EXTERNAL_TOKEN_V2 =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJoZWxsbyI6IndvcmxkIiwieC10cmlwbGl0LXByb2plY3QtaWQiOiJwcm9qZWN0IiwieC10cmlwbGl0LXRva2VuLXR5cGUiOiJleHRlcm5hbCIsInVzZXJJZCI6Ik1lYXR3YWQifQ.n8lxfnEzo258c-I3muyVUzEqHrs5NlrumxX1ZM4Y_iU';

it('instantiating a client without a token does not set session variables', async () => {
  const client = new TriplitClient({ autoConnect: false });
  expect(client.db.systemVars.session).toStrictEqual({});
});

it('instantiating a client with a token sets session variables', async () => {
  const client = new TriplitClient({
    token: EXTERNAL_TOKEN_V2,
    autoConnect: false,
  });
  expect(client.db.systemVars.session).toStrictEqual({
    hello: 'world',
    'x-triplit-project-id': 'project',
    'x-triplit-token-type': 'external',
    userId: 'Meatwad',
  });
});

it('instantiating a client with token with claim "x-triplit-user-id" sets SESSION_USER_ID var', async () => {
  const client = new TriplitClient({
    token: EXTERNAL_TOKEN_V1,
    autoConnect: false,
  });
  expect(client.db.systemVars.session).toStrictEqual({
    hello: 'world',
    'x-triplit-project-id': 'project',
    'x-triplit-token-type': 'external',
    'x-triplit-user-id': 'Frylock',
    SESSION_USER_ID: 'Frylock',
  });
});
