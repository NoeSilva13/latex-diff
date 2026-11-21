import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { runGitLatexdiff } from "../latexdiff";
import { options } from "./helpers";

const posixOnly = { skip: process.platform === "win32" ? "POSIX process groups" : false };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return check();
}

// A fake `git` that starts a long-running grandchild, like git -> git-latexdiff -> latexmk.
function withFakeGit(): { dir: string; pidFile: string; restore: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "latex-diff-cancel-"));
  const pidFile = path.join(dir, "grandchild.pid");
  const script = path.join(dir, "git");
  fs.writeFileSync(script, `#!/bin/sh\nsleep 60 &\necho $! > "${pidFile}"\nwait\n`, { mode: 0o755 });
  const previous = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${previous}`;
  return {
    dir,
    pidFile,
    restore: () => {
      process.env.PATH = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("cancelling stops git and the processes it started", posixOnly, async () => {
  const fake = withFakeGit();
  try {
    const abort = new AbortController();
    const started = Date.now();
    const run = runGitLatexdiff(options({ repoRoot: fake.dir }), undefined, abort.signal);

    assert.equal(await until(() => fs.existsSync(fake.pidFile) && fs.readFileSync(fake.pidFile, "utf8").trim() !== "", 3000), true);
    const grandchild = Number(fs.readFileSync(fake.pidFile, "utf8").trim());
    assert.equal(alive(grandchild), true, "the grandchild should be running before the cancel");

    abort.abort();
    const result = await run;

    assert.equal(result.cancelled, true);
    assert.ok(Date.now() - started < 5000, "cancel should not wait for the 60 s sleep");
    assert.equal(await until(() => !alive(grandchild), 3000), true, "the grandchild must be killed too");
  } finally {
    fake.restore();
  }
});

test("a run that is not cancelled reports cancelled: false", posixOnly, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "latex-diff-ok-"));
  fs.writeFileSync(path.join(dir, "git"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const previous = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${previous}`;
  try {
    const result = await runGitLatexdiff(options({ repoRoot: dir }), undefined, new AbortController().signal);
    assert.equal(result.cancelled, false);
    assert.equal(result.exitCode, 0);
  } finally {
    process.env.PATH = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an already-aborted signal never starts the process", async () => {
  const abort = new AbortController();
  abort.abort();
  const result = await runGitLatexdiff(options({ repoRoot: "/nonexistent-repo" }), undefined, abort.signal);
  assert.equal(result.cancelled, true);
});
