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

[packages/client/src/triplit-client.ts:216](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L216)

## Properties

### authOptions

• **authOptions**: `AuthOptions`

#### Defined in

[packages/client/src/triplit-client.ts:209](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L209)

___

### db

• **db**: `default`\<`M`\>

#### Defined in

[packages/client/src/triplit-client.ts:203](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L203)

___

### defaultFetchOptions

• `Private` **defaultFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `fetch` | [`FetchOptions`](../modules.md#fetchoptions) |
| `subscription` | [`SubscriptionOptions`](../modules.md#subscriptionoptions) |

#### Defined in

[packages/client/src/triplit-client.ts:211](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L211)

___

### syncEngine

• **syncEngine**: [`SyncEngine`](SyncEngine.md)

The sync engine is responsible for managing the connection to the server and syncing data

#### Defined in

[packages/client/src/triplit-client.ts:208](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L208)

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

[packages/client/src/triplit-client.ts:392](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L392)

___

### fetch

▸ **fetch**\<`CQ`\>(`query`, `options?`): `Promise`\<[`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CQ` | extends [`ClientQuery`](../modules.md#clientquery)\<`M`, `any`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | `CQ` |
| `options?` | [`FetchOptions`](../modules.md#fetchoptions) |

#### Returns

`Promise`\<[`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>\>

#### Defined in

[packages/client/src/triplit-client.ts:289](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L289)

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

[packages/client/src/triplit-client.ts:342](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L342)

___

### fetchLocal

▸ **fetchLocal**\<`CQ`\>(`query`): `Promise`\<[`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CQ` | extends [`ClientQuery`](../modules.md#clientquery)\<`M`, `any`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | `CQ` |

#### Returns

`Promise`\<[`ClientFetchResult`](../modules.md#clientfetchresult)\<`CQ`\>\>

#### Defined in

[packages/client/src/triplit-client.ts:334](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L334)

___

### fetchOne

▸ **fetchOne**\<`CQ`\>(`query`, `options?`): `Promise`\<``null`` \| [`string`, `ClientFetchResultEntity`\<`CQ`\>]\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CQ` | extends [`ClientQuery`](../modules.md#clientquery)\<`M`, `any`\> |

#### Parameters

| Name | Type |
| :------ | :------ |
| `query` | `CQ` |
| `options?` | [`FetchOptions`](../modules.md#fetchoptions) |

#### Returns

`Promise`\<``null`` \| [`string`, `ClientFetchResultEntity`\<`CQ`\>]\>

#### Defined in

[packages/client/src/triplit-client.ts:352](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L352)

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

[packages/client/src/triplit-client.ts:363](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L363)

___

### query

▸ **query**\<`CN`\>(`collectionName`): `toBuilder`\<[`ClientQuery`](../modules.md#clientquery)\<`M`, `CN`\>, ``"collectionName"``, `QUERY_INPUT_TRANSFORMERS`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CN` | extends `any` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `collectionName` | `CN` |

#### Returns

`toBuilder`\<[`ClientQuery`](../modules.md#clientquery)\<`M`, `CN`\>, ``"collectionName"``, `QUERY_INPUT_TRANSFORMERS`\<[`ModelFromModels`](../modules.md#modelfrommodels)\<`M`, `CN`\>\>\>

#### Defined in

[packages/client/src/triplit-client.ts:283](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L283)

___

### subscribe

▸ **subscribe**\<`CQ`\>(`query`, `onResults`, `onError?`, `options?`): () => `void`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `CQ` | extends [`ClientQuery`](../modules.md#clientquery)\<`M`, `any`\> |

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

[packages/client/src/triplit-client.ts:406](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L406)

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

[packages/client/src/triplit-client.ts:272](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L272)

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

[packages/client/src/triplit-client.ts:376](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L376)

___

### updateOptions

▸ **updateOptions**(`options`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `options` | `Pick`\<[`ClientOptions`](../interfaces/ClientOptions.md)\<`M`\>, ``"token"`` \| ``"serverUrl"``\> |

#### Returns

`void`

#### Defined in

[packages/client/src/triplit-client.ts:548](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L548)

___

### updateServerUrl

▸ **updateServerUrl**(`serverUrl`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `serverUrl` | `string` |

#### Returns

`void`

#### Defined in

[packages/client/src/triplit-client.ts:582](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L582)

___

### updateToken

▸ **updateToken**(`token`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `token` | `string` |

#### Returns

`void`

#### Defined in

[packages/client/src/triplit-client.ts:578](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L578)
