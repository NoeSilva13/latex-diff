import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface GitCommit {
  hash: string;
  subject: string;
  relativeDate: string;
}

export const WORKING_TREE_HASH = "--";
export const WORKING_TREE_LABEL = "Working tree (uncommitted)";

export async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function findRepoRoot(start: string): Promise<string> {
  try {
    return await runGit(["rev-parse", "--show-toplevel"], start);
  } catch {
    throw new Error("Open a folder that is inside a Git repository.");
  }
}

export async function listCommits(repoRoot: string, limit = 80): Promise<GitCommit[]> {
  const out = await runGit(
    ["log", `--pretty=format:%h%x09%s%x09%cr`, `-n${limit}`],
    repoRoot
  );
  if (!out) {
    return [];
  }
  return out.split(/\r?\n/).flatMap((line) => {
    const [hash, subject, relativeDate] = line.split("\t");
    if (!hash) {
      return [];
    }
    return [{ hash, subject: subject ?? "", relativeDate: relativeDate ?? "" }];
  });
}

export function commitLabel(commit: GitCommit): string {
  const extra = commit.relativeDate ? `  ·  ${commit.relativeDate}` : "";
  return `${commit.hash}  ${commit.subject}${extra}`;
}

export async function fileExistsInCommit(
  repoRoot: string,
  commit: string,
  relativePath: string
): Promise<boolean> {
  if (commit === WORKING_TREE_HASH) {
    return true;
  }
  try {
    await runGit(["cat-file", "-e", `${commit}:${relativePath}`], repoRoot);
    return true;
  } catch {
    return false;
  }
}

export async function gitLatexdiffAvailable(cwd: string): Promise<boolean> {
  try {
    await runGit(["latexdiff", "--version"], cwd);
    return true;
  } catch {
    return false;
  }
}
