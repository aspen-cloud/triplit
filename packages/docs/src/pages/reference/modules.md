# @triplit/client - v0.2.1

## Classes

- [MissingConnectionInformationError](classes/MissingConnectionInformationError.md)
- [RemoteFetchFailedError](classes/RemoteFetchFailedError.md)
- [RemoteSyncFailedError](classes/RemoteSyncFailedError.md)
- [SyncEngine](classes/SyncEngine.md)
- [TriplitClient](classes/TriplitClient.md)
- [UnrecognizedFetchPolicyError](classes/UnrecognizedFetchPolicyError.md)

## Interfaces

- [ClientOptions](interfaces/ClientOptions.md)
- [SyncOptions](interfaces/SyncOptions.md)
- [SyncTransport](interfaces/SyncTransport.md)

## Type Aliases

### ClientFetchResult

Ƭ **ClientFetchResult**\<`C`\>: `Map`\<`string`, `ClientFetchResultEntity`\<`C`\>\>

Results from a query based on the query's model in the format `Map<id, entity>`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `C` | extends [`ClientQuery`](modules.md#clientquery)\<`any`, `any`\> |

#### Defined in

[packages/client/src/triplit-client.ts:38](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L38)

___

### ClientQuery

Ƭ **ClientQuery**\<`M`, `CN`\>: `CollectionQuery`\<`M`, `CN`\> & \{ `syncStatus?`: [`SyncStatus`](modules.md#syncstatus)  }

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |
| `CN` | extends [`CollectionNameFromModels`](modules.md#collectionnamefrommodels)\<`M`\> |

#### Defined in

[packages/client/src/triplit-client.ts:67](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L67)

___

### ClientQueryBuilder

Ƭ **ClientQueryBuilder**\<`M`, `CN`\>: `ReturnType`\<typeof [`ClientQueryBuilder`](modules.md#clientquerybuilder)\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |
| `CN` | extends [`CollectionNameFromModels`](modules.md#collectionnamefrommodels)\<`M`\> |

#### Defined in

[packages/client/src/triplit-client.ts:99](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L99)

___

### CollectionNameFromModels

Ƭ **CollectionNameFromModels**\<`M`\>: `M` extends [`Models`](modules.md#models)\<`any`, `any`\> ? keyof `M` : `M` extends `undefined` ? `string` : `never`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |

#### Defined in

packages/db/dist/types/db.d.ts:113

___

### ConnectionStatus

Ƭ **ConnectionStatus**: ``"CONNECTING"`` \| ``"OPEN"`` \| ``"CLOSING"`` \| ``"CLOSED"``

Possible values reflect the WebSocket readyState: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState

- CONNECTING: An attempt to connect is being made
- OPEN: The connection is open and ready to communicate
- CLOSING: The connection is in the process of closing
- CLOSED: The connection is closed or couldn't be opened

#### Defined in

[packages/client/src/transport/transport.ts:11](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L11)

___

### FetchOptions

Ƭ **FetchOptions**: [`LocalFirstFetchOptions`](modules.md#localfirstfetchoptions) \| [`LocalOnlyFetchOptions`](modules.md#localonlyfetchoptions) \| [`RemoteFirstFetchOptions`](modules.md#remotefirstfetchoptions) \| [`RemoteOnlyFetchOptions`](modules.md#remoteonlyfetchoptions) \| [`LocalAndRemoteFetchOptions`](modules.md#localandremotefetchoptions)

#### Defined in

[packages/client/src/triplit-client.ts:133](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L133)

___

### LocalAndRemoteFetchOptions

Ƭ **LocalAndRemoteFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"local-and-remote"`` |
| `timeout?` | `number` |

#### Defined in

[packages/client/src/triplit-client.ts:129](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L129)

___

### LocalFirstFetchOptions

Ƭ **LocalFirstFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"local-first"`` |

#### Defined in

[packages/client/src/triplit-client.ts:117](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L117)

___

### LocalOnlyFetchOptions

Ƭ **LocalOnlyFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"local-only"`` |

#### Defined in

[packages/client/src/triplit-client.ts:120](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L120)

___

### ModelFromModels

Ƭ **ModelFromModels**\<`M`, `CN`\>: `M` extends [`Models`](modules.md#models)\<`any`, `any`\> ? `M`[`CN`][``"schema"``] : `M` extends `undefined` ? `undefined` : `never`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |
| `CN` | extends [`CollectionNameFromModels`](modules.md#collectionnamefrommodels)\<`M`\> = `any` |

#### Defined in

packages/db/dist/types/db.d.ts:112

___

### Models

Ƭ **Models**\<`CollectionName`, `T`\>: `Record`\<`CollectionName`, `Collection`\<`T`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CollectionName` | extends `string` |
| `T` | extends `SchemaConfig` |

#### Defined in

packages/db/dist/types/schema.d.ts:52

___

### RemoteFirstFetchOptions

Ƭ **RemoteFirstFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"remote-first"`` |

#### Defined in

[packages/client/src/triplit-client.ts:123](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L123)

___

### RemoteOnlyFetchOptions

Ƭ **RemoteOnlyFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"remote-only"`` |

#### Defined in

[packages/client/src/triplit-client.ts:126](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L126)

___

### ResultTypeFromModel

Ƭ **ResultTypeFromModel**\<`M`\>: `M` extends `Model`\<`any`\> ? \{ [k in keyof ReadModelFromModel\<M\>["properties"]]: M["properties"][k] extends DataType ? ExtractJSType\<M["properties"][k]\> : never } : `any`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends `Model`\<`any`\> \| `undefined` |

#### Defined in

packages/db/dist/types/schema.d.ts:71

___

### SubscriptionOptions

Ƭ **SubscriptionOptions**: [`LocalFirstFetchOptions`](modules.md#localfirstfetchoptions) \| [`LocalOnlyFetchOptions`](modules.md#localonlyfetchoptions) \| [`RemoteFirstFetchOptions`](modules.md#remotefirstfetchoptions) \| [`LocalAndRemoteFetchOptions`](modules.md#localandremotefetchoptions)

#### Defined in

[packages/client/src/triplit-client.ts:140](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L140)

___

### SyncStatus

Ƭ **SyncStatus**: ``"pending"`` \| ``"confirmed"`` \| ``"all"``

#### Defined in

[packages/client/src/triplit-client.ts:65](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L65)

___

### TransportConnectParams

Ƭ **TransportConnectParams**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `clientId` | `string` |
| `schema?` | `number` |
| `secure?` | `boolean` |
| `server?` | `string` |
| `syncSchema?` | `boolean` |
| `token?` | `string` |

#### Defined in

[packages/client/src/transport/transport.ts:29](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L29)
