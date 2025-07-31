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
		this.appPromise = createTriplitHonoServer(
			{
				jwtSecret: env.JWT_SECRET,
				storage: new CloudflareDurableObjectKVStore(this.state.storage),
			},
			upgradeWebSocket
		);
	}

	async fetch(request: Request) {
		const app = await this.appPromise;
		return app.fetch(request);
	}
}

export default {
	async fetch(request, env, _ctx): Promise<Response> {
		let id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName('triplitDB');
		let stub = env.MY_DURABLE_OBJECT.get(id);
		return await stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
