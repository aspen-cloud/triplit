import '../../../ui/globals.css';

import { OrderStatement, Schema, QueryWhere } from '@triplit/db';
import { TriplitClient } from '@triplit/client';
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { CaretDown, GridFour, Selection } from '@phosphor-icons/react';
import { DataViewer, FullScreenWrapper } from '.';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from '@triplit/ui';
import { ServerOptionsMenu } from './server-options-menu';
import { useConnectionStatus, useEntity, useQueryOne } from '@triplit/react';
import { CreateCollectionDialog } from './create-collection-dialog';
import {
  CollectionStats,
  fetchCollectionStats,
  isServiceToken,
} from '../utils/remote-helpers';
import { useLoaderData, redirect, useSearchParams } from 'react-router-dom';
import { consoleClient } from 'triplit/client.js';
import {
  DEFAULT_HOST,
  initializeFromUrl,
  addServiceToken,
} from 'src/utils/server.js';
import { ModeToggle } from '@triplit/ui';
import { createCollection } from 'src/utils/schema.js';
import { useToast } from 'src/hooks/useToast.js';
import { Toaster } from './toaster.js';
import { AddTokenDialog } from './add-token-dialog.js';
import { KeyRound, EllipsisVertical, Trash2Icon } from 'lucide-react';
import { RoleCard } from './role-filters.js';
import { useServer, useTokens } from 'src/hooks/useServer.js';
import { useClient } from './client-context.js';

const initFromUrlPromise = initializeFromUrl();

const defaultToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6ImEgYiBjIiwiaWF0IjoxNzI1NDYyNDIwfQ.BSjFTWYBO-JDSnqQRZm29ygv8wy2m9rLsbN-uJvJ5wg';

export async function loader({ params }: { params: { serverHost?: string } }) {
  const { serverHost: slugServerHost } = params;
  const importedServerHost = await initFromUrlPromise;
  const serverHost =
    slugServerHost === 'local'
      ? DEFAULT_HOST
      : importedServerHost ?? slugServerHost;
  if (!serverHost) return redirect('/');
  const server = await consoleClient.fetchOne(
    consoleClient.query('servers').id(serverHost).include('tokens').build()
  );
  if (!server) return redirect('/');
  let { url, tokens } = server;
  if (tokens.length === 0) {
    console.error(`No tokens found for server with host [${serverHost}]`);
    return redirect('/');
  }
  const token =
    tokens.find((e) => e.id === 'service_' + serverHost)?.value ??
    tokens[0].value;
  const collectionStats = await fetchCollectionStats(server);
  return { collectionStats, url, token };
}

export type ConsoleQuery = {
  collection?: string | null;
  where?: QueryWhere<any, any> | null;
  order?: OrderStatement<any, any> | null;
  server?: string | null;
  token?: string | null;
  projName?: string | null;
};

export type SetConsoleQuery = (
  newQuery: Partial<ConsoleQuery>,
  merge?: boolean
) => void;

export function ServerViewerPage() {
  const [client, updateClientOptions] = useClient();
  const { url, token, collectionStats } = useLoaderData() as {
    url: string;
    token: string;
    collectionStats: CollectionStats[];
  };
  useEffect(() => {
    updateClientOptions({ serverUrl: url, token });
  }, [url, token]);
  const [urlQueryState, setUrlQueryState] = useSearchParams();

  const query: ConsoleQuery = useMemo(
    () => ({
      collection: urlQueryState.get('collection'),
      where: JSON.parse(urlQueryState.get('where') ?? '[]'),
      order: JSON.parse(urlQueryState.get('order') ?? '[]'),
      server: urlQueryState.get('server'),
      token: urlQueryState.get('token'),
      projName: urlQueryState.get('projName'),
    }),
    [urlQueryState]
  );

  const setQuery: SetConsoleQuery = useCallback(
    (newQuery, merge = true) => {
      if (!merge) {
        const { server, token, projName } = query;
        setUrlQueryState({ server, token, projName, ...newQuery });
        return;
      }
      const newState = { ...query, ...newQuery };
      for (const [key, val] of Object.entries(newState)) {
        if (val !== undefined && typeof val !== 'string')
          // @ts-expect-error
          newState[key as keyof ConsoleQuery] = JSON.stringify(
            newState[key as keyof ConsoleQuery]
          );
      }
      setUrlQueryState(newState);
    },
    [query, setUrlQueryState]
  );

  return (
    <div className="w-screen h-screen overflow-hidden">
      {!!client ? (
        <ServerViewer
          client={client}
          collectionStats={collectionStats}
          query={query}
          setQuery={setQuery}
          showMetaServerOptions={true}
        />
      ) : (
        <div>Could not load a client that matches your params</div>
      )}
    </div>
  );
}

