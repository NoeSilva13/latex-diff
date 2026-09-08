import * as path from "path";
import * as vscode from "vscode";
import {
  BIBLIOGRAPHIES,
  ENGINES,
  extraArgsHasBuildDir,
  outputDisplay,
  parseOutputInput,
  readSettings,
  resolveBuildDir,
  updateConfig,
  type BoolSetting,
} from "./config";
import {
  WORKING_TREE_HASH,
  WORKING_TREE_LABEL,
  commitLabel,
  fileExistsInCommit,
  findRepoRoot,
  gitLatexdiffAvailable,
  listCommits,
  type GitCommit,
} from "./git";
import { runGitLatexdiff } from "./latexdiff";
import { pickMainFile, resolveMainFile } from "./mainFile";
import { DiffSession, type StoredRef } from "./session";
import { ActionItem, LatexDiffSidebarProvider } from "./sidebar";

let output: vscode.OutputChannel | undefined;
let session: DiffSession;
let sidebar: LatexDiffSidebarProvider;

function logChannel(): vscode.OutputChannel {
  if (!output) {
    output = vscode.window.createOutputChannel("LaTeX Diff");
  }
  return output;
}

function workspaceCwd(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error("Open a workspace folder first.");
  }
  return folder.uri.fsPath;
}

interface RefChoice {
  label: string;
  description?: string;
  hash: string;
}

function toOldItems(commits: GitCommit[]): RefChoice[] {
  return commits.map((c) => ({
    label: commitLabel(c),
    description: c.hash,
    hash: c.hash,
  }));
}

function toNewItems(commits: GitCommit[]): RefChoice[] {
  return [
    { label: WORKING_TREE_LABEL, hash: WORKING_TREE_HASH, description: "Uncommitted changes" },
    { label: "HEAD", hash: "HEAD", description: "Current commit" },
    ...toOldItems(commits),
  ];
}

async function pickRef(title: string, items: RefChoice[]): Promise<StoredRef | undefined> {
  const picked = await vscode.window.showQuickPick(items, {
    title,
    placeHolder: title,
    matchOnDescription: true,
  });
  if (!picked) {
    return undefined;
  }
  return { hash: picked.hash, label: picked.label };
}

async function loadCommits(): Promise<{ repoRoot: string; commits: GitCommit[] }> {
  const repoRoot = await findRepoRoot(workspaceCwd());
  const commits = await listCommits(repoRoot);
  if (commits.length === 0) {
    throw new Error("This repository has no commits yet.");
  }
  return { repoRoot, commits };
}

async function ensureTools(repoRoot: string): Promise<void> {
  if (!(await gitLatexdiffAvailable(repoRoot))) {
    throw new Error(
      "git-latexdiff is not available. Install it and ensure git latexdiff --help works in a terminal."
    );
  }
}

async function ensureTexInCommits(
  repoRoot: string,
  mainFile: string,
  oldCommit: string,
  newCommit: string
): Promise<void> {
  const oldOk = await fileExistsInCommit(repoRoot, oldCommit, mainFile);
  if (!oldOk) {
    throw new Error(
      `"${mainFile}" does not exist in old revision ${oldCommit}. Pick a commit that already contains this file.`
    );
  }
  const newOk = await fileExistsInCommit(repoRoot, newCommit, mainFile);
  if (!newOk) {
    throw new Error(
      `"${mainFile}" does not exist in new revision ${newCommit}. Pick a commit that already contains this file.`
    );
  }
}

