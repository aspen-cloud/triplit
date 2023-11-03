# Interface: DBOptions\<M\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `M` | extends [`Models`](../modules.md#models)\<`any`, `any`\> \| `undefined` |

## Properties

### clientId

• `Optional` **clientId**: `string`

#### Defined in

[client/src/triplit-client.ts:579](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L579)

___

### migrations

• `Optional` **migrations**: [`Migration`](../modules.md#migration)[]

#### Defined in

[client/src/triplit-client.ts:573](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L573)

___

### schema

• `Optional` **schema**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `collections` | `NonNullable`\<`M`\> |
| `version?` | `number` |

#### Defined in

[client/src/triplit-client.ts:572](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L572)

___

### storage

• `Optional` **storage**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `cache?` | `Storage` |
| `outbox?` | `Storage` |

#### Defined in

[client/src/triplit-client.ts:575](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L575)

___

### variables

• `Optional` **variables**: `Record`\<`string`, `any`\>

#### Defined in

[client/src/triplit-client.ts:574](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L574)
