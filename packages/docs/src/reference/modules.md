# @triplit/client - v0.1.0

## Classes

- [Schema](classes/Schema.md)
- [TriplitClient](classes/TriplitClient.md)

## Interfaces

- [ClientOptions](interfaces/ClientOptions.md)
- [DBOptions](interfaces/DBOptions.md)
- [SyncOptions](interfaces/SyncOptions.md)
- [SyncTransport](interfaces/SyncTransport.md)

## Type Aliases

### ClientFetchResult

Ƭ **ClientFetchResult**\<`C`\>: `Map`\<`string`, [`ClientFetchResultEntity`](modules.md#clientfetchresultentity)\<`C`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `C` | extends [`ClientQuery`](modules.md#clientquery)\<`any`, `any`\> |

#### Defined in

[client/src/triplit-client.ts:50](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L50)

___

### ClientFetchResultEntity

Ƭ **ClientFetchResultEntity**\<`C`\>: `C` extends [`ClientQuery`](modules.md#clientquery)\<infer M, infer CN\> ? [`ResultTypeFromModel`](modules.md#resulttypefrommodel)\<[`ModelFromModels`](modules.md#modelfrommodels)\<`M`, `CN`\>\> : `never`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `C` | extends [`ClientQuery`](modules.md#clientquery)\<`any`, `any`\> |

#### Defined in

[client/src/triplit-client.ts:55](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L55)

___

### ClientQuery

Ƭ **ClientQuery**\<`M`, `CN`\>: [`CollectionQuery`](modules.md#collectionquery)\<`M`, `CN`\> & \{ `syncStatus?`: [`SyncStatus`](modules.md#syncstatus)  }

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |
| `CN` | extends [`CollectionNameFromModels`](modules.md#collectionnamefrommodels)\<`M`\> |

#### Defined in

[client/src/triplit-client.ts:584](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L584)

___

### ClientQueryBuilder

Ƭ **ClientQueryBuilder**\<`M`, `CN`\>: `ReturnType`\<typeof [`ClientQueryBuilder`](modules.md#clientquerybuilder)\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |
| `CN` | extends [`CollectionNameFromModels`](modules.md#collectionnamefrommodels)\<`M`\> |

#### Defined in

[client/src/triplit-client.ts:616](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L616)

___

### CollectionNameFromModels

Ƭ **CollectionNameFromModels**\<`M`\>: `M` extends [`Models`](modules.md#models)\<`any`, `any`\> ? keyof `M` : `M` extends `undefined` ? `string` : `never`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |

#### Defined in

db/dist/types/db.d.ts:113

___

### CollectionQuery

Ƭ **CollectionQuery**\<`M`, `CN`\>: `Query`\<[`ModelFromModels`](modules.md#modelfrommodels)\<`M`, `CN`\>\> & \{ `collectionName`: `CN`  }

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |
| `CN` | extends [`CollectionNameFromModels`](modules.md#collectionnamefrommodels)\<`M`\> |

#### Defined in

db/dist/types/collection-query.d.ts:10

___

### FetchOptions

Ƭ **FetchOptions**: [`LocalFirstFetchOptions`](modules.md#localfirstfetchoptions) \| [`LocalOnlyFetchOptions`](modules.md#localonlyfetchoptions) \| [`RemoteFirstFetchOptions`](modules.md#remotefirstfetchoptions) \| [`RemoteOnlyFetchOptions`](modules.md#remoteonlyfetchoptions) \| [`LocalAndRemoteFetchOptions`](modules.md#localandremotefetchoptions)

#### Defined in

[client/src/triplit-client.ts:650](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L650)

___

### LocalAndRemoteFetchOptions

Ƭ **LocalAndRemoteFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"local-and-remote"`` |
| `timeout?` | `number` |

#### Defined in

[client/src/triplit-client.ts:646](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L646)

___

### LocalFirstFetchOptions

Ƭ **LocalFirstFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"local-first"`` |

#### Defined in

[client/src/triplit-client.ts:634](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L634)

___

### LocalOnlyFetchOptions

Ƭ **LocalOnlyFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"local-only"`` |

#### Defined in

[client/src/triplit-client.ts:637](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L637)

___

### Migration

Ƭ **Migration**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `down` | `DBOperation`[] |
| `name` | `string` |
| `parent` | `number` |
| `up` | `DBOperation`[] |
| `version` | `number` |

#### Defined in

db/dist/types/db.d.ts:88

___

### Model

Ƭ **Model**\<`T`\>: [`__type`](classes/Schema.md#__type)\<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends `SchemaConfig` |

#### Defined in

db/dist/types/schema.d.ts:47

___

### ModelFromModels

Ƭ **ModelFromModels**\<`M`, `CN`\>: `M` extends [`Models`](modules.md#models)\<`any`, `any`\> ? `M`[`CN`][``"schema"``] : `M` extends `undefined` ? `undefined` : `never`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](modules.md#models)\<`any`, `any`\> \| `undefined` |
| `CN` | extends [`CollectionNameFromModels`](modules.md#collectionnamefrommodels)\<`M`\> = `any` |

#### Defined in

db/dist/types/db.d.ts:112

___

### Models

Ƭ **Models**\<`CollectionName`, `T`\>: `Record`\<`CollectionName`, `Collection`\<`T`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CollectionName` | extends `string` |
| `T` | extends `SchemaConfig` |

#### Defined in

db/dist/types/schema.d.ts:52

___

### RemoteFirstFetchOptions

Ƭ **RemoteFirstFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"remote-first"`` |

#### Defined in

[client/src/triplit-client.ts:640](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L640)

___

### RemoteOnlyFetchOptions

Ƭ **RemoteOnlyFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `policy` | ``"remote-only"`` |

#### Defined in

[client/src/triplit-client.ts:643](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L643)

___

### ResultTypeFromModel

Ƭ **ResultTypeFromModel**\<`M`\>: `M` extends [`Model`](modules.md#model)\<`any`\> ? \{ [k in keyof ReadModelFromModel\<M\>["properties"]]: M["properties"][k] extends DataType ? ExtractJSType\<M["properties"][k]\> : never } : `any`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Model`](modules.md#model)\<`any`\> \| `undefined` |

#### Defined in

db/dist/types/schema.d.ts:71

___

### SubscriptionOptions

Ƭ **SubscriptionOptions**: [`LocalFirstFetchOptions`](modules.md#localfirstfetchoptions) \| [`LocalOnlyFetchOptions`](modules.md#localonlyfetchoptions) \| [`RemoteFirstFetchOptions`](modules.md#remotefirstfetchoptions) \| [`LocalAndRemoteFetchOptions`](modules.md#localandremotefetchoptions)

#### Defined in

[client/src/triplit-client.ts:657](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L657)

___

### SyncStatus

Ƭ **SyncStatus**: ``"pending"`` \| ``"confirmed"`` \| ``"all"``

#### Defined in

[client/src/triplit-client.ts:582](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L582)

___

### TransportConnectParams

Ƭ **TransportConnectParams**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `apiKey?` | `string` |
| `clientId` | `string` |
| `schema?` | `number` |
| `secure?` | `boolean` |
| `server?` | `string` |
| `syncSchema?` | `boolean` |

#### Defined in

[client/src/triplit-client.ts:60](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L60)

___

### toBuilder

Ƭ **toBuilder**\<`Data`, `ProtectedField`, `CustomInputs`\>: \{ [K in keyof Omit\<Required\<Data\>, ProtectedField\>]: Function } & \{ `build`: () => `Data`  }

#### Type parameters

| Name | Type |
| :------ | :------ |
| `Data` | extends `Object` |
| `ProtectedField` | extends keyof `Data` = `never` |
| `CustomInputs` | extends \{ [key in keyof Omit\<Partial\<Data\>, ProtectedField\>]: Function } = `never` |

#### Defined in

db/dist/types/utils/builder.d.ts:3
