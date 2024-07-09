import { NextFunction, Response, Request } from 'express';
import { ServiceKeyRequiredError } from '@triplit/server-core/errors';

export function adminAccessRequired(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.token;
  if (token?.['x-triplit-token-type'] !== 'secret') {
    const error = new ServiceKeyRequiredError();
    res.status(error.status).send(error.toJSON());
    return;
  }
  next();
}
