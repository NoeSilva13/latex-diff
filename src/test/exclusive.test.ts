import assert from "node:assert/strict";
import { test } from "node:test";
import { Exclusive } from "../exclusive";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a second run is refused while the first is in flight", async () => {
  const lock = new Exclusive();
  const gate = deferred();
  let started = 0;

  const first = lock.run(async () => {
    started += 1;
    await gate.promise;
    return "first";
  });
  assert.equal(lock.isBusy, true);

  const second = await lock.run(async () => {
    started += 1;
    return "second";
  });
  assert.deepEqual(second, { ran: false });
  assert.equal(started, 1);

  gate.resolve();
  assert.deepEqual(await first, { ran: true, value: "first" });
  assert.equal(lock.isBusy, false);
});

test("it can run again after the first finishes", async () => {
  const lock = new Exclusive();
  await lock.run(async () => 1);
  assert.deepEqual(await lock.run(async () => 2), { ran: true, value: 2 });
});

test("the lock is released when the task throws", async () => {
  const lock = new Exclusive();
  await assert.rejects(
    lock.run(async () => {
      throw new Error("boom");
    }),
    /boom/
  );
  assert.equal(lock.isBusy, false);
  assert.deepEqual(await lock.run(async () => "ok"), { ran: true, value: "ok" });
});
