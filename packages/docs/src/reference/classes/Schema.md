# Class: Schema

## Constructors

### constructor

• **new Schema**(): [`Schema`](Schema.md)

#### Returns

[`Schema`](Schema.md)

## Properties

### Boolean

▪ `Static` **Boolean**: \<TypeOptions\>(`options?`: `TypeOptions`) => [`__type`](Schema.md#__type)\<`TypeOptions`\>

#### Type declaration

▸ \<`TypeOptions`\>(`options?`): [`__type`](Schema.md#__type)\<`TypeOptions`\>

##### Type parameters

| Name | Type |
| :------ | :------ |
| `TypeOptions` | extends `Object` = {} |

##### Parameters

| Name | Type |
| :------ | :------ |
| `options?` | `TypeOptions` |

##### Returns

[`__type`](Schema.md#__type)\<`TypeOptions`\>

#### Defined in

db/dist/types/schema.d.ts:27

___

### Date

▪ `Static` **Date**: \<TypeOptions\>(`options?`: `TypeOptions`) => [`__type`](Schema.md#__type)\<`TypeOptions`\>

#### Type declaration

▸ \<`TypeOptions`\>(`options?`): [`__type`](Schema.md#__type)\<`TypeOptions`\>

##### Type parameters

| Name | Type |
| :------ | :------ |
| `TypeOptions` | extends `Object` = {} |

##### Parameters

| Name | Type |
| :------ | :------ |
| `options?` | `TypeOptions` |

##### Returns

[`__type`](Schema.md#__type)\<`TypeOptions`\>

#### Defined in

db/dist/types/schema.d.ts:28

___

### Id

▪ `Static` **Id**: () => [`__type`](Schema.md#__type)\<\{ `default`: \{ `args`: ``null`` \| `string`[] ; `func`: `string`  } ; `nullable`: ``false``  }\>

#### Type declaration

▸ (): [`__type`](Schema.md#__type)\<\{ `default`: \{ `args`: ``null`` \| `string`[] ; `func`: `string`  } ; `nullable`: ``false``  }\>

##### Returns

[`__type`](Schema.md#__type)\<\{ `default`: \{ `args`: ``null`` \| `string`[] ; `func`: `string`  } ; `nullable`: ``false``  }\>

#### Defined in

db/dist/types/schema.d.ts:18

___

### Number

▪ `Static` **Number**: \<TypeOptions\>(`options?`: `TypeOptions`) => [`__type`](Schema.md#__type)\<`TypeOptions`\>

#### Type declaration

▸ \<`TypeOptions`\>(`options?`): [`__type`](Schema.md#__type)\<`TypeOptions`\>

##### Type parameters

| Name | Type |
| :------ | :------ |
| `TypeOptions` | extends `Object` = {} |

##### Parameters

| Name | Type |
| :------ | :------ |
| `options?` | `TypeOptions` |

##### Returns

[`__type`](Schema.md#__type)\<`TypeOptions`\>

#### Defined in

db/dist/types/schema.d.ts:26

___

### Query

▪ `Static` **Query**: \<Q\>(`query`: `Q`) => [`__type`](Schema.md#__type)\<`Q`\>

#### Type declaration

▸ \<`Q`\>(`query`): [`__type`](Schema.md#__type)\<`Q`\>

##### Type parameters

| Name | Type |
| :------ | :------ |
| `Q` | extends `SubQuery`\<`any`, `any`\> |

##### Parameters

| Name | Type |
| :------ | :------ |
| `query` | `Q` |

##### Returns

[`__type`](Schema.md#__type)\<`Q`\>

#### Defined in

db/dist/types/schema.d.ts:31

___

### Record

▪ `Static` **Record**: \<Properties\>(`properties`: `Properties`) => [`__type`](Schema.md#__type)\<`Properties`\>

#### Type declaration

▸ \<`Properties`\>(`properties`): [`__type`](Schema.md#__type)\<`Properties`\>

##### Type parameters

| Name | Type |
| :------ | :------ |
| `Properties` | extends `Object` |

##### Parameters

| Name | Type |
| :------ | :------ |
| `properties` | `Properties` |

##### Returns

[`__type`](Schema.md#__type)\<`Properties`\>

#### Defined in

db/dist/types/schema.d.ts:29

___

### Set

▪ `Static` **Set**: \<Items\>(`items`: `Items`) => [`__type`](Schema.md#__type)\<`Items`\>

#### Type declaration

▸ \<`Items`\>(`items`): [`__type`](Schema.md#__type)\<`Items`\>

##### Type parameters

| Name | Type |
| :------ | :------ |
| `Items` | extends `ValueType`\<`any`\> |

##### Parameters

| Name | Type |
| :------ | :------ |
| `items` | `Items` |

##### Returns

[`__type`](Schema.md#__type)\<`Items`\>

#### Defined in

db/dist/types/schema.d.ts:30

___

### String

▪ `Static` **String**: \<TypeOptions\>(`options?`: `TypeOptions`) => [`__type`](Schema.md#__type)\<`TypeOptions`\>

#### Type declaration

▸ \<`TypeOptions`\>(`options?`): [`__type`](Schema.md#__type)\<`TypeOptions`\>

##### Type parameters

| Name | Type |
| :------ | :------ |
| `TypeOptions` | extends `Object` = {} |

##### Parameters

| Name | Type |
| :------ | :------ |
| `options?` | `TypeOptions` |

##### Returns

[`__type`](Schema.md#__type)\<`TypeOptions`\>

#### Defined in

db/dist/types/schema.d.ts:25

## Accessors

### Default

• `get` **Default**(): `Object`

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `now` | () => \{ `args`: ``null`` ; `func`: `string`  } |
| `uuid` | (`length?`: `string`) => \{ `args`: ``null`` \| `string`[] ; `func`: `string`  } |

#### Defined in

db/dist/types/schema.d.ts:33

## Methods

### Schema

▸ **Schema**\<`T`\>(`config`): [`__type`](Schema.md#__type)\<`T`\>

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends `SchemaConfig` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `config` | `T` |

#### Returns

[`__type`](Schema.md#__type)\<`T`\>

#### Defined in

db/dist/types/schema.d.ts:32
