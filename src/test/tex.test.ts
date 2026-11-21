import assert from "node:assert/strict";
import { test } from "node:test";
import { hasDocumentclass, stripTexComment } from "../tex";

test("a main document has \\documentclass", () => {
  assert.equal(hasDocumentclass("\\documentclass[conference]{IEEEtran}\n\\begin{document}\n"), true);
  assert.equal(hasDocumentclass("  \\documentclass{article}"), true);
  assert.equal(hasDocumentclass("\r\n\\documentclass{article}\r\n"), true);
});

// A section pulled in with \input / \include must never be picked as --main.
test("a section file has no \\documentclass", () => {
  assert.equal(hasDocumentclass("\\section{Introduction}\nWe study the \\textbf{effect}.\n"), false);
  assert.equal(hasDocumentclass(""), false);
});

test("a commented-out \\documentclass does not count", () => {
  assert.equal(hasDocumentclass("% \\documentclass{article}\n\\section{A}\n"), false);
  assert.equal(hasDocumentclass("\\section{A} % \\documentclass{article}\n"), false);
  assert.equal(hasDocumentclass("% old\n\\documentclass{article}\n"), true);
});

test("an escaped percent sign is not a comment", () => {
  assert.equal(stripTexComment("100\\% done"), "100\\% done");
  assert.equal(stripTexComment("text % comment"), "text ");
  assert.equal(hasDocumentclass("50\\% \\documentclass{article}"), true);
});

test("\\documentclassfoo is not \\documentclass", () => {
  assert.equal(hasDocumentclass("\\documentclassfoo{x}"), false);
});
