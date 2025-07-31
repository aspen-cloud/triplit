import { DurableObject } from 'cloudflare:workers';
import { upgradeWebSocket } from '@triplit/server/cloudflare';
import { createTriplitHonoServer } from '@triplit/server/hono';
import { CloudflareDurableObjectKVStore } from '@triplit/db/storage/cf-durable-object';

export class MyDurableObject extends DurableObject {
	state: DurableObjectState;
	private appPromise: Promise<
		Awaited<ReturnType<typeof createTriplitHonoServer>>
	>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
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
			upgradeWebSocket
		);
	}

	async fetch(request: Request) {
		// Await the app initialization before handling the request
		const app = await this.appPromise;
		return app.fetch(request);
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
