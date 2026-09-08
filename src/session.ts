import * as vscode from "vscode";
import { commitLabel, listCommits } from "./git";

const OLD_KEY = "latexDiff.oldRef";
const NEW_KEY = "latexDiff.newRef";

export interface StoredRef {
  hash: string;
  label: string;
}

export class DiffSession {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getOld(): StoredRef | undefined {
    return this.context.workspaceState.get<StoredRef>(OLD_KEY);
  }

  getNew(): StoredRef | undefined {
    return this.context.workspaceState.get<StoredRef>(NEW_KEY);
  }

  async setOld(ref: StoredRef): Promise<void> {
    await this.context.workspaceState.update(OLD_KEY, ref);
  }

  async setNew(ref: StoredRef): Promise<void> {
    await this.context.workspaceState.update(NEW_KEY, ref);
  }

  async ensureDefaults(repoRoot: string): Promise<void> {
    const commits = await listCommits(repoRoot);
    if (!this.getOld() && commits.length > 0) {
      const old = commits.length > 1 ? commits[1] : commits[0];
      await this.setOld({ hash: old.hash, label: commitLabel(old) });
    }
    if (!this.getNew()) {
      await this.setNew({ hash: "HEAD", label: "HEAD" });
    }
  }

  async refreshLabels(repoRoot: string): Promise<number> {
    const commits = await listCommits(repoRoot);
    const byHash = new Map(commits.map((c) => [c.hash, c]));
    const old = this.getOld();
    if (old && byHash.has(old.hash)) {
      await this.setOld({ hash: old.hash, label: commitLabel(byHash.get(old.hash)!) });
    }
    const neu = this.getNew();
    if (neu && byHash.has(neu.hash)) {
      await this.setNew({ hash: neu.hash, label: commitLabel(byHash.get(neu.hash)!) });
    }
    return commits.length;
  }
}
