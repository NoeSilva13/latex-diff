import * as path from "path";
import * as vscode from "vscode";

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function relativeToRepo(repoRoot: string, filePath: string): string {
  return toPosix(path.relative(repoRoot, filePath));
}

async function findDocumentclassFiles(
  folder: vscode.WorkspaceFolder
): Promise<vscode.Uri[]> {
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, "**/*.tex"),
    "**/{node_modules,build,diffs,.git}/**",
    50
  );
  const matches: vscode.Uri[] = [];
  for (const uri of uris) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");
    if (/\\documentclass\b/.test(text)) {
      matches.push(uri);
    }
  }
  return matches;
}

function workspaceFolderFor(repoRoot: string): vscode.WorkspaceFolder | undefined {
  return (
    vscode.workspace.workspaceFolders?.find((f) => repoRoot.startsWith(f.uri.fsPath)) ??
    vscode.workspace.workspaceFolders?.[0]
  );
}

export function describeMainFile(repoRoot?: string): string {
  const configured = (vscode.workspace.getConfiguration("latexDiff").get<string>("mainFile") ?? "").trim();
  if (configured) {
    return configured;
  }
  const active = vscode.window.activeTextEditor?.document;
  if (active?.uri.scheme === "file" && active.fileName.endsWith(".tex")) {
    if (repoRoot) {
      return relativeToRepo(repoRoot, active.fileName);
    }
    return vscode.workspace.asRelativePath(active.uri).split(path.sep).join("/");
  }
  return "Auto-detect";
}

export async function pickMainFile(repoRoot: string): Promise<string | undefined> {
  const folder = workspaceFolderFor(repoRoot);
  const items: Array<{ label: string; description?: string; browse?: boolean; clear?: boolean }> = [];

  if (folder) {
    const mains = await findDocumentclassFiles(folder);
    for (const uri of mains) {
      items.push({
        label: relativeToRepo(repoRoot, uri.fsPath),
        description: "Contains \\documentclass",
      });
    }
  }

  items.push({ label: "Browse…", description: "Pick a .tex file", browse: true });
  items.push({ label: "Auto-detect", description: "Clear latexDiff.mainFile", clear: true });

  const picked = await vscode.window.showQuickPick(items, {
    title: "LaTeX Diff: Main .tex",
    placeHolder: "Main file",
  });
  if (!picked) {
    return undefined;
  }
  if (picked.clear) {
    return "";
  }
  if (picked.browse) {
    const uris = await vscode.window.showOpenDialog({
      title: "Select main TeX file",
      defaultUri: vscode.Uri.file(repoRoot),
      canSelectMany: false,
      filters: { TeX: ["tex"], "All files": ["*"] },
    });
    if (!uris?.[0]) {
      return undefined;
    }
    return relativeToRepo(repoRoot, uris[0].fsPath);
  }
  return picked.label;
}

export async function resolveMainFile(
  repoRoot: string,
  forcedRelative?: string
): Promise<string> {
  if (forcedRelative) {
    return toPosix(forcedRelative);
  }

  const config = vscode.workspace.getConfiguration("latexDiff");
  const configured = (config.get<string>("mainFile") ?? "").trim();
  if (configured) {
    return toPosix(configured);
  }

  const active = vscode.window.activeTextEditor?.document;
  if (active?.uri.scheme === "file" && active.fileName.endsWith(".tex")) {
    return relativeToRepo(repoRoot, active.fileName);
  }

  const folder = workspaceFolderFor(repoRoot);

  if (folder) {
    const mains = await findDocumentclassFiles(folder);
    if (mains.length === 1) {
      return relativeToRepo(repoRoot, mains[0].fsPath);
    }
    if (mains.length > 1) {
      const picked = await vscode.window.showQuickPick(
        mains.map((uri) => ({
          label: relativeToRepo(repoRoot, uri.fsPath),
          uri,
        })),
        { title: "LaTeX Diff: select the main .tex file", placeHolder: "Main file" }
      );
      if (!picked) {
        throw new Error("No main .tex file selected.");
      }
      return picked.label;
    }
  }

  throw new Error(
    "Could not find a main .tex file. Open one, or set latexDiff.mainFile."
  );
}