async function generateDiff(opts: {
  mainFile?: string;
  oldCommit: string;
  newCommit: string;
}): Promise<void> {
  const cwd = workspaceCwd();
  const repoRoot = await findRepoRoot(cwd);
  await ensureTools(repoRoot);

  const mainFile = await resolveMainFile(repoRoot, opts.mainFile);
  if (opts.oldCommit === opts.newCommit && opts.newCommit !== WORKING_TREE_HASH) {
    throw new Error("Old and New commits must be different.");
  }
  await ensureTexInCommits(repoRoot, mainFile, opts.oldCommit, opts.newCommit);

  const flags = readSettings();
  const buildDir = extraArgsHasBuildDir(flags.extraArgs)
    ? ""
    : resolveBuildDir(repoRoot, flags.buildDir);
  const channel = logChannel();
  channel.clear();
  channel.show(true);
  channel.appendLine(`Repository: ${repoRoot}`);
  channel.appendLine(`Main file:  ${mainFile}`);
  channel.appendLine(`Old:        ${opts.oldCommit}`);
  channel.appendLine(`New:        ${opts.newCommit}`);
  channel.appendLine(`Output:     ${outputDisplay(flags)}`);
  if (flags.latexmk && buildDir) {
    channel.appendLine(`Build dir:  ${buildDir}`);
  }
  channel.appendLine("");

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "LaTeX Diff: generating revision PDF…",
      cancellable: false,
    },
    async () =>
      runGitLatexdiff(
        {
          repoRoot,
          mainFile,
          oldCommit: opts.oldCommit,
          newCommit: opts.newCommit,
          outputDir: flags.outputDir,
          outputFile: flags.outputFile,
          wholeTree: flags.wholeTree,
          latexmk: flags.latexmk,
          ignoreLatexErrors: flags.ignoreLatexErrors,
          bibliography: flags.bibliography,
          engine: flags.engine,
          lnUntracked: flags.lnUntracked,
          verbose: flags.verbose,
          extraArgs: flags.extraArgs,
          buildDir,
        },
        (chunk) => channel.append(chunk)
      )
  );

  if (result.exitCode !== 0) {
    const combined = `${result.stdout}\n${result.stderr}`;
    if (/No PDF file generated/i.test(combined) || /Expected PDF:/i.test(combined)) {
      throw new Error(
        `git latexdiff failed (exit ${result.exitCode}): latexmk wrote the PDF under a build folder, but git-latexdiff looked in the project root. Set latexDiff.buildDir (for example build) or add --build-dir to extraArgs. See the LaTeX Diff output channel.`
      );
    }
    throw new Error(
      `git latexdiff failed (exit ${result.exitCode}). See the LaTeX Diff output channel.`
    );
  }

  const uri = vscode.Uri.file(result.outputPdf);
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    throw new Error(`Command succeeded but the PDF was not found:\n${result.outputPdf}`);
  }

  await vscode.commands.executeCommand("vscode.open", uri);
  void vscode.window.showInformationMessage(`Opened ${result.outputPdf}`);
}

async function resolveStoredRefs(pickIfMissing: boolean): Promise<{ old: StoredRef; neu: StoredRef } | undefined> {
  const { repoRoot, commits } = await loadCommits();
  await session.ensureDefaults(repoRoot);

  let old = session.getOld();
  let neu = session.getNew();

  if (!old && pickIfMissing) {
    old = await pickRef("LaTeX Diff: Old commit", toOldItems(commits));
    if (!old) {
      return undefined;
    }
    await session.setOld(old);
  }
  if (!neu && pickIfMissing) {
    neu = await pickRef("LaTeX Diff: New commit", toNewItems(commits));
    if (!neu) {
      return undefined;
    }
    await session.setNew(neu);
  }
  if (!old || !neu) {
    throw new Error("Select Old and New commits in the LaTeX Diff sidebar.");
  }
  sidebar.refresh();
  return { old, neu };
}

async function commandGenerate(forcedMain?: string): Promise<void> {
  const refs = await resolveStoredRefs(true);
  if (!refs) {
    return;
  }
  await generateDiff({
    mainFile: forcedMain,
    oldCommit: refs.old.hash,
    newCommit: refs.neu.hash,
  });
}

async function commandCompareCommits(forcedMain?: string): Promise<void> {
  const { commits } = await loadCommits();
  const old = await pickRef("LaTeX Diff: Old commit", toOldItems(commits));
  if (!old) {
    return;
  }
  const neu = await pickRef("LaTeX Diff: New commit", toNewItems(commits));
  if (!neu) {
    return;
  }
  await session.setOld(old);
  await session.setNew(neu);
  sidebar.refresh();
  await generateDiff({ mainFile: forcedMain, oldCommit: old.hash, newCommit: neu.hash });
}

