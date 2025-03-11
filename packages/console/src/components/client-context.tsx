import React, { createContext, useCallback, useRef } from 'react';
import { TriplitClient } from '@triplit/client';
import { fetchSchema } from '../utils/remote-helpers.js';

type ClientContextData = {
  serverClients: Map<string, TriplitClient>;
  selectedClient: TriplitClient | undefined;
  setSelectedClient: React.Dispatch<
    React.SetStateAction<TriplitClient | undefined>
  >;
};

const ClientContext = createContext<ClientContextData>(
  //@ts-expect-error
  {}
);

export function createClientId(serverUrl: string, token: string) {
  return `${serverUrl}-${token}`;
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const serverClients = useRef(new Map<string, TriplitClient>());
  const [selectedClient, setSelectedClient] = React.useState<
    TriplitClient | undefined
  >();

  return (
    <ClientContext.Provider
      value={{
        serverClients: serverClients.current,
        selectedClient,
        setSelectedClient,
      }}
    >
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const { serverClients, selectedClient, setSelectedClient } =
    React.useContext(ClientContext);
  const updateClientOptions = useCallback(
    async (params: { serverUrl?: string; token?: string } | undefined) => {
      if (!params) {
        // delete
        setSelectedClient(undefined);
        return;
      }
      // No changes
      let { serverUrl, token } = params;
      serverUrl = serverUrl ?? selectedClient?.options?.serverUrl;
      token = token ?? selectedClient?.options?.token;
      if (!serverUrl || !token) {
        throw new Error('Both serverUrl and token must be provided');
      }
      const clientId = createClientId(serverUrl, token);
      if (!serverClients.has(clientId)) {
        const serverSchema = await fetchSchema(serverUrl);
        const newClient = new TriplitClient({
          token,
          serverUrl,
          schema: serverSchema?.collections,
          roles: serverSchema?.roles,
        });
        if (newClient.awaitReady) await newClient.awaitReady;
        serverClients.set(clientId, newClient);
      }
      setSelectedClient(serverClients.get(clientId));
    },
    [selectedClient]
  );

  return [selectedClient, updateClientOptions] as const;
}
