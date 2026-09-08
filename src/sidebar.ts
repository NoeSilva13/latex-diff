import * as path from "path";
import * as vscode from "vscode";
import { outputDisplay, readSettings, type BoolSetting } from "./config";
import { findRepoRoot } from "./git";
import { describeMainFile } from "./mainFile";
import type { DiffSession } from "./session";

export class ActionItem extends vscode.TreeItem {
  constructor(
    public readonly nodeId: string,
    label: string,
    opts?: {
      command?: string;
      icon?: string;
      description?: string;
      tooltip?: string;
      collapsible?: boolean;
      checkbox?: boolean;
      checked?: boolean;
      setting?: BoolSetting;
    }
  ) {
    super(
      label,
      opts?.collapsible
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );
    this.id = nodeId;
    this.setting = opts?.setting;
    this.description = opts?.description;
    this.tooltip = opts?.tooltip ?? (opts?.description ? `${label}: ${opts.description}` : label);
    if (opts?.icon) {
      this.iconPath = new vscode.ThemeIcon(opts.icon);
    }
    if (opts?.command) {
      this.command = { command: opts.command, title: label };
    }
    if (opts?.checkbox) {
      this.checkboxState = opts.checked
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
    }
  }

  readonly setting?: BoolSetting;
}

function workspaceCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export class LatexDiffSidebarProvider implements vscode.TreeDataProvider<ActionItem> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly session: DiffSession) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: ActionItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ActionItem): Promise<ActionItem[]> {
    if (!element) {
      return [
        await this.repoItem(),
        new ActionItem("run", "Run", {
          icon: "play",
          collapsible: true,
          tooltip: "Generate a PDF or open logs and output.",
        }),
        new ActionItem("options", "Options", {
          icon: "settings-gear",
          collapsible: true,
          tooltip: "Same choices as the Python LaTeX Diff GUI, plus a few git-latexdiff extras.",
        }),
      ];
    }
    if (element.nodeId === "run") {
      return this.runItems();
    }
    if (element.nodeId === "options") {
      return this.optionItems();
    }
    return [];
  }

  private async repoItem(): Promise<ActionItem> {
    const cwd = workspaceCwd();
    let description = "Open a Git folder";
    try {
      if (cwd) {
        const root = await findRepoRoot(cwd);
        description = path.basename(root);
      }
    } catch {
      description = "No Git repository";
    }
    return new ActionItem("repo", "Repository", {
      icon: "repo",
      description,
      tooltip: "Git repository used for git latexdiff.",
    });
  }

  private runItems(): ActionItem[] {
    return [
      new ActionItem("generate", "Generate PDF", {
        command: "latexDiff.generate",
        icon: "file-pdf",
        tooltip: "Run git latexdiff with the Old, New, and options below.",
      }),
      new ActionItem("last", "Last Commit", {
        command: "latexDiff.lastCommit",
        icon: "history",
        tooltip: "Compare HEAD~1 with HEAD.",
      }),
      new ActionItem("refresh", "Refresh commits", {
        command: "latexDiff.refreshCommits",
        icon: "refresh",
        tooltip: "Reload git log and update Old/New labels.",
      }),
      new ActionItem("openDiffs", "Open output folder", {
        command: "latexDiff.openOutputDir",
        icon: "folder-opened",
        tooltip: "Reveal the folder where revision PDFs are written.",
      }),
      new ActionItem("showLog", "Show log", {
        command: "latexDiff.showLog",
        icon: "output",
        tooltip: "Open the LaTeX Diff output channel.",
      }),
    ];
  }

  private optionItems(): ActionItem[] {
    const settings = readSettings();
    const old = this.session.getOld();
    const neu = this.session.getNew();
    const cwd = workspaceCwd();
    return [
      new ActionItem("old", "Old commit", {
        command: "latexDiff.pickOld",
        icon: "git-commit",
        description: old?.label ?? "Not set",
        tooltip: "Older revision (left side of the diff).",
      }),
      new ActionItem("new", "New commit", {
        command: "latexDiff.pickNew",
        icon: "git-commit",
        description: neu?.label ?? "Not set",
        tooltip: "Newer revision, including HEAD or the working tree.",
      }),
      new ActionItem("main", "Main .tex", {
        command: "latexDiff.pickMainFile",
        icon: "file",
        description: describeMainFile(cwd),
        tooltip: "Passed as --main. Browse or auto-detect.",
      }),
      new ActionItem("output", "Output PDF", {
        command: "latexDiff.pickOutput",
        icon: "export",
        description: outputDisplay(settings),
        tooltip: "Folder or PDF path relative to the repository.",
      }),
      new ActionItem("wholeTree", "--whole-tree", {
        icon: "files",
        checkbox: true,
        checked: settings.wholeTree,
        setting: "wholeTree",
        tooltip: "Check out the whole tree (needed when figures live outside the main file).",
      }),
      new ActionItem("latexmk", "--latexmk", {
        icon: "tools",
        checkbox: true,
        checked: settings.latexmk,
        setting: "latexmk",
        tooltip: "Build with latexmk.",
      }),
      new ActionItem("ignoreErrors", "--ignore-latex-errors", {
        icon: "warning",
        checkbox: true,
        checked: settings.ignoreLatexErrors,
        setting: "ignoreLatexErrors",
        tooltip: "Keep going if LaTeX reports errors, as long as a PDF is produced.",
      }),
      new ActionItem("bibliography", "Bibliography", {
        command: "latexDiff.pickBibliography",
        icon: "book",
        description: settings.bibliography,
        tooltip: "none, --bibtex, or --biber (bibliography changes in the PDF).",
      }),
      new ActionItem("engine", "Engine", {
        command: "latexDiff.pickEngine",
        icon: "circuit-board",
        description: settings.engine,
        tooltip: "pdflatex (default), latex, xelatex, lualatex, or tectonic.",
      }),
      new ActionItem("lnUntracked", "--ln-untracked", {
        icon: "link",
        checkbox: true,
        checked: settings.lnUntracked,
        setting: "lnUntracked",
        tooltip: "Symlink uncommitted files from the working tree (new figures).",
      }),
      new ActionItem("verbose", "--verbose", {
        icon: "list-unordered",
        checkbox: true,
        checked: settings.verbose,
        setting: "verbose",
        tooltip: "More git-latexdiff output in the log.",
      }),
    ];
  }
}
