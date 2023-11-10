import { NextFunction, Request, Response } from 'express';
import { IncomingMessage } from 'http';
import {
  InvalidAuthenticationSchemeError,
  NoTokenProvidedError,
} from '@triplit/server-core/errors';
import { parseAndValidateToken } from '@triplit/server-core/token';
import { TriplitError } from '@triplit/db';

export async function useHttpToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    const error = new NoTokenProvidedError('Missing authorization header');
    return res.status(error.status).send(error.toJSON());
  }

  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer') {
    const error = new InvalidAuthenticationSchemeError();
    return res.status(error.status).send(error.toJSON());
  }
  if (!token) {
    const error = new NoTokenProvidedError('Missing authorization token');
    return res.status(error.status).send(error.toJSON());
  }
  try {
    const { data, error } = await parseAndValidateToken(
      token,
      process.env.JWT_SECRET!,
      process.env.PROJECT_ID!,
      { payloadPath: process.env.CLAIMS_PATH! }
    );

    if (error) throw error;

    req.token = data;
    return next();
  } catch (e) {
    let triplitError: TriplitError;
    if (e instanceof TriplitError) triplitError = e;
    else if (e instanceof Error) triplitError = new TriplitError(e.message);
    else
      triplitError = new TriplitError(
        'An unknown error occured while parsing token'
      );
    return res.status(triplitError.status).send(triplitError.toJSON());
  }
}

export async function readWSToken(request: IncomingMessage) {
  const url = new URL(`http://localhost${request.url!}`);
  const token = url.searchParams.get('token');
  return parseAndValidateToken(
    token!,
    process.env.JWT_SECRET!,
    process.env.PROJECT_ID!,
    { payloadPath: process.env.CLAIMS_PATH! }
  );
}
