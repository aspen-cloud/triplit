import { DurableObject } from 'cloudflare:workers';
import {
	upgradeWebSocket,
	upgradeWebSocketHibernation,
} from '@triplit/server/cloudflare';
import { createTriplitHonoServer } from '@triplit/server/hono';
import { CloudflareDurableObjectKVStore } from '@triplit/db/storage/cf-durable-object';

type ExtendedDurableObjectState = DurableObjectState & {
	honoWs?: {
		events?: any;
		wsContext?: any;
	};
};

export class MyDurableObject extends DurableObject {
	state: ExtendedDurableObjectState;
	private appPromise: Promise<
		Awaited<ReturnType<typeof createTriplitHonoServer>>
	>;

	constructor(ctx: ExtendedDurableObjectState, env: Env) {
		super(ctx, env);
		this.state = ctx;
		this.appPromise = createTriplitHonoServer(
			{
				jwtSecret: env.JWT_SECRET,
				storage: new CloudflareDurableObjectKVStore(this.state.storage),
			},
			upgradeWebSocketHibernation(ctx)
		);
	}

	async fetch(request: Request) {
		const app = await this.appPromise;
		return app.fetch(request);
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		await this.appPromise;
		if (this.state.honoWs?.events?.onMessage) {
			const wsContext = this.state.honoWs.wsContext;
			this.state.honoWs.events.onMessage(
				{
					data: message,
				},
				wsContext
			);
		}
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean
	) {
		await this.appPromise;
		if (this.state.honoWs?.events?.onClose) {
			const wsContext = this.state.honoWs.wsContext;
			this.state.honoWs.events.onClose(
				{
					code,
					reason,
					wasClean,
				},
				wsContext
			);
		}
	}

	async webSocketError(ws: WebSocket, error: Error) {
		await this.appPromise;
		if (this.state.honoWs?.events?.onError) {
			const wsContext = this.state.honoWs.wsContext;
			this.state.honoWs.events.onError(error, wsContext);
		}
	}
}

export default {
	async fetch(request, env, _ctx): Promise<Response> {
		let id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName('triplitDB');
		let stub = env.MY_DURABLE_OBJECT.get(id);
		return await stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
