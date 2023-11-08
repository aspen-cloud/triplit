# Interface: SyncTransport

## Properties

### connectionStatus

• **connectionStatus**: `undefined` \| [`ConnectionStatus`](../modules.md#connectionstatus)

#### Defined in

[packages/client/src/transport/transport.ts:15](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L15)

___

### isOpen

• **isOpen**: `boolean`

#### Defined in

[packages/client/src/transport/transport.ts:14](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L14)

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

[packages/client/src/transport/transport.ts:24](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L24)

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

[packages/client/src/transport/transport.ts:23](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L23)

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

[packages/client/src/transport/transport.ts:25](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L25)

___

### onConnectionChange

▸ **onConnectionChange**(`callback`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `callback` | (`state`: [`ConnectionStatus`](../modules.md#connectionstatus)) => `void` |

#### Returns

`void`

#### Defined in

[packages/client/src/transport/transport.ts:26](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L26)

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

[packages/client/src/transport/transport.ts:22](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L22)

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

[packages/client/src/transport/transport.ts:21](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L21)

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

[packages/client/src/transport/transport.ts:16](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L16)

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

[packages/client/src/transport/transport.ts:17](https://github.com/aspen-cloud/triplit/blob/18e722a/packages/client/src/transport/transport.ts#L17)
