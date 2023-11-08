# Interface: ClientOptions\<M\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](../modules.md#models)\<`any`, `any`\> \| `undefined` |

## Properties

### claimsPath

• `Optional` **claimsPath**: `string`

#### Defined in

[packages/client/src/triplit-client.ts:180](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L180)

___

### clientId

• `Optional` **clientId**: `string`

#### Defined in

[packages/client/src/triplit-client.ts:188](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L188)

___

### defaultQueryOptions

• `Optional` **defaultQueryOptions**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `fetch?` | [`FetchOptions`](../modules.md#fetchoptions) |
| `subscription?` | [`SubscriptionOptions`](../modules.md#subscriptionoptions) |

#### Defined in

[packages/client/src/triplit-client.ts:191](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L191)

___

### migrations

• `Optional` **migrations**: `Migration`[]

#### Defined in

[packages/client/src/triplit-client.ts:183](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L183)

___

### schema

• `Optional` **schema**: `M`

#### Defined in

[packages/client/src/triplit-client.ts:178](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L178)

___

### serverUrl

• `Optional` **serverUrl**: `string`

#### Defined in

[packages/client/src/triplit-client.ts:182](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L182)

___

### storage

• `Optional` **storage**: `StorageOptions`

#### Defined in

[packages/client/src/triplit-client.ts:189](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L189)

___

### syncSchema

• `Optional` **syncSchema**: `boolean`

#### Defined in

[packages/client/src/triplit-client.ts:184](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L184)

___

### token

• `Optional` **token**: `string`

#### Defined in

[packages/client/src/triplit-client.ts:179](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L179)

___

### transport

• `Optional` **transport**: [`SyncTransport`](SyncTransport.md)

#### Defined in

[packages/client/src/triplit-client.ts:185](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L185)

___

### variables

• `Optional` **variables**: `Record`\<`string`, `any`\>

#### Defined in

[packages/client/src/triplit-client.ts:187](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/triplit-client.ts#L187)
