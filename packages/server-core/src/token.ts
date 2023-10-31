import { ParsedToken, ParseResult } from '@triplit/types/sync';
import { JWTPayload, jwtVerify } from 'jose';
import {
  InvalidTokenPayloadError,
  InvalidTokenSignatureError,
} from './errors.js';

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

export async function parseAndValidateToken(
  token: string,
  secretKey: string,
  options: { payloadPath?: string } = {}
): Promise<ParseResult<ParsedToken>> {
  const encodedKey = new TextEncoder().encode(secretKey);
  let verified;
  try {
    verified = await jwtVerify(token, encodedKey);
    if (!verified) {
      throw new InvalidTokenSignatureError();
    }
  } catch {
    throw new InvalidTokenSignatureError();
  }

  let payload = verified.payload;

  if (options.payloadPath) {
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

  if (!('x-triplit-project-id' in payload)) {
    return {
      data: undefined,
      error: new InvalidTokenPayloadError(
        'There is no projectId assigned to this token.'
      ),
    };
  }

  if (!('x-triplit-token-type' in payload)) {
    return {
      data: undefined,
      error: new InvalidTokenPayloadError(
        'There is no token type assigned to this token.'
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
