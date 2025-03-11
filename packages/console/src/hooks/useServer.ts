import { useQuery, useQueryOne } from '@triplit/react';
import { consoleClient } from '../../triplit/client.js';

export function useServer(url: string) {
  const project = useQueryOne(
    consoleClient,
    consoleClient.query('servers').Where('url', '=', url).Include('tokens')
  );
  return project;
}

export function useServers() {
  const { results: servers } = useQuery(
    consoleClient,
    consoleClient.query('servers')
  );
  return servers;
}

export function useTokens(url: string) {
  const tokens = useQuery(
    consoleClient,
    consoleClient
      .query('tokens')
      .Where('serverUrl', '=', url)
      .Order('created_at', 'ASC')
  );
  return tokens;
}