async function commandLastCommit(): Promise<void> {
  await session.setOld({ hash: "HEAD~1", label: "HEAD~1" });
  await session.setNew({ hash: "HEAD", label: "HEAD" });
  sidebar.refresh();
  await generateDiff({ oldCommit: "HEAD~1", newCommit: "HEAD" });
}

function texUri(uri?: vscode.Uri): vscode.Uri | undefined {
  if (uri?.scheme === "file" && uri.fsPath.endsWith(".tex")) {
    return uri;
  }
  const active = vscode.window.activeTextEditor?.document;
  if (active?.uri.scheme === "file" && active.fileName.endsWith(".tex")) {
    return active.uri;
  }
  return undefined;
}

async function commandCompareThisFile(uri?: vscode.Uri): Promise<void> {
  const file = texUri(uri);
  if (!file) {
    throw new Error("Open a .tex file first.");
  }
  const repoRoot = await findRepoRoot(file.fsPath);
  const rel = path.relative(repoRoot, file.fsPath).split(path.sep).join("/");
  await updateConfig("mainFile", rel);
  sidebar.refresh();
  await commandGenerate(rel);
}

async function commandOpenOutputDir(): Promise<void> {
  const repoRoot = await findRepoRoot(workspaceCwd());
  const outputDir = readSettings().outputDir;
  const dirUri = vscode.Uri.file(path.join(repoRoot, outputDir));
  await vscode.workspace.fs.createDirectory(dirUri);
  await vscode.commands.executeCommand("revealInExplorer", dirUri);
}

async function commandShowLog(): Promise<void> {
  logChannel().show(true);
}

async function commandRefreshCommits(): Promise<void> {
  const repoRoot = await findRepoRoot(workspaceCwd());
  const count = await session.refreshLabels(repoRoot);
  await session.ensureDefaults(repoRoot);
  sidebar.refresh();
  logChannel().appendLine(`Loaded ${count} commit(s).`);
  void vscode.window.showInformationMessage(`LaTeX Diff: loaded ${count} commit(s).`);
}

async function commandPickOld(): Promise<void> {
  const { commits } = await loadCommits();
  const picked = await pickRef("LaTeX Diff: Old commit", toOldItems(commits));
  if (!picked) {
    return;
  }
  await session.setOld(picked);
  sidebar.refresh();
}

async function commandPickNew(): Promise<void> {
  const { commits } = await loadCommits();
  const picked = await pickRef("LaTeX Diff: New commit", toNewItems(commits));
  if (!picked) {
    return;
  }
  await session.setNew(picked);
  sidebar.refresh();
}

async function commandPickMainFile(): Promise<void> {
  const repoRoot = await findRepoRoot(workspaceCwd());
  const picked = await pickMainFile(repoRoot);
  if (picked === undefined) {
    return;
  }
  await updateConfig("mainFile", picked);
}

async function commandPickOutput(): Promise<void> {
  const settings = readSettings();
  const value = await vscode.window.showInputBox({
    title: "LaTeX Diff: Output PDF",
    value: outputDisplay(settings),
    prompt: "Folder (diffs) or PDF path (diffs/diff-output.pdf), relative to the repository.",
  });
  if (value === undefined) {
    return;
  }
  const parsed = parseOutputInput(value, settings.outputDir);
  await updateConfig("outputDir", parsed.outputDir);
  await updateConfig("outputFile", parsed.outputFile);
}

async function commandPickBuildDir(): Promise<void> {
  const settings = readSettings();
  let placeholder = settings.buildDir;
  try {
    const repoRoot = await findRepoRoot(workspaceCwd());
    placeholder = resolveBuildDir(repoRoot, settings.buildDir) || settings.buildDir;
  } catch {
    // not a git repo
  }
  const value = await vscode.window.showInputBox({
    title: "LaTeX Diff: latexmk build directory",
    value: settings.buildDir,
    placeHolder: placeholder || "build",
    prompt: "Relative folder where latexmk writes the PDF (--build-dir). Empty = auto-detect.",
  });
  if (value === undefined) {
    return;
  }
  await updateConfig("buildDir", value.trim());
}

