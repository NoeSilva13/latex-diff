import type { LatexDiffOptions } from "../latexdiff";

export function options(overrides: Partial<LatexDiffOptions> = {}): LatexDiffOptions {
  return {
    repoRoot: "/repo",
    mainFile: "paper.tex",
    oldCommit: "66ee655",
    newCommit: "23c151b",
    outputDir: "diffs",
    outputFile: "",
    wholeTree: true,
    latexmk: true,
    ignoreLatexErrors: true,
    bibliography: "none",
    engine: "pdflatex",
    lnUntracked: false,
    verbose: false,
    extraArgs: [],
    buildDir: "",
    ...overrides,
  };
}
