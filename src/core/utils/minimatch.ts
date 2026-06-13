export function minimatch(input: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern === input) return true;
  if (!pattern.includes('*') && !pattern.includes('?') && !pattern.includes('[')) {
    return input === pattern;
  }
  // Convert glob to regex
  let regex = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        regex += '.*';
        i++;
      } else {
        regex += '[^/]*';
      }
    } else if (c === '?') {
      regex += '.';
    } else if (c === '[') {
      const end = pattern.indexOf(']', i);
      if (end === -1) {
        regex += '\\[';
      } else {
        const inner = pattern.slice(i + 1, end);
        regex += `[${inner}]`;
        i = end;
      }
    } else if (c && '.+^$()|{}\\'.includes(c)) {
      regex += '\\' + c;
    } else {
      regex += c;
    }
  }
  regex += '$';
  return new RegExp(regex).test(input);
}
