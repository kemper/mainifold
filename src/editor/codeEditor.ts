import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';

let editorView: EditorView | null = null;
let debounceTimer: number | null = null;

export function initEditor(
  container: HTMLElement,
  initialCode: string,
  onChange: (code: string) => void,
): EditorView {
  const state = EditorState.create({
    doc: initialCode,
    extensions: [
      basicSetup,
      javascript(),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          if (debounceTimer !== null) clearTimeout(debounceTimer);
          debounceTimer = window.setTimeout(() => {
            onChange(getValue());
          }, 300);
        }
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-content': { fontFamily: 'monospace' },
      }),
    ],
  });

  editorView = new EditorView({
    state,
    parent: container,
  });

  return editorView;
}

export function getValue(): string {
  return editorView?.state.doc.toString() ?? '';
}

export function setValue(code: string): void {
  if (!editorView) return;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: code },
  });
}
