/// <reference types="vitest/config" />
import { build, defineConfig, type Plugin } from 'vite';

const workletFile = 'chiptune-worklet.js';

async function workletSource(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      target: 'es2022',
      lib: {
        entry: 'src/audio/processor.ts',
        formats: ['iife'],
        name: 'ChiptuneWorklet',
        fileName: 'chiptune-worklet',
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || !('output' in output)) throw new Error('worklet bundle was empty');
  const chunk = output.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('worklet bundle was empty');
  return chunk.code;
}

function chiptuneWorklet(): Plugin {
  return {
    name: 'chiptune-worklet',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req as { url?: string }).url?.split('?')[0];
        if (path !== `/${workletFile}`) {
          next();
          return;
        }
        try {
          const code = await workletSource();
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-store');
          res.end(code);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: workletFile,
        source: await workletSource(),
      });
    },
  };
}

const isolated = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: './',
  server: { headers: isolated },
  preview: { headers: isolated },
  plugins: [chiptuneWorklet()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
