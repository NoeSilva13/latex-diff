// Pure helpers for --build-dir. Keep this file free of `vscode` imports so it
// can be unit tested with `node --test`.
//
// How git-latexdiff behaves (see the git-latexdiff script):
//   - It compiles in a temporary checkout, in `new/<dir of main file>`, with plain
//     `latexmk -f -pdf -silent <main>`. latexmk reads only a `.latexmkrc` found in
//     that directory (plus global user rc files), never VS Code or LaTeX Workshop
//     settings.
//   - `--build-dir X` does NOT change where latexmk writes. It only changes where
//     git-latexdiff looks for the PDF: `X/<main>.pdf`, relative to the repo root.
//     Without it, it looks in the main file's own directory.
// So --build-dir is correct only when a `.latexmkrc` next to the main file sets
// `$out_dir`, and the value must include the main file's directory.

export const LATEXMKRC_NAMES = [".latexmkrc", "latexmkrc"] as const;

export function extraArgsHasBuildDir(extraArgs: string[]): boolean {
  return extraArgs.some((arg) => arg === "--build-dir" || arg.startsWith("--build-dir="));
}

export function normalizeBuildDir(raw: string): string {
  let value = raw.trim().replace(/\\/g, "/");
  value = value.replace(/%DIR%\//gi, "").replace(/%DIR%/gi, "");
  value = value.replace(/%OUTDIR%\//gi, "").replace(/%OUTDIR%/gi, "");
  value = value.replace(/^(\.\/)+/, "");
  value = value.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!value || value === ".") {
    return "";
  }
  return value;
}

/**
 * Reads `$out_dir` from the text of a .latexmkrc. Understands single or double
 * quotes, chained assignments (`$out_dir = $aux_dir = 'build';`), and ignores
 * commented lines. Returns "" when it is unset or not a plain string.
 */
export function parseLatexmkOutDir(text: string): string {
  let found = "";
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    const match = line.match(/\$out_dir\s*=(?:\s*\$\w+\s*=)*\s*(['"])([^'"]*)\1/);
    if (match) {
      found = normalizeBuildDir(match[2]);
    }
  }
  return found;
}

export function posixDirname(file: string): string {
  const clean = file.replace(/\\/g, "/");
  const slash = clean.lastIndexOf("/");
  return slash < 0 ? "" : clean.slice(0, slash);
}

/** Paths a `.latexmkrc` can have for a main file: only its own directory counts. */
export function latexmkrcCandidates(mainFile: string): string[] {
  const dir = posixDirname(mainFile);
  return LATEXMKRC_NAMES.map((name) => (dir ? `${dir}/${name}` : name));
}

/**
 * Value for `--build-dir`, or "" when it must not be passed.
 *
 * `configured` is an explicit user override (latexDiff.buildDir) and wins as-is.
 * Otherwise it is derived only from a .latexmkrc beside the main file, because
 * that is the only configuration latexmk honors inside git-latexdiff's temp dir.
 * LaTeX Workshop's `latex.outDir` is deliberately ignored.
 */
export function resolveBuildDir(opts: {
  configured: string;
  mainFile: string;
  latexmkrcText: string | undefined;
}): string {
  const explicit = normalizeBuildDir(opts.configured);
  if (explicit) {
    return explicit;
  }
  if (opts.latexmkrcText === undefined) {
    return "";
  }
  const outDir = parseLatexmkOutDir(opts.latexmkrcText);
  if (!outDir) {
    return "";
  }
  const mainDir = posixDirname(opts.mainFile);
  return mainDir ? `${mainDir}/${outDir}` : outDir;
}

export function isNoPdfFailure(output: string): boolean {
  return /No PDF file generated/i.test(output) || /Expected PDF:/i.test(output);
}

export function expectedPdfFrom(output: string): string | undefined {
  const match = output.match(/Expected PDF:\s*(.+)/i);
  return match ? match[1].trim() : undefined;
}

/**
 * Error text for "No PDF file generated". The cause can go both ways: the PDF
 * was expected in --build-dir but latexmk wrote it elsewhere, or the PDF was
 * expected in the project folder but latexmk wrote it into an out dir.
 */
export function noPdfMessage(opts: {
  exitCode: number;
  expectedPdf: string | undefined;
  passedBuildDir: string;
}): string {
  const expected = opts.expectedPdf ? ` in ${opts.expectedPdf}` : "";
  const head = `git latexdiff failed (exit ${opts.exitCode}): git-latexdiff expected the PDF${expected}, but latexmk wrote it somewhere else.`;
  const tips: string[] = [];
  if (opts.passedBuildDir) {
    tips.push(
      `The extension passed --build-dir ${opts.passedBuildDir}. If the project has no .latexmkrc setting $out_dir, clear latexDiff.buildDir (latexmk writes next to the .tex file during the diff build, whatever LaTeX Workshop's outDir says).`
    );
  } else {
    tips.push(
      "If the project has a .latexmkrc beside the main file that sets $out_dir, set latexDiff.buildDir to that $out_dir (including the main file's folder if it is not in the repo root)."
    );
  }
  tips.push("See the LaTeX Diff output channel.");
  return `${head} ${tips.join(" ")}`;
}
