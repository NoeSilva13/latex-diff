import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { extraArgsHasBuildDir, type Bibliography, type Engine } from "./config";
import { WORKING_TREE_HASH } from "./git";

export interface LatexDiffOptions {
  repoRoot: string;
  mainFile: string;
  oldCommit: string;
  newCommit: string;
  outputDir: string;
  outputFile: string;
  wholeTree: boolean;
  latexmk: boolean;
  ignoreLatexErrors: boolean;
  bibliography: Bibliography;
  engine: Engine;
  lnUntracked: boolean;
  verbose: boolean;
  extraArgs: string[];
  buildDir: string;
}

export interface LatexDiffResult {
  command: string;
  outputPdf: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

function safeSlug(ref: string): string {
  if (ref === WORKING_TREE_HASH) {
    return "working-tree";
  }
  return ref.replace(/[^\w.-]+/g, "-");
}

export function resolveOutputPdf(opts: LatexDiffOptions): string {
  if (opts.outputFile) {
    return path.join(opts.repoRoot, opts.outputDir, opts.outputFile);
  }
  const fileName = `diff-${safeSlug(opts.oldCommit)}-${safeSlug(opts.newCommit)}.pdf`;
  return path.join(opts.repoRoot, opts.outputDir, fileName);
}

export function buildCommand(opts: LatexDiffOptions): { args: string[]; outputPdf: string } {
  const outputPdf = resolveOutputPdf(opts);
  const args = ["latexdiff", "--main", opts.mainFile, "--output", outputPdf];
  if (opts.wholeTree) {
    args.push("--whole-tree");
  }
  if (opts.latexmk) {
    args.push("--latexmk");
    if (opts.buildDir && !extraArgsHasBuildDir(opts.extraArgs)) {
      args.push("--build-dir", opts.buildDir);
    }
  }
  if (opts.ignoreLatexErrors) {
    args.push("--ignore-latex-errors");
  }
  if (opts.bibliography === "bibtex") {
    args.push("--bibtex");
  } else if (opts.bibliography === "biber") {
    args.push("--biber");
  }
  if (opts.engine === "latex") {
    args.push("--latex");
  } else if (opts.engine === "xelatex") {
    args.push("--xelatex");
  } else if (opts.engine === "lualatex") {
    args.push("--lualatex");
  } else if (opts.engine === "tectonic") {
    args.push("--tectonic");
  }
  if (opts.lnUntracked) {
    args.push("--ln-untracked");
  }
  if (opts.verbose) {
    args.push("--verbose");
  }
  args.push(...opts.extraArgs, "--no-view", opts.oldCommit, opts.newCommit);
  return { args, outputPdf };
}

export async function runGitLatexdiff(
  opts: LatexDiffOptions,
  onLog?: (chunk: string) => void
): Promise<LatexDiffResult> {
  const { args, outputPdf } = buildCommand(opts);
  await fs.mkdir(path.dirname(outputPdf), { recursive: true });

  const command = ["git", ...args].join(" ");
  onLog?.(`Running:\n  ${command}\n\n`);

  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: opts.repoRoot,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (buf: Buffer) => {
      const text = buf.toString();
      stdout += text;
      onLog?.(text);
    });
    child.stderr.on("data", (buf: Buffer) => {
      const text = buf.toString();
      stderr += text;
      onLog?.(text);
    });
    child.on("error", (err) => {
      reject(err);
    });
    child.on("close", (code) => {
      resolve({
        command,
        outputPdf,
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}