export function ServerViewer({
  client,
  collectionStats,
  query,
  setQuery,
  showMetaServerOptions,
}: {
  client: TriplitClient<any>;
  collectionStats: CollectionStats[];
  query: ConsoleQuery;
  setQuery: SetConsoleQuery;
  showMetaServerOptions?: boolean;
}) {
  const [, updateClientOptions] = useClient();
  useEffect(() => {
    if (typeof window !== 'undefined') window.appClient = client;
  }, [client]);

  const { toast } = useToast();
  // const [client, setClient] = useState(injectedClient);
  const { result: server } = useServer(client.options?.serverUrl!);
  const { results: tokens } = useTokens(client.options?.serverUrl!);

  const connectionStatus = useConnectionStatus(client);
  useEffect(() => {
    client?.syncEngine.connect();
    const listener = client.onSyncMessageReceived((message) => {
      const hasTransactionFailures =
        message.type === 'ERROR' &&
        (message.payload?.metadata?.failures ?? []).length > 0;
      if (!hasTransactionFailures) return;
      const { failures } = message.payload.metadata as {
        failures: {
          error: { name: string; message: string; status: number };
          txId: string;
        }[];
      };
      failures.forEach(({ error, txId }) => {
        if (error.name === 'WritePermissionError') {
          toast({
            title: `WritePermissionError`,
            description:
              error.message +
              ' Use the Service key to bypass all permission checks.',
            variant: 'destructive',
          });
        }
        client.rollback(txId);
      });
    });
    return () => {
      client?.syncEngine.disconnect();
      listener();
    };
  }, [client]);

  useEffect(() => {
    addTokenFromClient(client);
  }, []);

  const { result: schema, fetching: fetchingSchema } = useEntity(
    client,
    '_metadata',
    '_schema'
  );

  const collectionsTolist = schema
    ? Object.keys(schema.collections)
    : collectionStats.map(({ collection }) => collection);

  const statsByCollection = useMemo(() => {
    return collectionStats.reduce((acc, { collection, numEntities }) => {
      acc[collection] = { numEntities };
      return acc;
    }, {} as Record<string, { numEntities: number }>);
  }, [collectionStats]);

  const selectedCollectionStats = statsByCollection[query.collection];

  // if loading render loading state
  if (!client) return <FullScreenWrapper>Loading...</FullScreenWrapper>;
  const shouldEnableCreateCollectionButton =
    schema || collectionsTolist.length === 0;
  // If client, render hooks that rely on client safely
  return (
    <div className="flex bg-popover w-full overflow-hidden h-full">
      <Toaster />
      <div className=" border-r flex flex-col p-4 w-[250px] shrink-0 overflow-y-auto">
        {showMetaServerOptions && server && (
          <ServerOptionsMenu>
            <Button variant="secondary" className="w-full h-[2.5rem] mb-4">
              <div className="font-bold truncate">{server.displayName}</div>
              <CaretDown className="ml-2 shrink-0" />
            </Button>
          </ServerOptionsMenu>
        )}
        <div
          className={cn(
            'text-xs py-1 px-2 w-max rounded transition-all',
            connectionStatus === 'OPEN'
              ? 'bg-green-200 text-green-700 dark:bg-green-950 dark:text-green-400 scale-100 mb-2'
              : 'bg-yellow-200 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-400 animate-pulse scale-125 mb-3'
          )}
        >
          {connectionStatus === 'OPEN' ? 'Connected' : 'Connecting'}
        </div>
        <div className="flex flex-row flex-wrap gap-2 mb-1"></div>
        <div className="flex flex-row items-center justify-between gap-2 md:gap-4 mb-4">
          <span className="truncate text-sm md:text-lg font-semibold">
            Tokens
          </span>
          <AddTokenDialog
            onSubmit={async (token, nickname) => {
              await consoleClient.insert('tokens', {
                serverUrl: client.options?.serverUrl!,
                value: token,
                name: nickname,
              });
              updateClientOptions({ token });
              // setClient(overwriteClient(token, client));
            }}
          />
        </div>
        {tokens?.map(({ value, name, id }) => {
          const isSelectedToken = client.token === value;
          const isServiceToken = id.startsWith('service_');
          return (
            <Fragment key={id}>
              <Button
                key={value}
                onClick={() => {
                  updateClientOptions({ token: value });
                  // setClient(overwriteClient(value, client));
                }}
                variant={isSelectedToken ? 'default' : 'ghost'}
                className={`group truncate flex h-auto px-2 py-1 flex-row items-center gap-2 justify-start shrink-0`}
              >
                <KeyRound
                  className="shrink-0 hidden md:inline-block"
                  size={20}
                />
                <span className="text-xs md:text-sm truncate w-full">{`${name}`}</span>
                {!isServiceToken && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="group-hover:visible invisible"
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <EllipsisVertical />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={async (e) => {
                          e.stopPropagation();
                          await consoleClient.delete('tokens', id);
                          if (isSelectedToken) {
                            // We should always have at least one token because you
                            // can't delete the service token so if this token
                            // just happens to be the first token then get
                            // the next token otherwise default to the first token
                            const tokenIterator = tokens.values();
                            let newToken = tokenIterator.next().value;
                            if (newToken.id === id) {
                              newToken = tokenIterator.next().value;
                            }
                            updateClientOptions({ token: newToken.value });
                          }
                        }}
                      >
                        <div className="hover:text-red-500 flex gap-1 items-center">
                          <Trash2Icon size="16px" />
                          {`Remove "${name}"`}
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </Button>
              {isSelectedToken &&
                client.db.sessionRoles &&
                client.db.sessionRoles.length > 0 && (
                  <div
                    className="flex flex-wrap flex-row gap-2 mt-2"
                    key={value + '_roles'}
                  >
                    {client.db.sessionRoles?.map((role) => (
                      <RoleCard key={role.key} role={role} />
                    ))}
                  </div>
                )}
            </Fragment>
          );
        })}

        <div className="flex flex-row items-center justify-between gap-2 md:gap-4 my-4">
          <span className="truncate text-sm md:text-lg font-semibold">
            Collections
          </span>
          <CreateCollectionDialog
            disabled={!shouldEnableCreateCollectionButton}
            onSubmit={async (collectionName) => {
              try {
                const error = await createCollection(client, collectionName, {
                  id: Schema.Id().toJSON(),
                });
                if (error) {
                  toast({
                    title: 'Error',
                    description: error,
                    variant: 'destructive',
                  });
                  return;
                }
                setQuery({ collection: collectionName }, false);
              } catch (e) {
                console.error(e);
              }
            }}
          />
        </div>
        {!fetchingSchema &&
          connectionStatus !== 'CONNECTING' &&
          collectionsTolist.map((collection) => (
            <Button
              key={collection}
              onClick={() => {
                setQuery({ collection }, false);
              }}
              variant={query.collection === collection ? 'default' : 'ghost'}
              className={`truncate flex h-auto px-2 py-1 flex-row items-center gap-2 justify-start shrink-0`}
            >
              <GridFour
                weight="light"
                className="shrink-0 hidden md:inline-block"
                size={24}
              />
              <span className="text-xs md:text-sm truncate">{`${collection}`}</span>
            </Button>
          ))}
        {!fetchingSchema &&
          connectionStatus !== 'CONNECTING' &&
          collectionsTolist.length === 0 && (
            <p className="text-xs">
              {
                'Looks like you haven’t added any data yet. Once there is data saved in your Triplit instance, your collections will show up here.'
              }
            </p>
          )}
        {showMetaServerOptions && (
          <>
            <div className="grow" />
            <ModeToggle className="" />
          </>
        )}
      </div>
      <div className="flex-grow flex flex-col min-w-0">
        {!fetchingSchema && query.collection ? (
          <DataViewer
            key={query.collection}
            client={client}
            schema={schema}
            stats={selectedCollectionStats}
            query={query}
            setQuery={setQuery}
          />
        ) : (
          <div className="flex flex-col h-full justify-center items-center gap-6">
            <Selection size={80} weight="thin" />
            No collection selected
          </div>
        )}
      </div>
    </div>
  );
}

function findStringBetween(str: string, start: string, end: string): string {
  const startIndex = str.indexOf(start) + start.length;
  const endIndex = str.indexOf(end, startIndex);
  return str.slice(startIndex, endIndex);
}

function addTokenFromClient(client: TriplitClient<any>) {
  const token = client.token;
  const serverUrl = client.options?.serverUrl;
  if (!(token && serverUrl)) return;
  consoleClient.transact(async (tx) => {
    const existingToken = await tx.fetchOne(
      consoleClient
        .query('tokens')
        .where([
          ['value', '=', token],
          ['serverUrl', '=', serverUrl],
        ])
        .build()
    );
    if (!existingToken) {
      const isService = isServiceToken(token);
      if (isService) {
        await addServiceToken(tx, serverUrl, token);
        return;
      }
      await tx.insert('tokens', {
        serverUrl,
        value: token,
        name: 'Default token',
      });
    }
  });
}
