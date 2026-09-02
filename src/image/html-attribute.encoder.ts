export function encodeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('\r', '&#13;')
    .replaceAll('\n', '&#10;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
