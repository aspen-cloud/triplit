import { DB } from '@triplit/db';
export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  TRIPLIT_DB: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;
  //
  // Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
  // MY_QUEUE: Queue;

  // SECRET
  JWT_SECRET: string;
}
// @ts-ignore
import { schema } from '@/schema';

export default {
  /**
   * This will mostly just pass request to Triplit Durable Object
   * but also can be where you serve static assets or do any basic
   * rendering at the "edge"
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const dbWorkerId = env.TRIPLIT_DB.idFromName('default-db');

    const dbWorker = env.TRIPLIT_DB.get(dbWorkerId);
    return dbWorker.fetch(request);
  },
};

export class TriplitDurableObject implements DurableObject {
  db: any;
  constructor(readonly state: DurableObjectState, readonly env: Env) {
    this.db = new DB({
      schema,
    });
  }

  async fetch(request: Request): Promise<Response> {
    return new Response('Hello world from Triplit Cloud V2');
  }
}
