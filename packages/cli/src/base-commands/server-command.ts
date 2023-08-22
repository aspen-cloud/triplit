// src/baseCommand.ts
import { Command, Flags, Interfaces, ux } from '@oclif/core';
import axios from 'axios';
import * as JWT from 'jsonwebtoken';

export type Flags<T extends typeof Command> = Interfaces.InferredFlags<
  (typeof ServerCommand)['baseFlags'] & T['flags']
>;
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T['args']>;

export abstract class ServerCommand extends Command {
  apiKey?: string;

  static baseFlags = {
    token: Flags.string({ char: 't', description: 'API Token (Service Key)' }),
  };

  public async init(): Promise<void> {
    await super.init();
    const { flags } = await this.parse({
      flags: this.ctor.flags,
    });

    this.apiKey =
      process.env.TRIPLIT_SERVICE_KEY ??
      flags.token ??
      (await ux.prompt('API Token (Service Key)'));
  }

  async request(method: 'GET' | 'POST', path: string, params?: any) {
    const token = JWT.decode(this.apiKey!);
    // @ts-ignore
    const projectId = token?.['x-triplit-project-id'];
    const url = `https://${projectId}.triplit.io${path}`;
    const payload = method === 'GET' ? { params } : { data: params };
    const resp = await axios.request({
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      ...payload,
    });

    if (resp.status === 200) {
      return resp.data;
    }

    throw new Error(`Error ${resp.status}: ${resp.statusText}`);
  }

  protected async catch(err: Error & { exitCode?: number }): Promise<any> {
    // add any custom logic to handle errors from the command
    // or simply return the parent class error handling
    return super.catch(err);
  }

  protected async finally(_: Error | undefined): Promise<any> {
    // called after run and catch regardless of whether or not the command errored
    return super.finally(_);
  }
}
