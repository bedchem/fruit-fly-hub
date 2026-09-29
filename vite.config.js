import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import sitePlugin from './seo/vite-plugin-site.js';

export default defineConfig({
  plugins: [react(), sitePlugin()],
  // pages are real files, not client routes: an unknown address is a 404
  // (served as 404.html by the site plugin), never the hub in disguise
  appType: 'mpa',
  server: { port: 5173, open: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // the hub, the experiments, plus the static pages search engines and people read
      // three.js and React in one cached chunk, shared by both venues
      output: {
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
      input: {
        main: 'index.html',
        casino: 'casino/index.html',
        bar: 'bar/index.html',
        trade: 'trade/index.html',
        scroll: 'scroll/index.html',
        game: 'game/index.html',
        code: 'code/index.html',
        swat: 'swat/index.html',
        about: 'about.html',
        legal: 'legal.html',
        notFound: '404.html',
      },
    },
  },
  // the fly is a large binary; keep it out of the JS graph
  assetsInclude: ['**/*.glb'],
});
