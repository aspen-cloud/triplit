// import { ParsedToken } from '@triplit/types/sync';
import { NextFunction, Request, Response } from 'express';
// import { RateLimiterMemory } from 'rate-limiter-flexible';
import WebSocket from 'ws';

// const testTokenRateLimiter = new RateLimiterMemory({
//   points: 60,
//   duration: 60,
// });

// const customerTokenRateLimiter = new RateLimiterMemory({
//   points: 600,
//   duration: 60,
// });

// function getRateLimiter(token: NonNullable<ParsedToken>) {
//   return token.type === 'test'
//     ? testTokenRateLimiter
//     : customerTokenRateLimiter;
// }

// Temporarily disable rate limiting

// For now everything is 1 point, but we could wrap this in a function to allow for different point values per endpoint
export const rateLimiterMiddleware = (
  _req: Request,
  _res: Response,
  next: NextFunction
) => {
  return next();
  //   if (!req.token) {
  //     res.status(500).send('Missing token');
  //     return;
  //   }

  //   getRateLimiter(req.token)
  //     .consume(req.token.projectId || req.ip, 1)
  //     .then(() => {
  //       next();
  //     })
  //     .catch(() => {
  //       res.status(429).send('Too Many Requests');
  //     });
};

export const rateLimiterMiddlewareWs = async (_socket: WebSocket.WebSocket) => {
  return true;
  // try {
  //   await getRateLimiter(socket.token!).consume(
  //     socket.token!.projectId || socket._socket.remoteAddress,
  //     1
  //   );
  //   return true;
  // } catch (e) {
  //   return false;
  // }
};
