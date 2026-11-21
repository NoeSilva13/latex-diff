import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expectedPdfFrom,
  isNoPdfFailure,
  latexmkrcCandidates,
  noPdfMessage,
  normalizeBuildDir,
  parseLatexmkOutDir,
  resolveBuildDir,
} from "../buildDir";
import { buildCommand, type LatexDiffOptions } from "../latexdiff";

function options(overrides: Partial<LatexDiffOptions> = {}): LatexDiffOptions {
  return {
    repoRoot: "/repo",
    mainFile: "paper.tex",
    oldCommit: "66ee655",
    newCommit: "23c151b",
    outputDir: "diffs",
    outputFile: "",
    wholeTree: true,
    latexmk: true,
    ignoreLatexErrors: true,
    bibliography: "none",
    engine: "pdflatex",
    lnUntracked: false,
    verbose: false,
    extraArgs: [],
    buildDir: "",
    ...overrides,
  };
}

// Project shape 1: LaTeX Workshop sets "latex.outDir": "%DIR%/build" and there is
// no .latexmkrc. latexmk writes next to the .tex inside git-latexdiff's temp dir,
// so --build-dir must NOT be passed. This was the regression in 0.1.1 and 0.1.2.
test("no .latexmkrc: no build dir, even when Workshop outDir is %DIR%/build", () => {
  const buildDir = resolveBuildDir({
    configured: "",
    mainFile: "RFSoC4x2_Paper_JNRS.tex",
    latexmkrcText: undefined,
  });
  assert.equal(buildDir, "");
  const { args } = buildCommand(options({ buildDir }));
  assert.ok(args.includes("--latexmk"));
  assert.ok(!args.includes("--build-dir"));
});

// Project shape 2: a .latexmkrc sets $out_dir, which latexmk honors in the temp
// dir, so git-latexdiff must look there.
test(".latexmkrc with $out_dir = 'build': --build-dir build", () => {
  const buildDir = resolveBuildDir({
    configured: "",
    mainFile: "paper.tex",
    latexmkrcText: "$out_dir = 'build';\n",
  });
  assert.equal(buildDir, "build");
  const { args } = buildCommand(options({ buildDir }));
  const at = args.indexOf("--build-dir");
  assert.ok(at >= 0);
  assert.equal(args[at + 1], "build");
  assert.ok(at > args.indexOf("--latexmk"));
});

test(".latexmkrc without $out_dir: no build dir", () => {
  assert.equal(
    resolveBuildDir({ configured: "", mainFile: "paper.tex", latexmkrcText: "$pdf_mode = 1;\n" }),
    ""
  );
});

// git-latexdiff looks for <build-dir>/<main>.pdf from the repo root, so the main
// file's folder has to be part of it.
test("main file in a subfolder: build dir includes that folder", () => {
  assert.equal(
    resolveBuildDir({
      configured: "",
      mainFile: "paper/main.tex",
      latexmkrcText: "$out_dir = 'build';",
    }),
    "paper/build"
  );
});

test("only the .latexmkrc beside the main file is a candidate", () => {
  assert.deepEqual(latexmkrcCandidates("paper.tex"), [".latexmkrc", "latexmkrc"]);
  assert.deepEqual(latexmkrcCandidates("paper/main.tex"), ["paper/.latexmkrc", "paper/latexmkrc"]);
});

test("explicit latexDiff.buildDir wins over .latexmkrc", () => {
  assert.equal(
    resolveBuildDir({
      configured: "out",
      mainFile: "paper.tex",
      latexmkrcText: "$out_dir = 'build';",
    }),
    "out"
  );
});

test("--build-dir already in extraArgs is not duplicated", () => {
  const { args } = buildCommand(
    options({ buildDir: "build", extraArgs: ["--build-dir", "custom"] })
  );
  assert.equal(args.filter((a) => a === "--build-dir").length, 1);
  assert.ok(!args.includes("build"));
});

test("--build-dir is not passed when latexmk is off", () => {
  const { args } = buildCommand(options({ latexmk: false, buildDir: "build" }));
  assert.ok(!args.includes("--build-dir"));
});

test("parseLatexmkOutDir handles quotes, chained assignments, and comments", () => {
  assert.equal(parseLatexmkOutDir(`$out_dir = "build";`), "build");
  assert.equal(parseLatexmkOutDir(`$out_dir = $aux_dir = 'build';`), "build");
  assert.equal(parseLatexmkOutDir(`# $out_dir = 'old';\n$out_dir = 'new';`), "new");
  assert.equal(parseLatexmkOutDir(`# $out_dir = 'old';`), "");
  assert.equal(parseLatexmkOutDir(`$out_dir = $ENV{OUT};`), "");
});

test("normalizeBuildDir strips Workshop placeholders and slashes", () => {
  assert.equal(normalizeBuildDir("%DIR%/build"), "build");
  assert.equal(normalizeBuildDir("./build/"), "build");
  assert.equal(normalizeBuildDir("."), "");
  assert.equal(normalizeBuildDir("   "), "");
});

test("No-PDF output is recognized and the expected path is extracted", () => {
  const out = "No PDF file generated.\nWorking directory: /tmp/x/new\nExpected PDF: build/paper.pdf\n";
  assert.equal(isNoPdfFailure(out), true);
  assert.equal(expectedPdfFrom(out), "build/paper.pdf");
  assert.equal(isNoPdfFailure("latexmk failed"), false);
});

test("error text names both causes and the right fix", () => {
  const passed = noPdfMessage({ exitCode: 1, expectedPdf: "build/paper.pdf", passedBuildDir: "build" });
  assert.match(passed, /expected the PDF in build\/paper\.pdf/);
  assert.match(passed, /passed --build-dir build/);
  assert.match(passed, /no \.latexmkrc/);
  assert.match(passed, /clear latexDiff\.buildDir/);

  const none = noPdfMessage({ exitCode: 1, expectedPdf: "paper.pdf", passedBuildDir: "" });
  assert.match(none, /\.latexmkrc beside the main file that sets \$out_dir/);
  assert.match(none, /set latexDiff\.buildDir/);
  assert.doesNotMatch(none, /looked in the project root/);
});
