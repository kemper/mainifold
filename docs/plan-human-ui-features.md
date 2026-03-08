# Human UI Features Plan

Features to improve the experience for humans reviewing and tweaking AI-generated 3D models. These are independent from the AI console API improvements.

## 1. Cmd+Enter to Run
Wire CodeMirror keybinding so Cmd+Enter (Mac) / Ctrl+Enter (Windows) triggers code execution. Most natural shortcut for "run what I'm looking at."

## 2. Undo/Redo in Editor
CodeMirror has built-in history support. Expose Cmd+Z / Cmd+Shift+Z. Also add `mainifold.undo()` / `mainifold.redo()` to the console API for completeness.

## 3. Splitter Position Persistence
Save the editor/viewport split ratio to localStorage on drag-end. Restore on page load. Tiny change in `src/ui/layout.ts`.

## 4. Version Comparison / Diff View
Gallery "Compare" mode: select two tiles, show them side-by-side with stat deltas highlighted (volume change, genus change, bounding box overlay). Helps humans evaluate which iteration is best.

## 5. Export Button on Gallery Tiles
Each gallery tile gets a small export icon. Clicking it exports that version's geometry directly (STL/GLB/OBJ/3MF) without needing to load it into the editor first.

## 6. Live Preview on Edit
Auto-run code on debounced keypress (300ms after last keystroke). Toggle in toolbar to enable/disable. For tweaking numeric values (dimensions, positions) the visual feedback loop becomes instant.

## 7. Natural Language Prompt Input
A text input field above the editor: "make the towers taller", "add a moat", "round the corners". Sends current code + instruction to Claude API, returns modified code. Requires the user's Claude API key (stored in localStorage). This transforms mainifold from a code editor into a conversational CAD tool.

## 8. Template / Starting Shape Library
Expand the examples dropdown into a visual template gallery: castle, vase, gear, phone case, bracket, enclosure. Each is a starting point the AI or human refines. Lowers the blank-canvas barrier.
