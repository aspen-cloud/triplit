# Interface: SyncTransport

## Properties

### connectionStatus

• **connectionStatus**: `undefined` \| `ConnectionStatus`

#### Defined in

[client/src/triplit-client.ts:71](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L71)

___

### isOpen

• **isOpen**: `boolean`

#### Defined in

[client/src/triplit-client.ts:70](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L70)

## Methods

### close

▸ **close**(`code?`, `reason?`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `code?` | `number` |
| `reason?` | `string` |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:80](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L80)

___

### connect

▸ **connect**(`params`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `params` | [`TransportConnectParams`](../modules.md#transportconnectparams) |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:79](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L79)

___

### onClose

▸ **onClose**(`callback`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `callback` | (`ev`: `any`) => `void` |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:81](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L81)

___

### onConnectionChange

▸ **onConnectionChange**(`callback`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `callback` | (`state`: `ConnectionStatus`) => `void` |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:82](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L82)

___

### onError

▸ **onError**(`callback`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `callback` | (`ev`: `any`) => `void` |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:78](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L78)

___

### onMessage

▸ **onMessage**(`callback`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `callback` | (`message`: `any`) => `void` |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:77](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L77)

___

### onOpen

▸ **onOpen**(`callback`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `callback` | (`ev`: `any`) => `void` |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:72](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L72)

___

### sendMessage

▸ **sendMessage**\<`Msg`\>(`type`, `payload`): `void`

#### Type parameters

| Name | Type |
| :------ | :------ |
| `Msg` | extends `ClientSyncMessage` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `type` | `Msg`[``"type"``] |
| `payload` | `Msg`[``"payload"``] |

#### Returns

`void`

#### Defined in

[client/src/triplit-client.ts:73](https://github.com/aspen-cloud/triplit-internal/blob/9058061d/public/packages/client/src/triplit-client.ts#L73)