async function commandPickBibliography(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    BIBLIOGRAPHIES.map((id) => ({
      label: id,
      description: id === "none" ? "Do not pass a bibliography flag" : `--${id}`,
    })),
    { title: "LaTeX Diff: Bibliography" }
  );
  if (!picked) {
    return;
  }
  await updateConfig("bibliography", picked.label);
}

async function commandPickEngine(): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    ENGINES.map((id) => ({
      label: id,
      description: id === "pdflatex" ? "Default (no extra flag)" : `--${id}`,
    })),
    { title: "LaTeX Diff: Engine" }
  );
  if (!picked) {
    return;
  }
  await updateConfig("engine", picked.label);
}

async function applyCheckbox(item: ActionItem, checked: boolean): Promise<void> {
  if (!item.setting) {
    return;
  }
  const key: BoolSetting = item.setting;
  await updateConfig(key, checked);
}

function asErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function wrap<T extends unknown[]>(run: (...args: T) => Promise<void>): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await run(...args);
    } catch (err) {
      const message = asErrorMessage(err);
      logChannel().appendLine(message);
      void vscode.window.showErrorMessage(message);
    }
  };
}

async function bootstrap(): Promise<void> {
  try {
    const repoRoot = await findRepoRoot(workspaceCwd());
    await session.ensureDefaults(repoRoot);
    sidebar.refresh();
  } catch {
    // Workspace is not a Git repo yet; the sidebar still lists actions.
  }
}

export function activate(context: vscode.ExtensionContext): void {
  session = new DiffSession(context);
  sidebar = new LatexDiffSidebarProvider(session);
  const tree = vscode.window.createTreeView("latexDiff.actions", {
    treeDataProvider: sidebar,
    showCollapseAll: false,
  });

  context.subscriptions.push(
    tree,
    tree.onDidChangeCheckboxState((e) => {
      for (const [item, state] of e.items) {
        if (item instanceof ActionItem) {
          void applyCheckbox(item, state === vscode.TreeItemCheckboxState.Checked);
        }
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("latexDiff")) {
        sidebar.refresh();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => sidebar.refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void bootstrap();
    }),
    vscode.commands.registerCommand("latexDiff.generate", wrap(() => commandGenerate())),
    vscode.commands.registerCommand("latexDiff.compareCommits", wrap(() => commandCompareCommits())),
    vscode.commands.registerCommand("latexDiff.lastCommit", wrap(commandLastCommit)),
    vscode.commands.registerCommand("latexDiff.compareThisFile", wrap(commandCompareThisFile)),
    vscode.commands.registerCommand("latexDiff.openOutputDir", wrap(commandOpenOutputDir)),
    vscode.commands.registerCommand("latexDiff.showLog", wrap(commandShowLog)),
    vscode.commands.registerCommand("latexDiff.refreshCommits", wrap(commandRefreshCommits)),
    vscode.commands.registerCommand("latexDiff.pickOld", wrap(commandPickOld)),
    vscode.commands.registerCommand("latexDiff.pickNew", wrap(commandPickNew)),
    vscode.commands.registerCommand("latexDiff.pickMainFile", wrap(commandPickMainFile)),
    vscode.commands.registerCommand("latexDiff.pickOutput", wrap(commandPickOutput)),
    vscode.commands.registerCommand("latexDiff.pickBuildDir", wrap(commandPickBuildDir)),
    vscode.commands.registerCommand("latexDiff.pickBibliography", wrap(commandPickBibliography)),
    vscode.commands.registerCommand("latexDiff.pickEngine", wrap(commandPickEngine))
  );

  void bootstrap();
}

export function deactivate(): void {
  output?.dispose();
  output = undefined;
}
