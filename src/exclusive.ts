/**
 * Runs one task at a time. A second `run` while one is in flight is refused
 * instead of queued, so two `git latexdiff` processes never write the same PDF.
 * No `vscode` import, so it is unit tested.
 */
export class Exclusive {
  private busy = false;

  get isBusy(): boolean {
    return this.busy;
  }

  async run<T>(task: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
    if (this.busy) {
      return { ran: false };
    }
    this.busy = true;
    try {
      return { ran: true, value: await task() };
    } finally {
      this.busy = false;
    }
  }
}
