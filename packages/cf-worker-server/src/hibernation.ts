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
		console.log('CALLING CONSTRUCTOR');
		this.state = ctx;
		// Create the Triplit server
		this.appPromise = createTriplitHonoServer(
			{
				// add any configuration options here
				jwtSecret: env.JWT_SECRET,
				// this is the Triplit storage provider for Durable Objects
				storage: new CloudflareDurableObjectKVStore(this.state.storage),
			},
			// inject the platform-specific WebSocket upgrade function
			upgradeWebSocketHibernation(ctx)
		);
	}

	async fetch(request: Request) {
		// Await the app initialization before handling the request
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
		// Get the Durable Object ID (this is where you could easily add multi-tenancy)
		let id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName('triplitDB');
		let stub = env.MY_DURABLE_OBJECT.get(id);

		// Forward the request to the Durable Object
		return await stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
