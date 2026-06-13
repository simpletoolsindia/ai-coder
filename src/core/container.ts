export type Token<T> = string & { __t?: T };

export const token = <T>(name: string): Token<T> => name as Token<T>;

export type Factory<T> = (container: Container) => T | Promise<T>;

export interface Registration<T> {
  token: Token<T>;
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
  resolved: boolean;
}

export class CircularDependencyError extends Error {
  public readonly path: string[];
  constructor(path: string[]) {
    super(`Circular dependency: ${path.join(' -> ')}`);
    this.name = 'CircularDependencyError';
    this.path = path;
  }
}

export class NotFoundError extends Error {
  constructor(token: string) {
    super(`No registration for token "${token}"`);
    this.name = 'NotFoundError';
  }
}

export class Container {
  private registrations = new Map<string, Registration<unknown>>();
  private parent?: Container;
  private resolutionStack: string[] = [];

  constructor(parent?: Container) {
    this.parent = parent;
  }

  register<T>(t: Token<T>, factory: Factory<T>, opts: { singleton?: boolean } = {}): this {
    this.registrations.set(t as string, {
      token: t,
      factory,
      singleton: opts.singleton ?? true,
      resolved: false,
    } as Registration<unknown>);
    return this;
  }

  registerInstance<T>(t: Token<T>, instance: T): this {
    this.registrations.set(t as string, {
      token: t,
      factory: () => instance,
      singleton: true,
      instance,
      resolved: true,
    } as Registration<unknown>);
    return this;
  }

  async resolve<T>(t: Token<T>): Promise<T> {
    const key = t as string;
    const reg = this.registrations.get(key) ?? this.parent?.registrations.get(key);
    if (!reg) throw new NotFoundError(key);
    if (reg.singleton && reg.resolved) return reg.instance as T;
    if (this.resolutionStack.includes(key)) {
      throw new CircularDependencyError([...this.resolutionStack, key]);
    }
    this.resolutionStack.push(key);
    try {
      const value = await reg.factory(this);
      if (reg.singleton) {
        reg.instance = value;
        reg.resolved = true;
      }
      return value as T;
    } finally {
      this.resolutionStack.pop();
    }
  }

  resolveSync<T>(t: Token<T>): T {
    const key = t as string;
    const reg = this.registrations.get(key) ?? this.parent?.registrations.get(key);
    if (!reg) throw new NotFoundError(key);
    if (reg.singleton && reg.resolved) return reg.instance as T;
    if (this.resolutionStack.includes(key)) {
      throw new CircularDependencyError([...this.resolutionStack, key]);
    }
    this.resolutionStack.push(key);
    try {
      const value = reg.factory(this);
      if (!(value instanceof Promise) && reg.singleton) {
        reg.instance = value;
        reg.resolved = true;
      }
      return value as T;
    } finally {
      this.resolutionStack.pop();
    }
  }

  tryResolve<T>(t: Token<T>): T | undefined {
    try {
      return this.resolveSync(t);
    } catch {
      return undefined;
    }
  }

  has(t: Token<unknown>): boolean {
    return this.registrations.has(t as string) || (this.parent?.has(t) ?? false);
  }

  unregister(t: Token<unknown>): boolean {
    return this.registrations.delete(t as string);
  }

  clear(): void {
    for (const reg of this.registrations.values()) {
      if (reg.instance && typeof reg.instance === 'object' && 'dispose' in reg.instance) {
        try {
          (reg.instance as { dispose: () => void }).dispose();
        } catch {
          // ignore
        }
      }
    }
    this.registrations.clear();
  }

  createChild(): Container {
    return new Container(this);
  }

  tokens(): string[] {
    return Array.from(this.registrations.keys());
  }
}

export const createContainer = (parent?: Container): Container => new Container(parent);
