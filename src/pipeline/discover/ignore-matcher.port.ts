export interface IgnoreMatcher {
  ignores(path: string): boolean;
}

export interface IgnoreMatcherFactory {
  load(root: string): Promise<IgnoreMatcher>;
}
