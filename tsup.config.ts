import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/main.ts' },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});
