// Whole-document code transforms for the insert palette. Pure and
// dependency-free (unit-tested in tests/insert-codegen.spec.ts) — the palette
// reads the editor, runs these, and writes the result back via setValue.
//
// manifold-js needs a single managed `return` so the program stays valid as
// shapes/operations accumulate; OpenSCAD just appends statements (all
// top-level geometry renders) and wraps statements for operations.

/** True for a `return` expression we're willing to overwrite automatically:
 *  a bare identifier (a managed part) or a single constructor call. A more
 *  complex hand-written return is preserved instead of being clobbered. */
export function isSimpleReturnExpr(expr: string): boolean {
  const e = expr.trim();
  if (/^[A-Za-z_$][\w$]*$/.test(e)) return true;
  return (
    /^(api\.)?(Manifold|CrossSection|Curves)\b/.test(e) ||
    /^labeledUnion\s*\(/.test(e) ||
    /^api\.renderMesh\s*\(/.test(e)
  );
}

/** Ensure `Manifold` is destructured from `api` (the house style every
 *  example uses). No-op when it already is, or when code reads `api.Manifold`
 *  directly. */
export function ensureManifoldDestructure(code: string): string {
  if (/const\s*\{[^}]*\bManifold\b[^}]*\}\s*=\s*api\b/.test(code)) return code;
  if (/\bapi\.Manifold\b/.test(code)) return code;
  return `const { Manifold } = api;\n${code}`;
}

interface ReturnMatch {
  index: number;
  expr: string;
}

function findLastReturn(code: string): ReturnMatch | null {
  // Anchor to the start of a line (after optional indentation) so the word
  // "return" inside a `//` comment or a string literal isn't mistaken for a
  // return statement (the default example's comment literally says "…return
  // the final Manifold object").
  const re = /^[ \t]*return\s+([^;]+);/gm;
  let last: ReturnMatch | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    last = { index: m.index, expr: m[1] };
  }
  return last;
}

export type ReturnMode = 'force' | 'ifSimple' | 'none';

export interface AddDeclarationResult {
  code: string;
  /** Whether the visible `return` now points at `resultName`. When false the
   *  caller should tell the user the part was added but isn't shown yet. */
  returnSet: boolean;
}

/** Insert a `const <resultName> = …;` declaration and (optionally) repoint the
 *  trailing `return` at it. The declaration lands just before the return line,
 *  or at end-of-file when there is no return. */
export function addJsDeclaration(
  code: string,
  declLine: string,
  resultName: string,
  mode: ReturnMode,
): AddDeclarationResult {
  const withDestructure = ensureManifoldDestructure(code);
  const ret = findLastReturn(withDestructure);

  if (!ret) {
    const sep = withDestructure.length === 0 || withDestructure.endsWith('\n') ? '' : '\n';
    return {
      code: `${withDestructure}${sep}${declLine}\nreturn ${resultName};\n`,
      returnSet: true,
    };
  }

  const lineStart = withDestructure.lastIndexOf('\n', ret.index - 1) + 1;
  const before = withDestructure.slice(0, lineStart);
  const after = withDestructure.slice(lineStart);

  const shouldSet = mode === 'force' || (mode === 'ifSimple' && isSimpleReturnExpr(ret.expr));
  const newAfter = shouldSet
    ? after.replace(/return\s+[^;]+;/, `return ${resultName};`)
    : after;

  return { code: `${before}${declLine}\n${newAfter}`, returnSet: shouldSet };
}

/** Append a top-level OpenSCAD statement. */
export function appendScadStatement(code: string, statement: string): string {
  const sep = code.length > 0 && !code.endsWith('\n') ? '\n' : '';
  return `${code}${sep}${statement}\n`;
}

/** Replace a set of OpenSCAD statement ranges with a single `block`, inserted
 *  where the earliest range began. Ranges are half-open `[from, to)` character
 *  offsets (as returned by scanPartsScad). */
export function replaceScadRanges(
  code: string,
  ranges: { from: number; to: number }[],
  block: string,
): string {
  if (ranges.length === 0) return code;
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const insertAt = sorted[0].from;

  // Delete from last to first so earlier offsets stay valid.
  let out = code;
  const deletions = [...sorted].sort((a, b) => b.from - a.from);
  let adjustedInsert = insertAt;
  for (const r of deletions) {
    out = out.slice(0, r.from) + out.slice(r.to);
    if (r.from < adjustedInsert) {
      adjustedInsert -= r.to - r.from;
    }
  }

  // Tidy whitespace around the splice point.
  const head = out.slice(0, adjustedInsert).replace(/[ \t]+$/, '');
  const tail = out.slice(adjustedInsert).replace(/^[ \t]*\n?/, '');
  const headSep = head.length > 0 && !head.endsWith('\n') ? '\n' : '';
  const tailSep = tail.length > 0 ? '\n' : '';
  return `${head}${headSep}${block}${tailSep}${tail}`;
}
