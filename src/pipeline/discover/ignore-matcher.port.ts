export interface IgnoreMatcher {
  ignores(path: string): boolean;
  ignoresDirectory(path: string): boolean;
}

export interface IgnoreMatcherFactory {
  load(root: string): Promise<IgnoreMatcher>;
}
