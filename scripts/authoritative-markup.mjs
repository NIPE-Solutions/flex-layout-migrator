export function stripMarkupComments(source, { relevantElement, relevantMessage, malformedMessage }) {
  let active = '';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<!--', cursor);
    const strayEnd = source.indexOf('-->', cursor);
    if (strayEnd !== -1 && (start === -1 || strayEnd < start)) throw new Error(malformedMessage);
    if (start === -1) {
      active += source.slice(cursor);
      break;
    }
    active += source.slice(cursor, start);
    const end = source.indexOf('-->', start + 4);
    if (end === -1) throw new Error(malformedMessage);
    const comment = source.slice(start + 4, end);
    if (comment.includes('<!--')) throw new Error(malformedMessage);
    if (relevantElement.test(comment)) throw new Error(relevantMessage);
    cursor = end + 3;
  }
  return active;
}

export function readTagAttributes(tag, context = 'metadata tag') {
  const opening = tag.match(/^<[A-Za-z][A-Za-z0-9:-]*/u)?.[0];
  if (opening === undefined) throw new Error(`${context} is malformed`);
  const attributes = new Map();
  let cursor = opening.length;
  while (cursor < tag.length) {
    cursor = skipWhitespace(tag, cursor);
    if (tag.startsWith('/>', cursor)) {
      cursor += 2;
      break;
    }
    if (tag[cursor] === '>') {
      cursor += 1;
      break;
    }
    const nameMatch = tag.slice(cursor).match(/^[^\s"'<>/=]+/u);
    if (nameMatch === null) throw new Error(`${context} is malformed`);
    const rawName = nameMatch[0];
    const name = rawName.toLowerCase();
    if (attributes.has(name)) throw new Error(`${context} contains duplicate attribute ${name}`);
    cursor += rawName.length;
    cursor = skipWhitespace(tag, cursor);
    let value = '';
    if (tag[cursor] === '=') {
      cursor = skipWhitespace(tag, cursor + 1);
      const quote = tag[cursor];
      if (quote === '"' || quote === "'") {
        const end = tag.indexOf(quote, cursor + 1);
        if (end === -1) throw new Error(`${context} is malformed`);
        value = tag.slice(cursor + 1, end);
        cursor = end + 1;
      } else {
        const valueMatch = tag.slice(cursor).match(/^[^\s"'`=<>]+/u);
        if (valueMatch === null) throw new Error(`${context} is malformed`);
        value = valueMatch[0];
        cursor += value.length;
      }
    }
    attributes.set(name, value);
  }
  if (tag.slice(cursor).trim() !== '') throw new Error(`${context} is malformed`);
  return attributes;
}

function skipWhitespace(source, start) {
  let cursor = start;
  while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
  return cursor;
}
