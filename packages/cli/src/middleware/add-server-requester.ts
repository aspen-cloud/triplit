import prompts from 'prompts';
import axios, { AxiosError } from 'axios';
import * as JWT from 'jsonwebtoken';
import { Middleware } from '../middleware.js';
import * as Flag from '../flags.js';
import { blue } from 'ansis/colors';

export function createServerRequesterMiddleware({
  destructive,
}: {
  destructive: boolean;
}) {
  //  Method to create a requester function, taking into account props
  function createRequester({
    url,
    token,
    ignoreDestructiveWarning,
  }: {
    url: string;
    token: string;
    ignoreDestructiveWarning?: boolean;
  }) {
    // Use closure to only confirm URL once
    let urlConfirmed = !destructive || ignoreDestructiveWarning;
    return async function request(
      method: 'GET' | 'POST',
      path: string,
      params?: any,
      options?: {
        hooks?: {
          beforeRequest?: () => void | Promise<void>;
        };
      }
    ) {
      // On a destructive action, confirm the URL
      if (!urlConfirmed) {
        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: `This command may perform a destructive action at ${blue(
            url
          )}. Are you sure you want to continue? To disable this check, use the --ignoreDestructiveWarning flag.`,
          initial: false,
        });
        if (!confirm) {
          process.exit(0);
        }
        urlConfirmed = true;
      }

      const payload = method === 'GET' ? { params } : { data: params };
      try {
        await options?.hooks?.beforeRequest?.();
        // TODO: do we still need axios?
        const resp = await axios.request({
          method,
          url: `${url}${path}`,
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          ...payload,
        });
        // axios will throw on non-2xx status codes: https://axios-http.com/docs/handling_errors
        return resp.data;
      } catch (e: any) {
        if (e instanceof AxiosError) {
          if (e.response) {
            throw new Error(JSON.stringify(e.response.data));
          } else if (e.request) {
            throw new Error(
              `No response was received from server: ${url}. Please ensure you are connected to the internet and are pointing to the correct server.`
            );
          }
          throw new Error(
            `An error occurred while requesting the remote database: ${e.message}`
          );
        }
        throw e;
      }
    };
  }

  //  Method to create a requester function, taking into account props
  // TODO: Given we're more familiar with the fetch api, unless there's a good reason for axios, prefer using node's fetch api and eventually swap out all axios usage
  function createRequester_NodeFetch({
    url,
    token,
    ignoreDestructiveWarning,
  }: {
    url: string;
    token: string;
    ignoreDestructiveWarning?: boolean;
  }) {
    // Use closure to only confirm URL once
    let urlConfirmed = !destructive || ignoreDestructiveWarning;
    return async function request(
      method: 'GET' | 'POST',
      path: string,
      options?: {
        headers?: Record<string, string>;
        hooks?: {
          beforeRequest?: () => void | Promise<void>;
        };
        query?: Record<string, string>;
        body?: any;
      }
    ) {
      // On a destructive action, confirm the URL
      if (!urlConfirmed) {
        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: `This command may perform a destructive action at ${blue(
            url
          )}. Are you sure you want to continue? To disable this check, use the --ignoreDestructiveWarning flag.`,
          initial: false,
        });
        if (!confirm) {
          process.exit(0);
        }
        urlConfirmed = true;
      }

      try {
        await options?.hooks?.beforeRequest?.();
        const fetchUrl = new URL(`${url}${path}`);
        if (options?.query) {
          fetchUrl.search = new URLSearchParams(options.query).toString();
        }
        const headers = {
          'Content-Type':
            options?.headers?.['content-type'] ?? 'application/json',
          authorization: `Bearer ${token}`,
          // TODO: spread in any other headers, but be careful that different header keys are handled in an expected manner ('Content-Type' vs 'content-type' may not overwrite)
        };
        return await fetch(fetchUrl, {
          method,
          headers: headers,
          body: options?.body,
        });
      } catch (e: any) {
        if ('code' in e && e.code === 'ECONNREFUSED') {
          throw new Error(
            `No response was received from server: ${url}. Please ensure you are connected to the internet and are pointing to the correct server.`
          );
        }
        throw new Error(
          `An error occurred while requesting the remote database: ${e.message}`
        );
      }
    };
  }

  const name = 'Server Requester';
  const baseFlags = {
    token: Flag.String({
      description: 'Service Token',
      required: false,
      char: 't',
    }),
    remote: Flag.String({
      description: 'Remote URL to connect to',
      required: false,
      char: 'r',
    }),
  };
  const destructiveFlags = {
    ...baseFlags,
    ignoreDestructiveWarning: Flag.Boolean({
      description: 'Ignore warning that command may be destructive',
      required: false,
      default: false,
    }),
  };

  return Middleware({
    name,
    flags: destructive ? destructiveFlags : baseFlags,
    run: async ({ flags }) => {
      let token = flags.token ?? process.env.TRIPLIT_SERVICE_TOKEN;
      if (!token) {
        // request token
        ({ token } = await prompts({
          message: 'Service Token',
          name: 'token',
          type: 'password',
          validate: (tokenInput) => {
            const resp = JWT.decode(tokenInput);
            if (resp) return true;
            return 'Not a valid token';
          },
        }));
      }

      if (!token) return;

      const url =
        flags.remote ?? process.env.TRIPLIT_DB_URL ?? `http://localhost:6543`;
      // Validate url
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('Invalid URL. Must start with http:// or https://');
      }

      const request = createRequester({
        url,
        token,
        // @ts-expect-error TODO: proprly type this flag, may exist may not
        ignoreDestructiveWarning: flags.ignoreDestructiveWarning,
      });
      // TODO: would rather move to using node fetch to simplify lower level req/res access, but most current code uses axios
      const request_NodeFetch = createRequester_NodeFetch({
        url,
        token,
        // @ts-expect-error TODO: proprly type this flag, may exist may not
        ignoreDestructiveWarning: flags.ignoreDestructiveWarning,
      });
      return { remote: { request, request_NodeFetch, token, url } };
    },
  });
}
