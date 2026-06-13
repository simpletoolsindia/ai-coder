import { describe, it, expect } from 'vitest';
import { minimatch } from '../../src/core/utils/minimatch.js';

describe('minimatch', () => {
  it('matches exact strings', () => {
    expect(minimatch('foo', 'foo')).toBe(true);
  });

  it('* matches anything', () => {
    expect(minimatch('foo', '*')).toBe(true);
  });

  it('* within a pattern matches any chars except slash', () => {
    expect(minimatch('foo.ts', '*.ts')).toBe(true);
    expect(minimatch('foo/bar.ts', '*.ts')).toBe(false);
  });

  it('** matches across slashes', () => {
    expect(minimatch('a/b/c.ts', '**/*.ts')).toBe(true);
  });

  it('? matches a single char', () => {
    expect(minimatch('a', '?')).toBe(true);
    expect(minimatch('ab', '?')).toBe(false);
  });

  it('character classes work', () => {
    expect(minimatch('a', '[abc]')).toBe(true);
    expect(minimatch('d', '[abc]')).toBe(false);
  });

  it('escapes regex meta chars', () => {
    expect(minimatch('a.b', 'a.b')).toBe(true);
    expect(minimatch('aXb', 'a.b')).toBe(false);
    expect(minimatch('a\\.b', 'a\\.b')).toBe(true);
    expect(minimatch('aXb', 'a\\.b')).toBe(false);
  });

  it('matches backslash literally', () => {
    expect(minimatch('a\\b', 'a\\b')).toBe(true);
  });

  it('non matching returns false', () => {
    expect(minimatch('foo', 'bar')).toBe(false);
  });
});
