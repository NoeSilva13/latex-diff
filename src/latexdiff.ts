import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { extraArgsHasBuildDir } from "./buildDir";
import type { Bibliography, Engine } from "./config";
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
  /** True when the run was stopped through the abort signal. */
  cancelled: boolean;
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

const FORCE_KILL_AFTER_MS = 5000;

/**
 * Stops `git latexdiff` and everything it started (the script, latexmk, pdflatex).
 * Killing only the `git` process would leave the compile running. On POSIX the
 * child is a process-group leader (`detached`), so a negative pid reaches the whole
 * group; on Windows `taskkill /T` walks the tree.
 */
function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

export async function runGitLatexdiff(
  opts: LatexDiffOptions,
  onLog?: (chunk: string) => void,
  abortSignal?: AbortSignal
): Promise<LatexDiffResult> {
  const { args, outputPdf } = buildCommand(opts);
  const command = ["git", ...args].join(" ");

  if (abortSignal?.aborted) {
    return { command, outputPdf, stdout: "", stderr: "", exitCode: 1, cancelled: true };
  }

  await fs.mkdir(path.dirname(outputPdf), { recursive: true });
  onLog?.(`Running:\n  ${command}\n\n`);

  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: opts.repoRoot,
      env: process.env,
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let cancelled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const onAbort = (): void => {
      cancelled = true;
      killTree(child, "SIGTERM");
      forceKillTimer = setTimeout(() => killTree(child, "SIGKILL"), FORCE_KILL_AFTER_MS);
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });

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
      abortSignal?.removeEventListener("abort", onAbort);
      clearTimeout(forceKillTimer);
      reject(err);
    });
    child.on("close", (code) => {
      abortSignal?.removeEventListener("abort", onAbort);
      clearTimeout(forceKillTimer);
      resolve({
        command,
        outputPdf,
        stdout,
        stderr,
        exitCode: code ?? 1,
        cancelled,
      });
    });
  });
}
