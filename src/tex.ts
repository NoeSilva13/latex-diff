// Pure helpers about TeX sources. No `vscode` import, so they are unit tested.

/** Drops a trailing `% comment`, keeping `\%` (an escaped percent sign). */
export function stripTexComment(line: string): string {
  return line.replace(/(^|[^\\])%.*$/, "$1");
}

/**
 * True when the text contains a real `\documentclass`, i.e. it is a main
 * document and not a section file pulled in with \input / \include. A
 * commented-out `% \documentclass{...}` does not count.
 */
export function hasDocumentclass(text: string): boolean {
  return text.split(/\r?\n/).some((line) => /\\documentclass\b/.test(stripTexComment(line)));
}
