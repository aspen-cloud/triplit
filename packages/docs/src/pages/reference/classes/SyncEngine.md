# Class: SyncEngine

The SyncEngine is responsible for managing the connection to the server and syncing data

## Constructors

### constructor

• **new SyncEngine**(`options`, `db`): [`SyncEngine`](SyncEngine.md)

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `options` | [`SyncOptions`](../interfaces/SyncOptions.md) | configuration options for the sync engine |
| `db` | `default`\<`any`\> | the client database to be synced |

#### Returns

[`SyncEngine`](SyncEngine.md)

#### Defined in

[packages/client/src/sync-engine.ts:60](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L60)

## Properties

### commitCallbacks

• `Private` **commitCallbacks**: `Map`\<`string`, `Set`\<() => `void`\>\>

#### Defined in

[packages/client/src/sync-engine.ts:172](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L172)

___

### connectionChangeHandlers

• `Private` **connectionChangeHandlers**: `Set`\<(`status`: `undefined` \| [`ConnectionStatus`](../modules.md#connectionstatus)) => `void`\>

#### Defined in

[packages/client/src/sync-engine.ts:47](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L47)

___

### db

• `Private` **db**: `default`\<`any`\>

#### Defined in

[packages/client/src/sync-engine.ts:44](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L44)

___

### failureCallbacks

• `Private` **failureCallbacks**: `Map`\<`string`, `Set`\<(`e`: `unknown`) => `void`\>\>

#### Defined in

[packages/client/src/sync-engine.ts:173](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L173)

___

### queries

• `Private` **queries**: `Map`\<`string`, \{ `fulfilled`: `boolean` ; `params`: `CollectionQuery`\<`any`, `any`\>  }\>

#### Defined in

[packages/client/src/sync-engine.ts:36](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L36)

___

### queryFulfillmentCallbacks

• `Private` **queryFulfillmentCallbacks**: `Map`\<`string`, (`response`: `any`) => `void`\>

#### Defined in

[packages/client/src/sync-engine.ts:51](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L51)

___

### reconnectTimeout

• `Private` **reconnectTimeout**: `any`

#### Defined in

[packages/client/src/sync-engine.ts:42](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L42)

___

### reconnectTimeoutDelay

• `Private` **reconnectTimeoutDelay**: `number` = `250`

#### Defined in

[packages/client/src/sync-engine.ts:41](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L41)

___

### syncOptions

• `Private` **syncOptions**: [`SyncOptions`](../interfaces/SyncOptions.md)

#### Defined in

[packages/client/src/sync-engine.ts:45](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L45)

___

### transport

• `Private` **transport**: [`SyncTransport`](../interfaces/SyncTransport.md)

#### Defined in

[packages/client/src/sync-engine.ts:34](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L34)

___

### txCommits$

• `Private` **txCommits$**: `Subject`\<`string`\>

#### Defined in

[packages/client/src/sync-engine.ts:52](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L52)

___

### txFailures$

• `Private` **txFailures$**: `Subject`\<\{ `error`: `unknown` ; `txId`: `string`  }\>

#### Defined in

[packages/client/src/sync-engine.ts:53](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L53)

## Accessors

### connectionStatus

• `get` **connectionStatus**(): `undefined` \| [`ConnectionStatus`](../modules.md#connectionstatus)

The current connection status of the sync engine

#### Returns

`undefined` \| [`ConnectionStatus`](../modules.md#connectionstatus)

#### Defined in

[packages/client/src/sync-engine.ts:342](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L342)

___

### httpUri

• `get` **httpUri**(): `undefined` \| `string`

#### Returns

`undefined` \| `string`

#### Defined in

[packages/client/src/sync-engine.ts:95](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L95)

___

### token

• `get` **token**(): `undefined` \| `string`

The token used to authenticate with the server

#### Returns

`undefined` \| `string`

#### Defined in

[packages/client/src/sync-engine.ts:91](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L91)

## Methods

### closeConnection

▸ **closeConnection**(`code?`, `reason?`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `code?` | `number` |
| `reason?` | `string` |

#### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:456](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L456)

___

### connect

▸ **connect**(): `Promise`\<`void`\>

Initiate a sync connection with the server

#### Returns

`Promise`\<`void`\>

#### Defined in

[packages/client/src/sync-engine.ts:212](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L212)

___

### disconnect

▸ **disconnect**(): `void`

Disconnect from the server

#### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:365](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L365)

___

### fetchFromServer

▸ **fetchFromServer**(`path`, `init?`): `Promise`\<`Response`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `path` | `string` |
| `init?` | `RequestInit` |

#### Returns

`Promise`\<`Response`\>

#### Defined in

[packages/client/src/sync-engine.ts:524](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L524)

___

### getConnectionParams

▸ **getConnectionParams**(): `Promise`\<[`TransportConnectParams`](../modules.md#transportconnectparams)\>

#### Returns

`Promise`\<[`TransportConnectParams`](../modules.md#transportconnectparams)\>

#### Defined in

[packages/client/src/sync-engine.ts:103](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L103)

___

### getRemoteTriples

▸ **getRemoteTriples**(`query`): `Promise`\<`any`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | [`ClientQuery`](../modules.md#clientquery)\<`any`, `any`\> |

#### Returns

`Promise`\<`any`\>

#### Defined in

[packages/client/src/sync-engine.ts:509](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L509)

___

### handleErrorMessage

▸ **handleErrorMessage**(`message`): `Promise`\<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `message` | `any` |

#### Returns

`Promise`\<`void`\>

#### Defined in

[packages/client/src/sync-engine.ts:372](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L372)

___

### hasQueryBeenFulfilled

▸ **hasQueryBeenFulfilled**(`queryId`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `queryId` | `string` |

#### Returns

`boolean`

#### Defined in

[packages/client/src/sync-engine.ts:160](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L160)

___

### onConnectionStatusChange

▸ **onConnectionStatusChange**(`callback`, `runImmediately?`): () => `void`

Sets up a listener for connection status changes

#### Parameters

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `callback` | (`status`: `undefined` \| [`ConnectionStatus`](../modules.md#connectionstatus)) => `void` | `undefined` | A callback that will be called when the connection status changes |
| `runImmediately` | `boolean` | `false` | Run the callback immediately with the current connection status |

#### Returns

`fn`

A function that removes the callback from the connection status change listeners

▸ (): `void`

##### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:445](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L445)

___

### onQueryFulfilled

▸ **onQueryFulfilled**(`queryId`, `callback`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `queryId` | `string` |
| `callback` | (`response`: `any`) => `void` |

#### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:156](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L156)

___

### onTxCommit

▸ **onTxCommit**(`txId`, `callback`): () => `void`

When a transaction has been confirmed by the remote database, the callback will be called

#### Parameters

| Name | Type |
| :------ | :------ |
| `txId` | `string` |
| `callback` | () => `void` |

#### Returns

`fn`

a function removing the listener callback

▸ (): `void`

##### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:181](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L181)

___

### onTxFailure

▸ **onTxFailure**(`txId`, `callback`): () => `void`

If a transaction fails to commit on the remote database, the callback will be called

#### Parameters

| Name | Type |
| :------ | :------ |
| `txId` | `string` |
| `callback` | (`e`: `unknown`) => `void` |

#### Returns

`fn`

a function removing the listener callback

▸ (): `void`

##### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:196](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L196)

___

### resetReconnectTimeout

▸ **resetReconnectTimeout**(): `void`

#### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:463](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L463)

___

### retry

▸ **retry**(`txId`): `Promise`\<`void`\>

Retry sending a transaciton to the remote database. This is commonly used when a transaction fails to commit on the remote database in the `onTxFailure` callback.

#### Parameters

| Name | Type |
| :------ | :------ |
| `txId` | `string` |

#### Returns

`Promise`\<`void`\>

#### Defined in

[packages/client/src/sync-engine.ts:408](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L408)

___

### rollback

▸ **rollback**(`txIds`): `Promise`\<`void`\>

Rollback a transaction from the client database. It will no longer be sent to the remote database as a part of the syncing process. This is commonly used when a transaction fails to commit on the remote database in the `onTxFailure` callback.

#### Parameters

| Name | Type |
| :------ | :------ |
| `txIds` | `string` \| `string`[] |

#### Returns

`Promise`\<`void`\>

#### Defined in

[packages/client/src/sync-engine.ts:420](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L420)

___

### sendTriples

▸ **sendTriples**(`triples`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `triples` | `TripleRow`[] |

#### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:396](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L396)

___

### setupWindowListeners

▸ **setupWindowListeners**(): `Promise`\<`void`\>

#### Returns

`Promise`\<`void`\>

#### Defined in

[packages/client/src/sync-engine.ts:118](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L118)

___

### signalOutboxTriples

▸ **signalOutboxTriples**(): `void`

#### Returns

`void`

#### Defined in

[packages/client/src/sync-engine.ts:205](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/sync-engine.ts#L205)
