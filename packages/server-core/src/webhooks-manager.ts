import {
  DBTransaction,
  DB as TriplitDB,
  TriplitError,
  splitIdParts,
} from '@triplit/db';
import { createHmac } from 'node:crypto';
import { UnserializableEntityError } from './errors.js';

const WEBHOOK_ID = 'webhooks';

// The WebhooksManager is responsible for maintaining two things:
// 1. An in-memory mapping of webhook URLs to trigger IDs
// 2. Storing webhook configurations in the database
export class WebhooksManager {
  public activeWebhookTriggerIds: Map<string, string> = new Map();

  constructor(public db: TriplitDB<any>) {
    this.fetchWebhooksFromStorage().then((webhooks) => {
      if (webhooks) {
        this.addTriggersFromWebhookJSON(webhooks);
      }
    });
  }

  async addTriggersFromWebhookJSON(webhooks: WebhookJSONDefinition) {
    const webhookUrls = Object.keys(webhooks);
    for (const url of webhookUrls) {
      const webhook = webhooks[url];
      for (const [collectionName, actions] of Object.entries(webhook)) {
        await this.addWebhookTrigger({
          url,
          collectionName,
          actions,
        });
      }
    }
  }

  async addAndStoreWebhooks(webhooks: WebhookJSONDefinition) {
    await this.addTriggersFromWebhookJSON(webhooks);
    await this.storeWebhooks(webhooks);
  }

  async clearWebhooks() {
    await this.db.tripleStore.updateMetadataTuples([[WEBHOOK_ID, [], '{}']]);
    for (const [key, triggerId] of this.activeWebhookTriggerIds.entries()) {
      this.db.removeTrigger(triggerId);
      this.activeWebhookTriggerIds.delete(key);
    }
  }

  async getWebhooks(): Promise<WebhookJSONDefinition> {
    return (await this.fetchWebhooksFromStorage()) ?? {};
  }

  async storeWebhooks(webhooks: WebhookJSONDefinition) {
    await this.db.tripleStore.updateMetadataTuples([
      [WEBHOOK_ID, [], JSON.stringify(webhooks)],
    ]);
  }

  async fetchWebhooksFromStorage(): Promise<WebhookJSONDefinition | undefined> {
    const webhookTuples = await this.db.tripleStore.readMetadataTuples(
      WEBHOOK_ID
    );
    if (webhookTuples.length === 0) {
      return undefined;
    }
    const stringifiedWebhooks = webhookTuples[0][2];
    if (!stringifiedWebhooks || typeof stringifiedWebhooks !== 'string') {
      return undefined;
    }
    return JSON.parse(stringifiedWebhooks) as WebhookJSONDefinition;
  }

  async addWebhookTrigger({
    url,
    collectionName,
    actions,
  }: {
    url: string;
    collectionName: string;
    actions: Record<'inserts' | 'updates' | 'deletes', boolean>;
  }) {
    if (!process.env.TRIPLIT_WEBHOOK_SECRET) {
      // TODO: improve message
      throw new TriplitError(
        'Webhook secret is not set. Please set TRIPLIT_WEBHOOK_SECRET in your environment.'
      );
    }
    if (!isAValidUrlString(url)) {
      throw new TriplitError('Webhook URL could not be parsed as a URL');
    }
    const webhookKey = `${url}-${collectionName}`;
    const triggerId = this.activeWebhookTriggerIds.get(webhookKey);
    if (triggerId) {
      // console.log('Removing webhook for', collectionName, 'to', url);
      this.db.removeTrigger(triggerId);
    }

    // console.log('Adding webhook for', collectionName, 'to', url);
    const newTriggerId = this.db.addTrigger(
      {
        when: 'afterCommit',
      },
      async ({ opSet, tx }) => {
        try {
          const schema = await (tx as DBTransaction<any>).getSchema();
          const collection = schema && schema.collections?.[collectionName];
          const filteredOpSet = (
            Object.entries(actions) as [keyof typeof actions, boolean][]
          ).reduce((acc, [action, shouldTrigger]) => {
            if (!shouldTrigger) {
              return acc;
            }
            const collectionEntities = opSet[action].reduce(
              (arr, [id, { entity, oldEntity }]) => {
                const compoundKey = splitIdParts(id);
                if (compoundKey[0] !== collectionName) return arr;

                if (!collection) {
                  try {
                    JSON.stringify(entity);
                    JSON.stringify(oldEntity);
                  } catch (e) {
                    // handle the weird case where the server lacks a schema
                    // and the entity has unsupported types
                    throw new UnserializableEntityError(entity);
                  }
                  return [...arr, entity];
                }
                // otherwise convert to JSON

                return [
                  ...arr,
                  {
                    id: compoundKey[1],
                    entity:
                      entity &&
                      collection.schema.convertJSToJSON(
                        collection.schema.convertDBValueToJS(
                          entity,
                          schema.collections
                        ),
                        schema.collections
                      ),
                    oldEntity:
                      oldEntity &&
                      collection.schema.convertJSToJSON(
                        collection.schema.convertDBValueToJS(
                          oldEntity,
                          schema.collections
                        ),
                        schema.collections
                      ),
                  },
                ];
              },
              [] as any[]
            );
            return {
              ...acc,
              [action]: collectionEntities,
            };
          }, {}) as Record<string, any[]>;

          if (Object.values(filteredOpSet).every((v) => v.length === 0)) {
            return;
          }

          const body = {
            collectionName,
            ...filteredOpSet,
          };

          const stringifiedBody = JSON.stringify({
            collectionName,
            ...filteredOpSet,
          });

          const secret = process.env.TRIPLIT_WEBHOOK_SECRET as string;
          const secretBytes = Buffer.from(secret, 'base64');

          const signature = createHmac('sha256', secretBytes)
            .update(stringifiedBody)
            .digest('base64');
          if (process.env.TRIPLIT_DISABLE_WEBHOOKS === 'true') {
            console.log('MOCK WEBHOOK TO', url, body);
            return;
          }
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-triplit-signature': signature,
            },
            body: stringifiedBody,
          }).catch((e) => {
            console.error('Error sending webhook', e);
          });
        } catch (e) {
          console.error('Error sending webhook');
          throw e;
        }
      }
    );
    this.activeWebhookTriggerIds.set(webhookKey, newTriggerId);
  }
}

export type WebhookJSONDefinition = {
  [url: string]: {
    [collectionName: string]: {
      inserts: boolean;
      updates: boolean;
      deletes: boolean;
    };
  };
};

const isAValidUrlString = (s: string) => {
  try {
    new URL(s);
    return true;
  } catch (err) {
    return false;
  }
};
