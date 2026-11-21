// Choices made in the LaTeX Diff panel are stored in VS Code's own per-workspace
// storage, not in `.vscode/settings.json`, so using the extension never creates
// or edits files inside the user's paper repository. They take precedence over
// the `latexDiff.*` settings, which stay the defaults. No `vscode` import here,
// so the precedence rule is unit tested.

export const CHOICE_KEYS = [
  "mainFile",
  "outputDir",
  "outputFile",
  "buildDir",
  "wholeTree",
  "latexmk",
  "ignoreLatexErrors",
  "bibliography",
  "engine",
  "lnUntracked",
  "verbose",
] as const;

export type ChoiceKey = (typeof CHOICE_KEYS)[number];
export type Choices = Partial<Record<ChoiceKey, string | boolean>>;

/**
 * Panel choice if there is one of the right type, else the configured setting,
 * else the fallback. An empty string is a valid choice (for example "Auto-detect"
 * main file), so only `undefined` means "not chosen".
 */
export function resolveChoice<T extends string | boolean>(
  choices: Choices,
  key: ChoiceKey,
  configured: T | undefined,
  fallback: T
): T {
  const chosen = choices[key];
  if (chosen !== undefined && typeof chosen === typeof fallback) {
    return chosen as T;
  }
  return configured ?? fallback;
}
