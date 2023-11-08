# Class: UnrecognizedFetchPolicyError

## Hierarchy

- `TriplitError`

  ↳ **`UnrecognizedFetchPolicyError`**

## Constructors

### constructor

• **new UnrecognizedFetchPolicyError**(`policy`, `...args`): [`UnrecognizedFetchPolicyError`](UnrecognizedFetchPolicyError.md)

#### Parameters

| Name | Type |
| :------ | :------ |
| `policy` | `string` |
| `...args` | `any`[] |

#### Returns

[`UnrecognizedFetchPolicyError`](UnrecognizedFetchPolicyError.md)

#### Overrides

TriplitError.constructor

#### Defined in

[packages/client/src/errors.ts:4](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/errors.ts#L4)

## Properties

### cause

• `Optional` **cause**: `unknown`

#### Inherited from

TriplitError.cause

#### Defined in

node_modules/typescript/lib/lib.es2022.error.d.ts:24

___

### contextMessage

• `Optional` **contextMessage**: `string`

#### Inherited from

TriplitError.contextMessage

#### Defined in

packages/db/dist/types/errors.d.ts:16

___

### message

• **message**: `string`

#### Inherited from

TriplitError.message

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:1068

___

### name

• **name**: `string`

#### Inherited from

TriplitError.name

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:1067

___

### stack

• `Optional` **stack**: `string`

#### Inherited from

TriplitError.stack

#### Defined in

node_modules/typescript/lib/lib.es5.d.ts:1069

___

### status

• **status**: `number`

#### Inherited from

TriplitError.status

#### Defined in

packages/db/dist/types/errors.d.ts:15

___

### prepareStackTrace

▪ `Static` `Optional` **prepareStackTrace**: (`err`: `Error`, `stackTraces`: `CallSite`[]) => `any`

#### Type declaration

▸ (`err`, `stackTraces`): `any`

Optional override for formatting stack traces

##### Parameters

| Name | Type |
| :------ | :------ |
| `err` | `Error` |
| `stackTraces` | `CallSite`[] |

##### Returns

`any`

**`See`**

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Inherited from

TriplitError.prepareStackTrace

#### Defined in

packages/client/node_modules/@types/node/globals.d.ts:11

___

### stackTraceLimit

▪ `Static` **stackTraceLimit**: `number`

#### Inherited from

TriplitError.stackTraceLimit

#### Defined in

packages/client/node_modules/@types/node/globals.d.ts:13

## Methods

### toJSON

▸ **toJSON**(): `Object`

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `contextMessage` | `undefined` \| `string` |
| `message` | `string` |
| `name` | `string` |
| `status` | `number` |

#### Inherited from

TriplitError.toJSON

#### Defined in

packages/db/dist/types/errors.d.ts:19

___

### toString

▸ **toString**(): `string`

#### Returns

`string`

#### Inherited from

TriplitError.toString

#### Defined in

packages/db/dist/types/errors.d.ts:18

___

### captureStackTrace

▸ **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Create .stack property on a target object

#### Parameters

| Name | Type |
| :------ | :------ |
| `targetObject` | `object` |
| `constructorOpt?` | `Function` |

#### Returns

`void`

#### Inherited from

TriplitError.captureStackTrace

#### Defined in

packages/client/node_modules/@types/node/globals.d.ts:4
