/**
 * **Reading an uploaded folder of looks, and saying exactly what is wrong with
 * it.**
 *
 * `docs/look-upload-contract.md` is the agreement; this is the thing that
 * enforces it. It exists because every failure in that document is **quiet**:
 * a page that is 3599 px renders, a page with an alpha channel renders, a look
 * with twenty-three pages renders twenty-three pages, and all four look
 * perfectly fine in a browser. They are found on paper, by a customer, after
 * the money is spent.
 *
 * Three principles, and each one is a decision somebody could reasonably have
 * made the other way:
 *
 * **It checks every file, not a sample.** Twenty-four pages times eight looks
 * is under two hundred PNG headers, which is milliseconds. One odd page is one
 * page that prints wrong, and a sample is exactly how it survives.
 *
 * **It reports everything rather than stopping at the first.** The captain is
 * about to go and regenerate artwork; one list of what is wrong is one trip,
 * and an error at a time is as many trips as there are errors.
 *
 * **It is a pure function of bytes.** No filesystem, no process, no exit code —
 * `scripts/check-looks.ts` does the reading and the printing. So the whole
 * contract can be tested against a few hand-built fixtures, including the ones
 * that are hard to produce on purpose, like a page whose pixels are square and
 * whose header lies about it.
 *
 * Problem codes are the same shape as `lib/template/validate.ts`'s — stable,
 * greppable, never the sentence.
 */

import { createHash } from "node:crypto";
import type { Problem } from "../template/validate";
import { NotAPng, hasAlphaChannel, pngChunkTypes, readPngHeader } from "../render/png";
import type { BookTemplate } from "./types";

/** One file as it arrived, named relative to its look's folder. */
export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

/** One folder. `look` is the folder's own name, which is the look id. */
export interface UploadedLook {
  look: string;
  files: UploadedFile[];
}

export interface Upload {
  /** The parsed contents of `looks.json`, or `null` when there was none. */
  manifest: unknown;
  looks: UploadedLook[];
}

/** What `looks.json` declares about one look. */
export interface ManifestLook {
  id: string;
  label: string;
  gender: string;
}

const LOOK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PAGE_FILE = /^page-(\d{3})\.png$/;
const COVER_FILE = "cover.png";

/**
 * Names refused rather than ignored.
 *
 * A back cover and a spine are not in scope, and the difference between
 * "ignored" and "refused" is whether anybody ever finds out that the files they
 * carefully made were never used. Refusing is also what makes adding them later
 * a decision rather than a discovery.
 */
const RESERVED = new Set(["cover-back.png", "spine.png"]);

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The manifest, read tolerantly, with everything it got wrong reported.
 *
 * Exported because `scripts/import-looks.ts` needs the same reading and two
 * readers of one file is two opinions about what a look is called.
 */
export function readManifest(value: unknown): { looks: ManifestLook[]; problems: Problem[] } {
  const problems: Problem[] = [];
  const say = (code: string, where: string, detail: string) =>
    problems.push({ code, where, detail });

  if (value === null || value === undefined) {
    say("manifest.missing", "looks.json", "no looks.json at the root of the upload");
    return { looks: [], problems };
  }
  const entries = (value as { looks?: unknown }).looks;
  if (!value || typeof value !== "object" || !Array.isArray(entries)) {
    say("manifest.malformed", "looks.json", 'expected an object with a "looks" array');
    return { looks: [], problems };
  }

  const looks: ManifestLook[] = [];
  for (const [i, raw] of entries.entries()) {
    const entry = (raw ?? {}) as Partial<ManifestLook>;
    const where = `looks.json[${i}]`;
    if (typeof entry.id !== "string" || !LOOK_ID.test(entry.id)) {
      say("manifest.malformed", where, `id ${JSON.stringify(entry.id)} is not a usable look id`);
      continue;
    }
    if (typeof entry.label !== "string" || !entry.label.trim()) {
      say("manifest.malformed", where, `look "${entry.id}" has no label for the tile`);
    }
    if (typeof entry.gender !== "string" || !entry.gender.trim()) {
      // Gender is not a fact about pixels, so there is nowhere else it could
      // come from. A look with none cannot be put in either grid.
      say("manifest.genderMissing", where, `look "${entry.id}" declares no gender`);
    }
    looks.push({
      id: entry.id,
      label: typeof entry.label === "string" ? entry.label : entry.id,
      gender: typeof entry.gender === "string" ? entry.gender : "",
    });
  }
  return { looks, problems };
}

/**
 * Everything wrong with an upload, against the book it is artwork for.
 *
 * The **book** is the source of truth for the page count and the page size, not
 * the upload and not a constant — so changing either is a data edit in
 * `templates/first-book.ts` and this check follows it. That is the research's
 * own rule: *"a book with a missing look asset must be a build refusal, not a
 * book with seven looks."*
 */
