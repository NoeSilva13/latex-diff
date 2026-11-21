import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveChoice } from "../choices";

test("a panel choice wins over the setting", () => {
  assert.equal(resolveChoice({ wholeTree: false }, "wholeTree", true, true), false);
  assert.equal(resolveChoice({ engine: "xelatex" }, "engine", "pdflatex", "pdflatex"), "xelatex");
});

test("without a choice the setting wins, then the default", () => {
  assert.equal(resolveChoice({}, "wholeTree", false, true), false);
  assert.equal(resolveChoice({}, "wholeTree", undefined, true), true);
  assert.equal(resolveChoice({}, "outputDir", "out", "diffs"), "out");
  assert.equal(resolveChoice({}, "outputDir", undefined, "diffs"), "diffs");
});

// "Auto-detect" main file is saved as "" and must beat a mainFile in settings.json.
test("an empty string is a real choice", () => {
  assert.equal(resolveChoice({ mainFile: "" }, "mainFile", "paper.tex", ""), "");
});

test("a choice of the wrong type is ignored", () => {
  assert.equal(resolveChoice({ wholeTree: "yes" }, "wholeTree", false, true), false);
  assert.equal(resolveChoice({ outputDir: true }, "outputDir", "out", "diffs"), "out");
});
