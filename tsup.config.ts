import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/cli': 'bin/cli.ts'
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
  target: 'node18'
});
