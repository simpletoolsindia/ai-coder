import { describe, it, expect } from 'vitest';
import { Container, token, CircularDependencyError, NotFoundError } from '../../src/core/container.js';

describe('Container', () => {
  it('resolves a singleton factory', async () => {
    const c = new Container();
    let count = 0;
    c.register(token<number>('n'), () => ++count);
    expect(await c.resolve(token<number>('n'))).toBe(1);
    expect(await c.resolve(token<number>('n'))).toBe(1);
  });

  it('non-singleton factories create a new value each time', async () => {
    const c = new Container();
    let count = 0;
    c.register(token<number>('n'), () => ++count, { singleton: false });
    expect(await c.resolve(token<number>('n'))).toBe(1);
    expect(await c.resolve(token<number>('n'))).toBe(2);
  });

  it('resolveSync resolves synchronous values', () => {
    const c = new Container();
    c.register(token<string>('s'), () => 'hi');
    expect(c.resolveSync(token<string>('s'))).toBe('hi');
  });

  it('registerInstance stores a fixed value', async () => {
    const c = new Container();
    c.registerInstance(token<{ v: number }>('obj'), { v: 42 });
    const a = await c.resolve(token<{ v: number }>('obj'));
    const b = await c.resolve(token<{ v: number }>('obj'));
    expect(a).toBe(b);
    expect(a.v).toBe(42);
  });

  it('throws when the token is missing', async () => {
    const c = new Container();
    await expect(c.resolve(token<unknown>('missing'))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws on circular dependencies', async () => {
    const c = new Container();
    const A = token<unknown>('A');
    const B = token<unknown>('B');
    c.register(A, async (cc) => await cc.resolve(B));
    c.register(B, async (cc) => await cc.resolve(A));
    await expect(c.resolve(A)).rejects.toBeInstanceOf(CircularDependencyError);
  });

  it('parent containers are used as fallback', async () => {
    const parent = new Container();
    parent.registerInstance(token<string>('p'), 'parent-value');
    const child = new Container(parent);
    expect(await child.resolve(token<string>('p'))).toBe('parent-value');
  });

  it('child registrations override parent', async () => {
    const parent = new Container();
    parent.registerInstance(token<string>('x'), 'parent');
    const child = new Container(parent);
    child.registerInstance(token<string>('x'), 'child');
    expect(await child.resolve(token<string>('x'))).toBe('child');
  });

  it('tryResolve returns undefined when not found', async () => {
    const c = new Container();
    expect(c.tryResolve(token<unknown>('missing'))).toBeUndefined();
  });

  it('has checks both child and parent', () => {
    const parent = new Container();
    parent.registerInstance(token<number>('n'), 1);
    const child = new Container(parent);
    child.registerInstance(token<string>('s'), 'a');
    expect(child.has(token<number>('n'))).toBe(true);
    expect(child.has(token<string>('s'))).toBe(true);
    expect(child.has(token<boolean>('b'))).toBe(false);
  });

  it('unregister removes a token', () => {
    const c = new Container();
    c.registerInstance(token<number>('n'), 1);
    expect(c.unregister(token<number>('n'))).toBe(true);
    expect(c.has(token<number>('n'))).toBe(false);
  });

  it('clear removes all registrations and disposes instances', () => {
    const c = new Container();
    let disposed = false;
    c.registerInstance(token<{ dispose: () => void }>('d'), {
      dispose: () => {
        disposed = true;
      },
    });
    c.clear();
    expect(disposed).toBe(true);
  });

  it('createChild returns a new container with parent', () => {
    const c = new Container();
    const child = c.createChild();
    expect(child).toBeInstanceOf(Container);
  });

  it('tokens() lists registrations', () => {
    const c = new Container();
    c.registerInstance(token<number>('a'), 1);
    c.registerInstance(token<string>('b'), 'x');
    expect(c.tokens().sort()).toEqual(['a', 'b']);
  });
});