export function checkUpload(book: BookTemplate, upload: Upload): Problem[] {
  const problems: Problem[] = [];
  const say = (code: string, where: string, detail: string) =>
    problems.push({ code, where, detail });

  const want = book.pages.length;
  const size = book.page.print.pixels.width;

  const manifest = readManifest(upload.manifest);
  problems.push(...manifest.problems);

  const folders = new Set(upload.looks.map((l) => l.look));
  for (const declared of manifest.looks) {
    if (!folders.has(declared.id)) {
      say("manifest.folderMissing", declared.id, "looks.json declares it and there is no folder");
    }
    if (declared.gender && !(book.genders ?? []).some((g) => g.id === declared.gender)) {
      say(
        "manifest.genderUnknown",
        declared.id,
        `gender "${declared.gender}" is not one the book offers`,
      );
    }
  }

  // Digest -> "look/page", so a page that is byte-identical to another can be
  // reported with both names rather than as an unexplained note.
  const seenAcrossLooks = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const look of upload.looks) {
    if (!LOOK_ID.test(look.look)) {
      say("look.nameMalformed", look.look, "a look id is lowercase, digits and single hyphens");
    }
    if (!manifest.looks.some((m) => m.id === look.look)) {
      say("manifest.lookUndeclared", look.look, "a folder with no entry in looks.json");
    }

    const numbered = new Map<number, UploadedFile>();
    let cover: UploadedFile | null = null;
    const withinLook = new Map<string, string>();

    for (const file of look.files) {
      if (RESERVED.has(file.name)) {
        say("look.reservedName", `${look.look}/${file.name}`, "back covers and spines are not in scope");
        continue;
      }
      if (file.name === COVER_FILE) {
        cover = file;
        continue;
      }
      const match = PAGE_FILE.exec(file.name);
      if (!match) {
        say(
          "look.fileUnexpected",
          `${look.look}/${file.name}`,
          "not cover.png and not page-NNN.png",
        );
        continue;
      }
      const number = Number(match[1]);
      if (number < 1 || number > want) {
        say(
          "look.pageUnexpected",
          `${look.look}/${file.name}`,
          `the book has ${want} interior pages`,
        );
        continue;
      }
      numbered.set(number, file);
    }

    if (!cover) say("look.coverMissing", look.look, "no cover.png");
    if (numbered.size === 0) {
      say("look.noPages", look.look, "no page-NNN.png in the folder");
    }
    counts.set(look.look, numbered.size);
    if (numbered.size > 0 && numbered.size !== want) {
      say(
        "look.pageCountMismatch",
        look.look,
        `${numbered.size} interior pages; the book declares ${want}`,
      );
    }
    for (let n = 1; n <= want; n++) {
      if (!numbered.has(n)) {
        say("look.pageMissing", `${look.look}/page-${String(n).padStart(3, "0")}.png`, "not in the folder");
      }
    }

    for (const file of [...(cover ? [cover] : []), ...numbered.values()]) {
      const where = `${look.look}/${file.name}`;
      problems.push(...pageProblems(file, where, size));

      const d = digest(file.bytes);
      const twin = withinLook.get(d);
      if (twin) {
        say("page.duplicateWithinLook", where, `byte-identical to ${twin}`);
      } else {
        withinLook.set(d, where);
      }
      const sibling = seenAcrossLooks.get(d);
      if (sibling && sibling.split("/")[0] !== look.look) {
        // A note rather than an error. A page with no baby in it legitimately
        // is the same file in every look; a page with one legitimately is not,
        // and only a person can tell which this is.
        say("page.identicalAcrossLooks", where, `byte-identical to ${sibling}`);
      } else if (!sibling) {
        seenAcrossLooks.set(d, where);
      }
    }
  }

  // Sibling disagreement, reported separately from the mismatch against the
  // book: two looks that agree with each other and not with the template is a
  // different fault from two looks that disagree with each other.
  const sizes = new Set([...counts.values()].filter((n) => n > 0));
  if (sizes.size > 1) {
    for (const [look, n] of counts) {
      say("look.pageCountDisagrees", look, `${n} pages; its siblings have ${[...sizes].join(", ")}`);
    }
  }

  return problems;
}

/**
 * One page's bytes, against the contract.
 *
 * Read out of the IHDR rather than trusted to a filename or a tool's report.
 * `docs/print.md`'s *"a claim about a file is not the file"* is the rule, and
 * here the file is somebody else's.
 */
function pageProblems(file: UploadedFile, where: string, size: number): Problem[] {
  const out: Problem[] = [];
  const say = (code: string, detail: string) => out.push({ code, where, detail });

  let header;
  try {
    header = readPngHeader(file.bytes);
  } catch (error) {
    say("page.notPng", error instanceof NotAPng ? error.message : "could not be read as a PNG");
    return out;
  }

  if (header.width !== header.height) {
    say("page.notSquare", `${header.width} × ${header.height}`);
  } else if (header.width !== size) {
    say("page.wrongSize", `${header.width} × ${header.height}; the book declares ${size} × ${size}`);
  }
  if (hasAlphaChannel(header.colourType)) {
    say(
      "page.hasAlpha",
      `colour type ${header.colourType} carries an alpha channel; paper would show through`,
    );
  }
  if (header.bitDepth !== 8) say("page.notEightBit", `bit depth ${header.bitDepth}`);
  if (header.interlaced) say("page.interlaced", "Adam7 interlacing; some RIPs mishandle it");

  // An `iCCP` chunk is an embedded profile, and the contract is sRGB. A file
  // with no profile at all is fine — every RIP treats an untagged PNG as sRGB,
  // which is the convention `lib/render/png.ts` argues about from the other
  // side. A file that *declares* a different space is the one that prints wrong.
  if (pngChunkTypes(file.bytes).includes("iCCP")) {
    say("page.notSrgb", "an embedded ICC profile; supply sRGB with no profile, or an sRGB one");
  }
  return out;
}

/** Only the problems that should stop an import. The note is not one of them. */
export function blockingUploadProblems(problems: Problem[]): Problem[] {
  return problems.filter((p) => p.code !== "page.identicalAcrossLooks");
}
