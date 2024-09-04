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
  'x-triplit-token-type'?: 'test' | 'anon' | 'secret';
};

export type ProjectJWT = TriplitJWT;

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
  _projectId: string | undefined,
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

  let payload: JWTPayload;
  try {
    payload = decodeJwt(token);
  } catch (err) {
    return {
      data: undefined,
      error: new InvalidTokenPayloadError(
        'Token could not be decoded as a valid JWT'
      ),
    };
  }

  // Should still accept our own tokens, so only check payload path if it might be external (we cant find our claims at base)
  const isExternal = !TriplitJWTType.includes(
    payload['x-triplit-token-type'] as TriplitJWTType
  );
  if (isExternal && options.payloadPath) {
    // @ts-expect-error
    payload = options.payloadPath.split('.').reduce((acc, curr) => {
      if (acc) {
        return acc[curr];
      }
      return undefined;
    }, payload);
  }

  // tokens from gateway will not have triplit claims, so will seem external, but should be validated with master jwt secret
  const secretKey = isExternal
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
  } catch (err: any) {
    return {
      data: undefined,
      error: new InvalidTokenSignatureError(
        'message' in err
          ? err.message
          : 'Error thrown during token verification'
      ),
    };
  }

  return {
    data: payload as ProjectJWT,
    error: undefined,
  };
}
