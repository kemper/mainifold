---
session: "skip-dup-colored"
timestamp: "2026-04-24T16:55:00Z"
model: claude-opus-4-6
tools: []
---

## Human

Opening a past colored version and unlocking it creates a duplicate colored version. Skip the colored save if already persisted.

## Assistant

### Key decisions

Check `currentVersion.geometryData.colorRegions` before saving. If the loaded version already has colorRegions persisted, skip the colored save and only create the new uncolored sibling.
