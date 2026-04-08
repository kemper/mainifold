import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Redirect /mainifold (no trailing slash) to /mainifold/
function redirectNoSlash(): Plugin {
  return {
    name: 'redirect-no-slash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/mainifold') {
          res.writeHead(301, { Location: '/mainifold/' });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/mainifold/',
  plugins: [tailwindcss(), redirectNoSlash()],
  optimizeDeps: {
    exclude: ['manifold-3d']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      // Relax strict fs access for WASM files in node_modules
      // (required when running from a git worktree where node_modules
      // resolves to the original repo path outside the worktree root)
      strict: false,
    },
  },
  appType: 'spa',
});
