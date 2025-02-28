import type { ApiService } from '@novu/client';
import { InboxService } from './api';

import { NovuEventEmitter } from './event-emitter';
import { Result, Session } from './types';
import { NovuError } from './utils/errors';
import { InboxServiceSingleton } from './utils/inbox-service-singleton';

interface CallQueueItem {
  fn: () => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (value: any | PromiseLike<any>) => void;
  reject: (reason?: unknown) => void;
}

export class BaseModule {
  _apiService: ApiService;
  _inboxService: InboxService;
  _emitter: NovuEventEmitter;
  #callsQueue: CallQueueItem[] = [];
  #sessionError: unknown;

  constructor() {
    this._emitter = NovuEventEmitter.getInstance();
    this._inboxService = InboxServiceSingleton.getInstance();
    this._emitter.on('session.initialize.resolved', ({ error, data }) => {
      if (data) {
        this.onSessionSuccess(data);
        this.#callsQueue.forEach(async ({ fn, resolve }) => {
          resolve(await fn());
        });
        this.#callsQueue = [];
      } else if (error) {
        this.onSessionError(error);
        this.#sessionError = error;
        this.#callsQueue.forEach(({ resolve }) => {
          resolve({ error: new NovuError('Failed to initialize session, please contact the support', error) });
        });
        this.#callsQueue = [];
      }
    });
  }

  protected onSessionSuccess(_: Session): void {}

  protected onSessionError(_: unknown): void {}

  async callWithSession<T>(fn: () => Result<T>): Result<T> {
    if (this._inboxService.isSessionInitialized) {
      return fn();
    }

    if (this.#sessionError) {
      return Promise.resolve({
        error: new NovuError('Failed to initialize session, please contact the support', this.#sessionError),
      });
    }

    return new Promise(async (resolve, reject) => {
      this.#callsQueue.push({ fn, resolve, reject });
    });
  }
}
