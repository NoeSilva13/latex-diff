# Changelog

All notable changes to this project are documented here.

## 0.1.4

### Fixed

- **Section files are no longer used as `--main`.** The active `.tex` file is only picked automatically when it contains `\documentclass`. Otherwise the extension falls back to the unique main document in the repo, or asks. "Compare this file with…" asks for confirmation when the file has no `\documentclass`.
- **Only one diff runs at a time.** A second Generate / Compare / Last Commit while one is running now shows a message instead of starting a job that would overwrite the same PDF.
- **Runs can be cancelled.** The progress notification has a Cancel button that stops `git latexdiff` together with the `latexmk` and `pdflatex` it started.
- **The extension no longer writes to your repository.** Checkboxes and picks made in the panel are kept in VS Code's own workspace storage instead of `.vscode/settings.json`. They override the matching `latexDiff.*` settings; the new **LaTeX Diff: Reset panel choices** command clears them.
- "Compare this file with…" uses the file for that run only and no longer saves it as the main file.
- "Last Commit" no longer overwrites the Old/New commits selected in the panel.

### Added

- GitHub Actions: tests and VSIX packaging on every push and pull request, and automatic Releases from `v*` tags.
- Unit tests for main document detection, the run lock, panel choice precedence, and cancellation.

## 0.1.3

### Fixed

- Stopped passing `--build-dir` just because LaTeX Workshop's `outDir` is `build`. `git-latexdiff` compiles in a temporary checkout where only a `.latexmkrc` applies, so `--build-dir` is now passed only when a `.latexmkrc` beside the main file sets `$out_dir`. This fixes `No PDF file generated` on projects configured only through LaTeX Workshop.
- Clearer error text for `No PDF file generated`, naming both causes and the right fix.

### Added

- Unit tests for the build directory logic.

## 0.1.2

- "Last Commit" compares `HEAD` against the working tree (uncommitted changes) instead of `HEAD~1`.

> Note: 0.1.1 and 0.1.2 pass `--build-dir` from LaTeX Workshop's `outDir` and can fail with `No PDF file generated`. Use 0.1.3 or later.

## 0.1.1

- Fix latexmk PDF lookup when the project uses a `build/` output directory (superseded by 0.1.3).

## 0.1.0

- First public release: Activity Bar panel, commit pickers, `git latexdiff` options (whole tree, latexmk, bibliography, engine, and more), PDF opened in the editor.
