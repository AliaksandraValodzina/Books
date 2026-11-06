/**
 * Take an upload the checker accepted and make it the book's artwork.
 *
 *     npm run looks:import -- path/to/looks
 *
 * Three things happen, in this order, and the order is the point:
 *
 * **It refuses first.** `checkUpload` runs again here rather than trusting that
 * somebody ran `npm run looks`. An import is the step that changes what a paid
 * book looks like, and a gate that can be skipped is not a gate.
 *
 * **It copies every page into the content-addressed store**, under its own
 * sha256. So the artwork becomes an *address* rather than a filename: a
 * corrected page re-imported later is a different address, which means a book
 * already sold cannot be repainted by a later upload and a reprint of a
 * year-old order is byte-identical to the first. That is
 * `docs/template-format.md` § Nothing in a template holds pixels, one level up.
 *
 * **It writes `templates/first-book.art.ts` and prints the new `rev`.** Nothing
 * about the artwork is retyped and no coordinate is ever transcribed — where
 * the slots sit is `templates/first-book.ts`, which this does not touch.
 *
 * The asset store today is `fixtures/assets/`, which is the correct place while
 * there is no bucket: `lib/assets/resolve.ts` reads it, verifies every digest
 * against the bytes, and will read R2 instead the moment `R2_PUBLIC_BASE_URL`
 * is set. **Twenty-four pages times eight looks of 3600 px PNG is of the order
 * of a gigabyte**, which is not a thing to commit to a public repository — so
 * this prints the total and says so, and moving the store to the bucket is the
 * task that follows the first upload.
 */

import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIRST_BOOK } from "../templates/first-book";
import { sha256 } from "../lib/assets/resolve";
import { readPngHeader } from "../lib/render/png";
import { blockingUploadProblems, checkUpload, readManifest } from "../lib/book/upload";
import type { AssetRef } from "../lib/template/types";
import type { Look } from "../lib/book/types";

const STORE = path.join(process.cwd(), "fixtures", "assets");
const OUT = path.join(process.cwd(), "templates", "first-book.art.ts");

async function main() {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: npm run looks:import -- path/to/looks");
    process.exitCode = 2;
    return;
  }
  const dir = path.resolve(root);

  // Read exactly what the checker reads, so the thing being imported is the
  // thing that was checked.
  const entries = await readdir(dir, { withFileTypes: true });
  let manifestJson: unknown = null;
  try {
    manifestJson = JSON.parse(await readFile(path.join(dir, "looks.json"), "utf8"));
  } catch {
    manifestJson = null;
  }

  const looks = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const names = (await readdir(path.join(dir, entry.name), { withFileTypes: true }))
      .filter((f) => f.isFile() && f.name !== ".DS_Store")
      .map((f) => f.name)
      .sort();
    const files = [];
    for (const name of names) {
      files.push({
        name,
        bytes: new Uint8Array(await readFile(path.join(dir, entry.name, name))),
      });
    }
    looks.push({ look: entry.name, files });
  }

  const problems = blockingUploadProblems(checkUpload(FIRST_BOOK, { manifest: manifestJson, looks }));
  if (problems.length) {
    for (const p of problems) console.error(`${p.code}  ${p.where}  ${p.detail}`);
    console.error(`\n${problems.length} problem(s). Run \`npm run looks -- ${root}\` for the list.`);
    process.exitCode = 1;
    return;
  }

  const manifest = readManifest(manifestJson).looks;
  await mkdir(STORE, { recursive: true });

  const pages: Record<string, Record<string, AssetRef>> = {};
  let bytes = 0;

  for (const look of looks) {
    for (const file of look.files) {
      const pageId = file.name === "cover.png" ? "cover" : file.name.replace(/\.png$/, "");
      const digest = sha256(file.bytes);
      const header = readPngHeader(file.bytes);
      const target = path.join(STORE, `${digest}.png`);
      await copyFile(path.join(dir, look.look, file.name), target);
      bytes += file.bytes.length;

      pages[pageId] ??= {};
      pages[pageId][look.look] = {
        sha256: digest,
        mime: "image/png",
        // Measured out of the IHDR, never copied from a filename or a report:
        // `placePhoto` divides by these two numbers.
        px: [header.width, header.height],
        label: `${look.look} ${pageId}`,
      };
    }
  }

  const imported: { importedAt: string; looks: Look[]; pages: typeof pages } = {
    // A date, and the only non-deterministic thing in the file. It is here
    // because "is this import stale" is a question somebody will ask at three
    // in the morning, and it does not reach a rendered page.
    importedAt: new Date().toISOString().slice(0, 10),
    looks: manifest.map((m) => ({ id: m.id, label: m.label, gender: m.gender })),
    pages,
  };

  await writeFile(
    OUT,
    `// Written by \`npm run looks:import\`. Do not edit by hand.\n` +
      `// See templates/first-book.art.ts's own header in git history for what this is.\n\n` +
      `import type { UploadedArt } from "./first-book.art.types";\n\n` +
      `export const UPLOADED: UploadedArt = ${JSON.stringify(imported, null, 2)};\n\n` +
      `export default UPLOADED;\n`,
  );

  console.log(
    `imported ${Object.keys(pages).length} page(s) across ${looks.length} look(s), ` +
      `${(bytes / 1024 / 1024).toFixed(0)} MB into fixtures/assets/`,
  );
  console.log(
    "fixtures/assets/ is not the right home for a gigabyte of artwork in a public repository — " +
      "set R2_PUBLIC_BASE_URL and move the store once the first upload lands.",
  );
  console.log("\nNow restamp the book: run `npm run book`, which prints the rev to set.");
}

void main();
