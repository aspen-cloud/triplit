import { ParseResult } from '@triplit/types/sync';
import {
  JWTPayload,
  jwtVerify,
  importSPKI,
  KeyLike,
  importJWK,
  decodeJwt,
} from 'jose';
import {
  InvalidTokenPayloadError,
  InvalidTokenProjectIdError,
  InvalidTokenSignatureError,
  TokenVerificationError,
} from './errors.js';
import { TriplitError } from '@triplit/db';

const TriplitJWTType = ['test', 'anon', 'secret'] as const;
export type TriplitJWTType = (typeof TriplitJWTType)[number];
export type TriplitJWT = {
  'x-triplit-token-type': 'test' | 'anon' | 'secret';
  'x-triplit-project-id': string;
};

export type ExternalJWT = {
  'x-triplit-token-type': 'external';
  'x-triplit-project-id': string;
  'x-triplit-user-id'?: string;
};

export type ProjectJWT = TriplitJWT | ExternalJWT;

async function getJwtKey(rawPublicKey: string): Promise<KeyLike | Uint8Array> {
  if (rawPublicKey.startsWith('-----BEGIN PUBLIC KEY-----')) {
    return importSPKI(rawPublicKey, 'RS256');
  }
  let parsedKey;
  try {
    parsedKey = JSON.parse(rawPublicKey);
  } catch {}
  if (parsedKey) {
    return importJWK(parsedKey, 'RS256');
  }
  return new TextEncoder().encode(rawPublicKey);
}

export async function parseAndValidateToken(
  token: string | null | undefined,
  triplitSecret: string | undefined, // Signing secret for triplit tokens
  projectId: string | undefined,
  options: {
    payloadPath?: string;
    externalSecret?: string; // optional signing secret for external tokens
  } = {}
): Promise<ParseResult<ProjectJWT, TriplitError>> {
  if (!token)
    return {
      data: undefined,
      error: new TokenVerificationError('No token provided'),
    };

  let payload = decodeJwt(token);

  // Should still accept our own tokens, so only check payload path if it might be external (we cant find our claims at base)
  const possiblyExternal = !TriplitJWTType.includes(
    payload['x-triplit-token-type'] as TriplitJWTType
  );
  if (possiblyExternal && options.payloadPath) {
    // @ts-ignore
    payload = options.payloadPath.split('.').reduce((acc, curr) => {
      if (acc) {
        return acc[curr];
      }
      return undefined;
    }, payload);
  }

  if (!payload) {
    return {
      data: undefined,
      error: new InvalidTokenPayloadError(
        'Could not locate Triplit claims in your token. If claims are not located at the root of the token please ensure you have provided a path to the claims in the settings of your project.'
      ),
    };
  }

  if (!('x-triplit-token-type' in payload)) {
    return {
      data: undefined,
      error: new InvalidTokenPayloadError(
        'There is no token type assigned to this token. If you are using an external token please ensure you have provided a path to the claims in the settings of your project.'
      ),
    };
  }

  const tokenType = payload['x-triplit-token-type'];
  const secretKey =
    tokenType === 'external'
      ? options.externalSecret ?? triplitSecret
      : triplitSecret;
  if (!secretKey) {
    return {
      data: undefined,
      error: new TokenVerificationError(
        'No secret provided for token verification'
      ),
    };
  }
  const encodedKey = await getJwtKey(secretKey);
  let verified;
  try {
    verified = await jwtVerify(token, encodedKey);
    if (!verified) {
      return {
        data: undefined,
        error: new InvalidTokenSignatureError(),
      };
    }
  } catch (err) {
    // console.error(err);
    // TODO add better expiration error
    return {
      data: undefined,
      error: new InvalidTokenSignatureError(),
    };
  }

  if (!('x-triplit-project-id' in payload)) {
    return {
      data: undefined,
      error: new InvalidTokenPayloadError(
        'There is no projectId assigned to this token.'
      ),
    };
  }

  if (!projectId) {
    return {
      data: undefined,
      error: new TokenVerificationError(
        'No project id provided for token verification'
      ),
    };
  }

  if (payload['x-triplit-project-id'] !== projectId) {
    return {
      data: undefined,
      error: new InvalidTokenProjectIdError(),
    };
  }

  return {
    data: payload as ProjectJWT,
    error: undefined,
  };
}
