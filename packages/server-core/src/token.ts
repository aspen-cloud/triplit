import { ParsedToken, ParseResult } from '@triplit/types/sync';
import { JWTPayload, jwtVerify, importSPKI, KeyLike, importJWK } from 'jose';
import {
  InvalidTokenPayloadError,
  InvalidTokenProjectIdError,
  InvalidTokenSignatureError,
} from './errors.js';
import { TriplitError } from '@triplit/db';

const TriplitJWTType = ['test', 'anon', 'secret'] as const;
type TriplitJWTType = (typeof TriplitJWTType)[number];
type TriplitJWT = {
  'x-triplit-token-type': 'test' | 'anon' | 'secret';
  'x-triplit-project-id': string;
};

type ExternalJWT = {
  'x-triplit-token-type': 'external';
  'x-triplit-project-id': string;
  'x-triplit-user-id': string;
};

type ProjectJWT = TriplitJWT | ExternalJWT;

async function getJwtKey(rawPublicKey: string): Promise<KeyLike | Uint8Array> {
  if (rawPublicKey.startsWith('-----BEGIN PUBLIC KEY-----')) {
    console.log('using rsa public key');
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
  token: string,
  secretKey: string,
  projectId: string,
  options: { payloadPath?: string } = {}
): Promise<ParseResult<ParsedToken, TriplitError>> {
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
    console.error(err);
    // TODO add better expiration error
    return {
      data: undefined,
      error: new InvalidTokenSignatureError(),
    };
  }

  let payload = verified.payload;

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
        'Could not locate Triplit claims in your external token. If claims are not located at the root of the token please ensure you have provided a path to the claims in the settings of your project.'
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

  if (!('x-triplit-project-id' in payload)) {
    return {
      data: undefined,
      error: new InvalidTokenPayloadError(
        'There is no projectId assigned to this token.'
      ),
    };
  }

  if (payload['x-triplit-token-type'] === 'external') {
    if (!('x-triplit-user-id' in payload)) {
      return {
        data: undefined,
        error: new InvalidTokenPayloadError(
          'There is no user id assigned to this token.'
        ),
      };
    }
  }

  if (payload['x-triplit-project-id'] !== projectId) {
    return {
      data: undefined,
      error: new InvalidTokenProjectIdError(),
    };
  }

  return {
    data: tokenFieldsToMetadata(payload as ProjectJWT),
    error: undefined,
  };
}

export function tokenFieldsToMetadata(
  jwt: JWTPayload & ProjectJWT
): ParsedToken {
  const metadata: ParsedToken = {
    projectId: jwt['x-triplit-project-id'],
    type: jwt['x-triplit-token-type'],
  };
  if ('x-triplit-user-id' in jwt) {
    metadata.userId = jwt['x-triplit-user-id'] as string;
  }
  return metadata;
}
