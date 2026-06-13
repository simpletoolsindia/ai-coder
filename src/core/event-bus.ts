export type EventName = string;

export interface EventPayload {
  [key: string]: unknown;
}

export type EventHandler<T = EventPayload> = (payload: T) => void | Promise<void> | unknown;

export interface EventSubscription {
  event: EventName;
  handler: EventHandler;
  once: boolean;
  id: number;
}

export interface EventBusOptions {
  /** Throw on handler errors. Default false (errors are logged). */
  throwOnHandlerError?: boolean;
  onError?: (err: unknown, event: EventName) => void;
}

export class EventBus {
  private handlers = new Map<EventName, Set<EventHandler>>();
  private wildcardHandlers = new Set<EventHandler>();
  private subscriptions = new Map<number, EventSubscription>();
  private nextId = 1;
  private options: EventBusOptions;
  private disposed = false;

  constructor(options: EventBusOptions = {}) {
    this.options = options;
  }

  on<T = EventPayload>(event: EventName, handler: EventHandler<T>): () => void {
    if (this.disposed) throw new Error('EventBus is disposed');
    const sub: EventSubscription = {
      event,
      handler: handler as EventHandler,
      once: false,
      id: this.nextId++,
    };
    this.subscriptions.set(sub.id, sub);
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler);
    return () => this.off(sub.id);
  }

  once<T = EventPayload>(event: EventName, handler: EventHandler<T>): () => void {
    if (this.disposed) throw new Error('EventBus is disposed');
    const wrapped: EventHandler = async (payload) => {
      this.off(sub.id);
      await (handler as EventHandler)(payload);
    };
    const sub: EventSubscription = {
      event,
      handler: wrapped,
      once: true,
      id: this.nextId++,
    };
    this.subscriptions.set(sub.id, sub);
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(wrapped);
    return () => this.off(sub.id);
  }

  onAny(handler: EventHandler): () => void {
    if (this.disposed) throw new Error('EventBus is disposed');
    this.wildcardHandlers.add(handler);
    return () => this.wildcardHandlers.delete(handler);
  }

  off(id: number): void {
    const sub = this.subscriptions.get(id);
    if (!sub) return;
    this.subscriptions.delete(id);
    const set = this.handlers.get(sub.event);
    if (set) set.delete(sub.handler);
  }

  offEvent(event: EventName): void {
    this.handlers.delete(event);
    for (const [id, sub] of this.subscriptions) {
      if (sub.event === event) this.subscriptions.delete(id);
    }
  }

  async emit<T = EventPayload>(event: EventName, payload?: T): Promise<void> {
    if (this.disposed) return;
    const handlers = this.handlers.get(event);
    const all: EventHandler[] = [];
    if (handlers) all.push(...handlers);
    for (const h of this.wildcardHandlers) {
      all.push(h);
    }
    if (all.length === 0) return;
    await Promise.all(
      all.map(async (h) => {
        try {
          await h((payload ?? {}) as EventPayload);
        } catch (err) {
          this.handleError(err, event);
        }
      }),
    );
  }

  emitSync<T = EventPayload>(event: EventName, payload?: T): void {
    if (this.disposed) return;
    const handlers = this.handlers.get(event);
    const all: EventHandler[] = [];
    if (handlers) all.push(...handlers);
    for (const h of this.wildcardHandlers) {
      all.push(h);
    }
    for (const h of all) {
      try {
        h((payload ?? {}) as EventPayload);
      } catch (err) {
        this.handleError(err, event);
      }
    }
  }

  listenerCount(event?: EventName): number {
    if (!event) return this.subscriptions.size + this.wildcardHandlers.size;
    return this.handlers.get(event)?.size ?? 0;
  }

  events(): EventName[] {
    return Array.from(this.handlers.keys());
  }

  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
    this.subscriptions.clear();
  }

  dispose(): void {
    this.clear();
    this.disposed = true;
  }

  private handleError(err: unknown, event: EventName): void {
    if (this.options.onError) {
      this.options.onError(err, event);
      return;
    }
    if (this.options.throwOnHandlerError) throw err;
    console.error(`[EventBus] handler error for "${event}":`, err);
  }
}

export const createEventBus = (opts?: EventBusOptions): EventBus => new EventBus(opts);

export const __eventBusTesting = { EventBus };
