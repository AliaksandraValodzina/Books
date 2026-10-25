/**
 * **The gate is checked by the gate.**
 *
 * A test suite that does not run is worth less than no suite, because it reads
 * as coverage. Two ways that happens, and this file closes both:
 *
 * **The runner stops collecting a file.** `vitest.config.mts` matched
 * `test/**\/*.test.ts`, which silently collects nothing from a `.tsx` file — a
 * component test would have been run by nobody and reported by nothing. So
 * every `test/*.test.*` file on disk is checked against the configured
 * pattern here, and a new extension fails this test instead of disappearing.
 *
 * **The workflow narrows to a list of files.** This is the Keepnook failure
 * exactly: a gate that named four of 154 spec files, looked precise, passed,
 * and stopped covering everything added afterwards. The workflow is read and
 * asserted to invoke the project's own `npm test` with no file arguments.
 *
 * Reading YAML with regular expressions is normally a poor idea and is the
 * right trade here: the alternative is a YAML parser as a dependency whose
 * only consumer is this file, and the assertions below are about whether
 * particular strings appear in a command, which is what the shell will see
 * too.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOW = path.join(ROOT, ".github", "workflows", "ci.yml");
const workflow = readFileSync(WORKFLOW, "utf8");

/**
 * The runner config, read as **text** rather than imported.
 *
 * Importing it would be the tidier line and `tsc` refuses it — a `.mts`
 * specifier needs `allowImportingTsExtensions`, which is a compiler-wide
 * setting to buy for one import. Reading the file is also the more honest
 * check: what matters is the pattern as written in the file the runner loads,
 * not a value this test could have been handed by a module that resolved
 * differently.
 */
const vitestConfig = readFileSync(path.join(ROOT, "vitest.config.mts"), "utf8");

/** Every `run:` command in the workflow, including the lines of a block scalar. */
function runCommands(yaml: string): string[] {
  const out: string[] = [];
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const inline = /^\s*-?\s*run:\s*(\S.*)$/.exec(lines[i]);
    if (inline && !/^[|>]/.test(inline[1].trim())) {
      out.push(inline[1].trim());
      continue;
    }
    if (/^\s*-?\s*run:\s*[|>]/.test(lines[i])) {
      const indent = (lines[i].match(/^\s*/) ?? [""])[0].length;
      for (let j = i + 1; j < lines.length; j++) {
        const body = lines[j];
        if (body.trim() === "") continue;
        if ((body.match(/^\s*/) ?? [""])[0].length <= indent) break;
        out.push(body.trim());
      }
    }
  }
  return out;
}

const commands = runCommands(workflow);

describe("every test file on disk is one the runner collects", () => {
  const files = readdirSync(path.join(ROOT, "test")).filter((f) => /\.test\.[a-z]+$/.test(f));

  it("finds the test files at all, so the check below is not vacuous", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("collects every extension present", () => {
    // The pattern is `test/**/*.test.{ts,tsx}`. Rather than reimplement glob,
    // pull the extension set out of it and compare — which is the only part
    // that has ever gone wrong here.
    const pattern = /include:\s*\[\s*"([^"]+)"/.exec(vitestConfig)?.[1] ?? "";
    const braced = /\.test\.\{([^}]+)\}/.exec(pattern);
    const single = /\.test\.([a-z]+)$/.exec(pattern);
    const collected = new Set(braced ? braced[1].split(",") : single ? [single[1]] : []);

    expect(collected.size, `could not read extensions out of "${pattern}"`).toBeGreaterThan(0);

    const onDisk = new Set(files.map((f) => f.split(".").pop()!));
    for (const ext of onDisk) {
      expect(
        collected.has(ext),
        `test/*.test.${ext} exists on disk but "${pattern}" does not collect it — ` +
          "those tests would run nowhere and fail nothing",
      ).toBe(true);
    }
  });
});

describe("the pull request gate", () => {
  it("runs on every pull request", () => {
    expect(/^on:/m.test(workflow)).toBe(true);
    expect(/^\s{2}pull_request:/m.test(workflow)).toBe(true);
  });

  it("runs the typecheck, the tests and the build", () => {
    expect(commands).toContain("npm run lint");
    expect(commands).toContain("npm test");
    expect(commands).toContain("npm run build");
  });

  it("runs the WHOLE suite, never a list of files", () => {
    // The Keepnook mistake, asserted against rather than remembered. Any
    // argument after `npm test` — a path, a `-t` filter, a `--project` — turns
    // the gate into a sample, and a sample that passes reads exactly like a
    // suite that passes.
    const testRuns = commands.filter((c) => /\bnpm\s+(test|run\s+test)\b/.test(c));
    expect(testRuns.length).toBeGreaterThan(0);
    for (const command of testRuns) {
      expect(command, `"${command}" passes arguments to the test runner`).toMatch(
        /^npm\s+(test|run\s+test)$/,
      );
    }
    // And nothing invokes vitest around the back with a narrower scope.
    for (const command of commands) {
      expect(command, `"${command}" calls vitest directly`).not.toMatch(/\bvitest\b/);
      expect(command, `"${command}" names a test file`).not.toMatch(/\.test\.tsx?\b/);
    }
  });

  it("installs from the lockfile rather than rewriting it", () => {
    // `npm install` can change the lockfile, and a gate that can change its
    // own inputs is not measuring the commit it was asked about.
    expect(commands).toContain("npm ci");
    for (const command of commands) {
      expect(command, `"${command}" would rewrite the lockfile`).not.toMatch(
        /^npm\s+(i|install|update)\b/,
      );
    }
  });

  it("reports every failing check, not just the first", () => {
    // Without this a pull request with a type error and a failing test takes
    // two round trips to find out about both.
    const guards = workflow.match(/if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
  });

  it("checks the committed print file has not drifted from the renderer", () => {
    // `data/` is the evidence a reviewer reads to see what the page looks
    // like, and evidence that has drifted is worse than none.
    expect(commands).toContain("npm run print");
    expect(workflow).toContain("git diff --quiet -- data/");
  });

  it("asks for no permission it does not need", () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });
});

describe("the scripts the gate depends on", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

  it("all exist, so the workflow cannot name one that was renamed", () => {
    for (const name of ["lint", "test", "build", "print"]) {
      expect(pkg.scripts?.[name], `package.json has no "${name}" script`).toBeTruthy();
    }
  });

  it("has a test script that runs the suite once rather than watching", () => {
    // `vitest` without `run` watches, and a watching gate never finishes.
    expect(pkg.scripts.test).toMatch(/vitest\s+run/);
    expect(pkg.scripts.test).not.toMatch(/\.test\./);
  });
});
