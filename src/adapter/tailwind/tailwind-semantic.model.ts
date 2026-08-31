export type ParsedValue<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

export type CssLength = string & { readonly __cssLength: unique symbol };
