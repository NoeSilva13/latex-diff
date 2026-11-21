import * as vscode from "vscode";
import { resolveChoice, type ChoiceKey, type Choices } from "./choices";

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
  buildDir: string;
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

const CHOICES_STATE_KEY = "latexDiff.panelChoices";

let choicesState: vscode.Memento | undefined;
const choicesChanged = new vscode.EventEmitter<void>();

/** Fires when a panel choice is saved or reset, so the sidebar can redraw. */
export const onDidChangeChoices = choicesChanged.event;

export function initChoices(context: vscode.ExtensionContext): void {
  choicesState = context.workspaceState;
  context.subscriptions.push(choicesChanged);
}

function readChoices(): Choices {
  return choicesState?.get<Choices>(CHOICES_STATE_KEY) ?? {};
}

/**
 * Saves a choice made in the panel. It lives in VS Code's per-workspace storage,
 * never in `.vscode/settings.json`, so the user's repository stays untouched.
 */
export async function setChoice(key: ChoiceKey, value: string | boolean): Promise<void> {
  await choicesState?.update(CHOICES_STATE_KEY, { ...readChoices(), [key]: value });
  choicesChanged.fire();
}

export function hasChoices(): boolean {
  return Object.keys(readChoices()).length > 0;
}

export async function resetChoices(): Promise<void> {
  await choicesState?.update(CHOICES_STATE_KEY, undefined);
  choicesChanged.fire();
}

/** Effective options: panel choices first, then `latexDiff.*` settings, then defaults. */
export function readSettings(): DiffSettings {
  const cfg = vscode.workspace.getConfiguration("latexDiff");
  const choices = readChoices();
  const text = (key: ChoiceKey, fallback: string): string =>
    resolveChoice(choices, key, cfg.get<string>(key), fallback).trim() || fallback;
  const flag = (key: ChoiceKey, fallback: boolean): boolean =>
    resolveChoice(choices, key, cfg.get<boolean>(key), fallback);
  return {
    mainFile: text("mainFile", ""),
    outputDir: text("outputDir", "diffs"),
    outputFile: text("outputFile", ""),
    buildDir: text("buildDir", ""),
    wholeTree: flag("wholeTree", true),
    latexmk: flag("latexmk", true),
    ignoreLatexErrors: flag("ignoreLatexErrors", true),
    bibliography: asEnum(
      resolveChoice(choices, "bibliography", cfg.get<string>("bibliography"), "none"),
      BIBLIOGRAPHIES,
      "none"
    ),
    engine: asEnum(
      resolveChoice(choices, "engine", cfg.get<string>("engine"), "pdflatex"),
      ENGINES,
      "pdflatex"
    ),
    lnUntracked: flag("lnUntracked", false),
    verbose: flag("verbose", false),
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
