import { useQuery } from '@triplit/react';
import { usePageId } from './use-query-params.js';
import { useMemo } from 'react';
import { WorkerClient } from '@triplit/client/worker-client';
import workerUrl from '@triplit/client/worker-client-operator?url';

export const client = new WorkerClient({
  storage: 'memory',
  serverUrl: import.meta.env.VITE_TRIPLIT_SERVER_URL,
  token: import.meta.env.VITE_TRIPLIT_TOKEN,
  workerUrl,
});
const Query = client.query;

window.triplit = client;

export function usePages() {
  return useQuery(client, Query('pages').Order(['createdAt', 'DESC']));
}
export function useExcalidrawElements() {
  const [currentPageId] = usePageId();
  return useQuery(
    client,
    Query('elements')
      .Order('_fracIndex', 'ASC')
      .Where('pageId', '=', currentPageId)
  );
}

export function useUnsyncedElements() {
  const [currentPageId] = usePageId();
  return useQuery(
    client,
    Query('elements').Where('pageId', '=', currentPageId),
    {
      syncStatus: 'pending',
    }
  );
}

export function useUnsyncedElementsCount() {
  const { results: allUnsyncedElements } = useUnsyncedElements();
  return useMemo(() => {
    if (!allUnsyncedElements) return {};
    return allUnsyncedElements.reduce((acc, elem) => {
      acc[elem.pageId] ? (acc[elem.pageId] += 1) : (acc[elem.pageId] = 1);
      return acc;
    }, {});
  }, [allUnsyncedElements]);
}

export async function createNewPage() {
  const pageId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  return client.insert('pages', {
    name: 'Untitled page',
    id: pageId,
    createdAt: new Date().toISOString(),
  });
}
