---
session: "help-page-agent-prompt"
timestamp: "2026-04-08T15:30:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Add an example AI agent prompt to the help page's "How to use" section.
The prompt should instruct an agent to read ai.md, create a named session,
build a standard Lego brick as a test model with multiple versions, use
assertions, and return a gallery URL. URLs must work on both localhost and
the deployed site (mainifold.pages.dev).

## Changes

- `src/ui/help.ts`: Added "Try it with an AI agent" section between
  "Connecting an AI agent" and "Quick example". Uses `window.location.origin`
  to generate URLs dynamically so the prompt works on any host.
