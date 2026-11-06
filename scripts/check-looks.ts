/**
 * Check a folder of uploaded looks against the contract.
 *
 *     npm run looks -- path/to/looks
 *
 * `docs/look-upload-contract.md` is the agreement and `lib/book/upload.ts` is
 * the check. This file is the two edges a pure function cannot have: reading a
 * directory, and telling a person what it found in a form they can act on.
 *
 * **It exits non-zero when there is a problem**, so it can go in front of
 * `looks:import` and, one day, in front of a deploy. A checker whose result has
 * to be read by a human to matter is a checker that stops being run.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { FIRST_BOOK } from "../templates/first-book";
import { blockingUploadProblems, checkUpload, type Upload } from "../lib/book/upload";

/** Everything under `root`, as the pure checker wants it. */
async function readUpload(root: string): Promise<Upload> {
  const entries = await readdir(root, { withFileTypes: true });

  let manifest: unknown = null;
  const manifestFile = entries.find((e) => e.isFile() && e.name === "looks.json");
  if (manifestFile) {
    try {
      manifest = JSON.parse(await readFile(path.join(root, "looks.json"), "utf8"));
    } catch (error) {
      // Reported as `manifest.malformed` by the checker rather than thrown
      // here: one list of problems beats a stack trace and then a list.
      manifest = { looks: `unparseable: ${(error as Error).message}` };
    }
  }

  const looks = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const names = (await readdir(dir, { withFileTypes: true }))
      .filter((f) => f.isFile())
      // macOS leaves these in every folder anybody has ever opened, and a
      // contract that reported one as an unexpected file would be shouting
      // about something the captain cannot see and did not create.
      .filter((f) => f.name !== ".DS_Store")
      .map((f) => f.name)
      .sort();
    const files = [];
    for (const name of names) {
      files.push({ name, bytes: new Uint8Array(await readFile(path.join(dir, name))) });
    }
    looks.push({ look: entry.name, files });
  }
  return { manifest, looks };
}

async function main() {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: npm run looks -- path/to/looks");
    process.exitCode = 2;
    return;
  }

  const upload = await readUpload(path.resolve(root));
  const problems = checkUpload(FIRST_BOOK, upload);
  const blocking = blockingUploadProblems(problems);

  const pages = upload.looks.reduce((n, l) => n + l.files.length, 0);
  console.log(
    `${upload.looks.length} look(s), ${pages} file(s), against ${FIRST_BOOK.id}@${FIRST_BOOK.rev}: ` +
      `${FIRST_BOOK.pages.length} interior pages + cover at ` +
      `${FIRST_BOOK.page.print.pixels.width} × ${FIRST_BOOK.page.print.pixels.height}`,
  );

  for (const p of problems) {
    const note = blocking.includes(p) ? "" : "  (note)";
    console.log(`${p.code}  ${p.where}  ${p.detail}${note}`);
  }

  if (blocking.length === 0) {
    console.log(problems.length ? "no blocking problems." : "clean.");
    return;
  }
  console.error(`\n${blocking.length} problem(s). Nothing is importable until they are fixed.`);
  process.exitCode = 1;
}

void main();
