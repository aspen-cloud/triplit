# Class: TriplitClient\<M\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](../modules.md#models)\<`any`, `any`\> \| `undefined` = `undefined` |

## Constructors

### constructor

• **new TriplitClient**\<`M`\>(`options?`): [`TriplitClient`](TriplitClient.md)\<`M`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends `undefined` \| [`Models`](../modules.md#models)\<`any`, `any`\> = `undefined` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `options?` | [`ClientOptions`](../interfaces/ClientOptions.md)\<`M`\> |

#### Returns

[`TriplitClient`](TriplitClient.md)\<`M`\>

#### Defined in

[client/src/triplit-client.ts:688](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L688)

## Properties

### authOptions

• **authOptions**: `AuthOptions`

#### Defined in

[client/src/triplit-client.ts:681](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L681)

___

### db

• **db**: `default`\<`M`\>

#### Defined in

[client/src/triplit-client.ts:679](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L679)

___

### defaultFetchOptions

• `Private` **defaultFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `fetch` | [`FetchOptions`](../modules.md#fetchoptions) |
| `subscription` | [`SubscriptionOptions`](../modules.md#subscriptionoptions) |

#### Defined in

[client/src/triplit-client.ts:683](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L683)

___

### syncEngine

• **syncEngine**: `SyncEngine`

#### Defined in

[client/src/triplit-client.ts:680](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L680)

## Methods

### delete

▸ **delete**\<`CN`\>(`collectionName`, `entityId`): `Promise`\<`undefined` \| `string`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CN` | extends `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `collectionName` | `CN` |
| `entityId` | `string` |

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Defined in

[client/src/triplit-client.ts:850](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L850)

___

### fetch

▸ **fetch**\<`CQ`\>(`query`, `options?`): `Promise`\<[`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CQ` | extends `Query`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `any`\>, `CQ`\> & \{ `collectionName`: `any`  } & \{ `syncStatus?`: [`SyncStatus`](../modules.md#syncstatus)  } |

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | `CQ` |
| `options?` | [`FetchOptions`](../modules.md#fetchoptions) |

#### Returns

`Promise`\<[`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>\>

#### Defined in

[client/src/triplit-client.ts:747](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L747)

___

### fetchById

▸ **fetchById**\<`CN`\>(`collectionName`, `id`, `options?`): `Promise`\<`undefined` \| [`ResultTypeFromModel`](../modules.md#resulttypefrommodel)\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CN` | extends `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `collectionName` | `CN` |
| `id` | `string` |
| `options?` | [`FetchOptions`](../modules.md#fetchoptions) |

#### Returns

`Promise`\<`undefined` \| [`ResultTypeFromModel`](../modules.md#resulttypefrommodel)\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>\>

#### Defined in

[client/src/triplit-client.ts:800](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L800)

___

### fetchLocal

▸ **fetchLocal**\<`CQ`\>(`query`): `Promise`\<[`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CQ` | extends `Query`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `any`\>, `CQ`\> & \{ `collectionName`: `any`  } & \{ `syncStatus?`: [`SyncStatus`](../modules.md#syncstatus)  } |

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | `CQ` |

#### Returns

`Promise`\<[`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>\>

#### Defined in

[client/src/triplit-client.ts:792](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L792)

___

### fetchOne

▸ **fetchOne**\<`CQ`\>(`query`, `options?`): `Promise`\<``null`` \| [`string`, [`ClientFetchResultEntity`](../modules.md#clientfetchresultentity)\<`CQ`\>]\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CQ` | extends `Query`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `any`\>, `CQ`\> & \{ `collectionName`: `any`  } & \{ `syncStatus?`: [`SyncStatus`](../modules.md#syncstatus)  } |

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | `CQ` |
| `options?` | [`FetchOptions`](../modules.md#fetchoptions) |

#### Returns

`Promise`\<``null`` \| [`string`, [`ClientFetchResultEntity`](../modules.md#clientfetchresultentity)\<`CQ`\>]\>

#### Defined in

[client/src/triplit-client.ts:810](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L810)

___

### insert

▸ **insert**\<`CN`\>(`collectionName`, `object`): `Promise`\<`undefined` \| `string`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CN` | extends `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `collectionName` | `CN` |
| `object` | `InsertTypeFromModel`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\> |

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Defined in

[client/src/triplit-client.ts:821](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L821)

___

### query

▸ **query**\<`CN`\>(`collectionName`): [`toBuilder`](../modules.md#tobuilder)\<[`ClientQuery`](../modules.md#clientquery)\<`M`, `CN`\>, ``"collectionName"``, \{ `order`: (...`args`: `OrderInput`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>) => `undefined` \| `QueryOrder`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>[] ; `where`: (...`args`: `FilterInput`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>) => `QueryWhere`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>  }\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CN` | extends `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `collectionName` | `CN` |

#### Returns

[`toBuilder`](../modules.md#tobuilder)\<[`ClientQuery`](../modules.md#clientquery)\<`M`, `CN`\>, ``"collectionName"``, \{ `order`: (...`args`: `OrderInput`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>) => `undefined` \| `QueryOrder`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>[] ; `where`: (...`args`: `FilterInput`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>) => `QueryWhere`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>  }\>

#### Defined in

[client/src/triplit-client.ts:741](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L741)

___

### subscribe

▸ **subscribe**\<`CQ`\>(`query`, `onResults`, `onError?`, `options?`): () => `void`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CQ` | extends `Query`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `any`\>, `CQ`\> & \{ `collectionName`: `any`  } & \{ `syncStatus?`: [`SyncStatus`](../modules.md#syncstatus)  } |

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | `CQ` |
| `onResults` | (`results`: [`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>, `info`: \{ `hasRemoteFulfilled`: `boolean`  }) => `void` |
| `onError?` | (`error`: `any`) => `void` |
| `options?` | [`SubscriptionOptions`](../modules.md#subscriptionoptions) |

#### Returns

`fn`

▸ (): `void`

##### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:864](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L864)

___

### transact

▸ **transact**(`callback`): `Promise`\<`undefined` \| `string`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `callback` | (`tx`: `DBTransaction`\<`M`\>) => `Promise`\<`void`\> |

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Defined in

[client/src/triplit-client.ts:730](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L730)

___

### update

▸ **update**\<`CN`\>(`collectionName`, `entityId`, `updater`): `Promise`\<`undefined` \| `string`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CN` | extends `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `collectionName` | `CN` |
| `entityId` | `string` |
| `updater` | (`entity`: `UpdateTypeFromModel`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>) => `void` \| `Promise`\<`void`\> |

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Defined in

[client/src/triplit-client.ts:834](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L834)

___

### updateAuthOptions

▸ **updateAuthOptions**(`options`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `options` | `Partial`\<`AuthOptions`\> |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:1006](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L1006)
