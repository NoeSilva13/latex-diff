import * as vscode from "vscode";

export const BIBLIOGRAPHIES = ["none", "bibtex", "biber"] as const;
export const ENGINES = ["pdflatex", "latex", "xelatex", "lualatex", "tectonic"] as const;

export type Bibliography = (typeof BIBLIOGRAPHIES)[number];
export type Engine = (typeof ENGINES)[number];

export type BoolSetting =
  | "wholeTree"
  | "latexmk"
  | "ignoreLatexErrors"
  | "lnUntracked"
  | "verbose";

export interface DiffSettings {
  mainFile: string;
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
}

export function splitExtraArgs(value: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    out.push(match[1] ?? match[2] ?? match[3]);
  }
  return out;
}

function asEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

export function readSettings(): DiffSettings {
  const cfg = vscode.workspace.getConfiguration("latexDiff");
  return {
    mainFile: (cfg.get<string>("mainFile") ?? "").trim(),
    outputDir: (cfg.get<string>("outputDir") ?? "diffs").trim() || "diffs",
    outputFile: (cfg.get<string>("outputFile") ?? "").trim(),
    wholeTree: cfg.get<boolean>("wholeTree") ?? true,
    latexmk: cfg.get<boolean>("latexmk") ?? true,
    ignoreLatexErrors: cfg.get<boolean>("ignoreLatexErrors") ?? true,
    bibliography: asEnum(cfg.get<string>("bibliography"), BIBLIOGRAPHIES, "none"),
    engine: asEnum(cfg.get<string>("engine"), ENGINES, "pdflatex"),
    lnUntracked: cfg.get<boolean>("lnUntracked") ?? false,
    verbose: cfg.get<boolean>("verbose") ?? false,
    extraArgs: splitExtraArgs(cfg.get<string>("extraArgs") ?? ""),
  };
}

export function outputDisplay(settings: DiffSettings): string {
  if (settings.outputFile) {
    return `${settings.outputDir}/${settings.outputFile}`;
  }
  return `${settings.outputDir}/diff-<old>-<new>.pdf`;
}

export function parseOutputInput(
  value: string,
  currentDir: string
): { outputDir: string; outputFile: string } {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return { outputDir: "diffs", outputFile: "" };
  }
  if (trimmed.toLowerCase().endsWith(".pdf")) {
    const slash = trimmed.lastIndexOf("/");
    if (slash >= 0) {
      return {
        outputDir: trimmed.slice(0, slash) || ".",
        outputFile: trimmed.slice(slash + 1),
      };
    }
    return { outputDir: currentDir || "diffs", outputFile: trimmed };
  }
  return { outputDir: trimmed.replace(/\/$/, "") || "diffs", outputFile: "" };
}

export async function updateConfig(key: string, value: unknown): Promise<void> {
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await vscode.workspace.getConfiguration("latexDiff").update(key, value, target);
}
