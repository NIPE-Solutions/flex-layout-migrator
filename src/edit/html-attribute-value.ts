export type HtmlAttributeQuote = '"' | "'";

export function serializeHtmlAttributeValue(value: string, quote: HtmlAttributeQuote): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(quote, quote === '"' ? '&quot;' : '&#39;');
}
