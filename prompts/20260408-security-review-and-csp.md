---
session: "security-review-and-csp"
timestamp: "2026-04-08T20:30:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Security review focused on AI prompt injection risks (the app is "bring your own AI" and users should trust it won't embed hidden instructions), followed by a broader security audit.

## Changes

- `SECURITY.md`: New file documenting the AI prompt injection trust model, code execution model (`new Function` is not a sandbox), and how users can verify safety themselves.
- `README.md`: Added Security section linking to SECURITY.md.
- `index.html`: Added Content-Security-Policy meta tag blocking external scripts, outbound requests, and inline script injection.
- `vite.config.ts`: Added CSP header for dev server.
- `package.json`: Added `npm run deploy` command that runs `npm audit --audit-level=high` before `tsc && vite build`.
- `package-lock.json`: Updated vite 6.4.1 -> 6.4.2 and picomatch 4.0.3 -> 4.0.4 to fix 2 high-severity vulnerabilities (path traversal, websocket arbitrary file read).
