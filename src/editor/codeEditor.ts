import { EditorView } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { StreamLanguage } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';

export type EditorLanguage = 'manifold-js' | 'scad';

let editorView: EditorView | null = null;
let debounceTimer: number | null = null;
const languageCompartment = new Compartment();
const readOnlyCompartment = new Compartment();

// Minimal OpenSCAD StreamLanguage — keyword/builtin/comment/string/number coloring.
const SCAD_KEYWORDS = new Set([
  'module','function','if','else','for','let','use','include','true','false','undef','each','return',
]);
const SCAD_BUILTINS = new Set([
  'cube','sphere','cylinder','polyhedron','polygon','square','circle','text',
  'translate','rotate','scale','mirror','multmatrix','color','offset','hull','minkowski','resize',
  'union','difference','intersection','linear_extrude','rotate_extrude','projection','surface',
  'import','children','render','echo','assert','assign','search','str','len','concat','abs','sign',
  'sin','cos','tan','asin','acos','atan','atan2','sqrt','pow','exp','log','ln','floor','ceil','round',
  'min','max','norm','cross','rands','lookup','version','version_num',
]);

const scadLanguage = StreamLanguage.define({
  startState: () => ({ inBlockComment: false }),
  token(stream, state: { inBlockComment: boolean }) {
    if (state.inBlockComment) {
      if (stream.match(/.*?\*\//)) { state.inBlockComment = false; return 'comment'; }
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match('/*')) { state.inBlockComment = true; return 'comment'; }
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^\$[a-zA-Z_]+/)) return 'variableName.special';
    if (stream.match(/^-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/)) return 'number';
    const wordMatch = stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (wordMatch) {
      const word = Array.isArray(wordMatch) ? wordMatch[0] : (stream as unknown as { current: () => string }).current();
      if (SCAD_KEYWORDS.has(word)) return 'keyword';
      if (SCAD_BUILTINS.has(word)) return 'builtin';
      return 'variableName';
    }
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
  },
});

function languageExt(lang: EditorLanguage): Extension {
  return lang === 'scad' ? scadLanguage : javascript();
}

export function initEditor(
  container: HTMLElement,
  initialCode: string,
  onChange: (code: string) => void,
  initialLanguage: EditorLanguage = 'manifold-js',
): EditorView {
  const state = EditorState.create({
    doc: initialCode,
    extensions: [
      basicSetup,
      languageCompartment.of(languageExt(initialLanguage)),
      readOnlyCompartment.of(EditorState.readOnly.of(false)),
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

export function setLanguage(lang: EditorLanguage): void {
  if (!editorView) return;
  editorView.dispatch({
    effects: languageCompartment.reconfigure(languageExt(lang)),
  });
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

export function setReadOnly(readOnly: boolean): void {
  if (!editorView) return;
  editorView.dispatch({
    effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
  });
}
