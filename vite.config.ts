import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Resolve relative paths to absolute URLs at build time.
// Checks SITE_URL (custom env var) then CF_PAGES_URL (Cloudflare Pages built-in).
function absoluteUrls(): Plugin {
  return {
    name: 'absolute-urls',
    transformIndexHtml(html) {
      const siteUrl = (process.env.SITE_URL || process.env.CF_PAGES_URL || '').replace(/\/$/, '');
      if (!siteUrl) return html;
      return html
        // OG/Twitter image + og:url meta tags
        .replace(
          /(<meta\s+(?:property|name)="(?:og:image|og:url|twitter:image)"\s+content=")(\/[^"]*)(")/g,
          (_, pre, path, post) => `${pre}${siteUrl}${path}${post}`
        )
        // <link rel="canonical">
        .replace(
          /(<link\s+rel="canonical"\s+href=")(\/[^"]*)(")/g,
          (_, pre, path, post) => `${pre}${siteUrl}${path}${post}`
        )
        // JSON-LD "url" field
        .replace(
          /("url"\s*:\s*")(\/[^"]*)(")/g,
          (_, pre, path, post) => `${pre}${siteUrl}${path}${post}`
        );
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [tailwindcss(), absoluteUrls()],
  optimizeDeps: {
    exclude: ['manifold-3d']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; font-src 'self'",
    },
    fs: {
      // Relax strict fs access for WASM files in node_modules
      // (required when running from a git worktree where node_modules
      // resolves to the original repo path outside the worktree root)
      strict: false,
    },
  },
  build: {
    chunkSizeWarningLimit: 520,
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'codemirror': [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/lang-javascript',
            '@codemirror/theme-one-dark',
          ],
          'manifold': ['manifold-3d'],
        },
      },
    },
  },
  appType: 'spa',
});
