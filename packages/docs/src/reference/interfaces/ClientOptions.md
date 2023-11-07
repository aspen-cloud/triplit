# Interface: ClientOptions\<M\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](../modules.md#models)\<`any`, `any`\> \| `undefined` |

## Properties

### auth

• `Optional` **auth**: `AuthOptions`

#### Defined in

[client/src/triplit-client.ts:666](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L666)

___

### db

• `Optional` **db**: [`DBOptions`](DBOptions.md)\<`M`\>

#### Defined in

[client/src/triplit-client.ts:664](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L664)

___

### defaultFetchOptions

• `Optional` **defaultFetchOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `fetch?` | [`FetchOptions`](../modules.md#fetchoptions) |
| `subscription?` | [`SubscriptionOptions`](../modules.md#subscriptionoptions) |

#### Defined in

[client/src/triplit-client.ts:667](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L667)

___

### sync

• `Optional` **sync**: `Omit`\<[`SyncOptions`](SyncOptions.md), ``"apiKey"``\>

#### Defined in

[client/src/triplit-client.ts:665](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L665)
