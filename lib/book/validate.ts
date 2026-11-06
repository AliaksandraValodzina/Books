/**
 * **What has to be true of a book, and of a buyer's filling of one.**
 *
 * `lib/template/validate.ts` says why a format with nothing refusing it is a
 * comment rather than a decision. Everything here is one level up, and the
 * failures it closes are specific to a book being twenty-five pages the buyer
 * will never inspect one at a time:
 *
 * **A look with a hole in it.** Seven pages of artwork against a book of eight
 * is a blank page in a finished object. The research is explicit that this must
 * be a refusal and never a book with one look fewer — *"a book with a missing
 * look asset must be a build refusal"* — because the alternative is a chooser
 * offering a tile that renders nothing.
 *
 * **A slot nothing can fill.** A page's slot names come from `./slots.ts`'s
 * declared roles and from nowhere else. A page inventing another would print a
 * dashed placeholder box in a paid-for book, because there is no field on the
 * form that could ever answer it.
 *
 * **A face that cannot write what is put in it.** The guard in
 * `lib/render/coverage.ts` only works while every face a book names has
 * declared coverage, and a book naming an undeclared face would have every
 * keystroke accepted and some of them printed as nothing. That is the one check
 * here that is about a *name going on the pages*, which is why this product
 * needs it more than the single page ever did.
 *
 * Every page is also put through `validateTemplate` as the page template it
 * derives into, so the safe-area rule, the duplicate-slot rule and the
 * aspect-ratio rule are enforced on a book by the code that already enforces
 * them on a page. There is no second copy of any of them here.
 */

import type { Problem } from "../template/validate";
import { validateFill, validateTemplate } from "../template/validate";
import { maxCharsPerLineOf, maxLinesOf, measuredLength } from "../template/defaults";
import { FACE_COVERAGE } from "../render/coverage";
import { BookArtMissing, pageFillFor, pageSequence, pageTemplateFor, storyTextFor } from "./derive";
import { NAME_TOKEN, SLOT, TEXT_ROLES, isPhotoRole, isTextRole } from "./slots";
import { checkPhoto } from "./photo";
import { limitsForRole } from "./name";
import type { BookFill, BookPage, BookTemplate } from "./types";

/** A look id ends up in a folder name, a URL and a JSON key. */
const LOOK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The layer id `./derive.ts` gives the artwork.
 *
 * Reserved, and a page declaring it is refused. The renderer keys its clip
 * paths off the layer *index*, so a collision would not throw — it would draw
 * the wrong picture, which is the failure mode that survives every check.
 */
const RESERVED_LAYER_ID = "art";

export function validateBook(book: BookTemplate): Problem[] {
  const problems: Problem[] = [];
  const say = (code: string, where: string, detail: string) =>
    problems.push({ code, where, detail });

  if (book.schema !== 1) say("schema.unknown", book.id, `schema ${book.schema} is not 1`);
  if (!/^[0-9a-f]{8}$/.test(book.rev)) {
    say("rev.malformed", book.id, `rev ${book.rev} is not eight hex`);
  }

  // --- the looks axis ----------------------------------------------------
  if (book.looks.length === 0) say("looks.empty", book.id, "a book needs at least one look");
  const lookIds = new Set<string>();
  for (const look of book.looks) {
    if (!LOOK_ID.test(look.id)) {
      say("look.idMalformed", look.id, "a look id is lowercase, digits and single hyphens");
    }
    if (lookIds.has(look.id)) say("look.duplicateId", look.id, "two looks share an id");
    lookIds.add(look.id);
    if (!look.label.trim()) say("look.noLabel", look.id, "the chooser has nothing to call it");
  }

  // --- the gender question -----------------------------------------------
  // Asked before the grid, by the captain's decision of 6 November. Nothing
  // below counts the answers or the looks behind them: how many there are is
  // still being settled and arrives as data.
  const genders = book.genders ?? [];
  const genderIds = new Set<string>();
  for (const gender of genders) {
    if (!LOOK_ID.test(gender.id)) {
      say("gender.idMalformed", gender.id, "a gender id is lowercase, digits and single hyphens");
    }
    if (genderIds.has(gender.id)) say("gender.duplicateId", gender.id, "two genders share an id");
    genderIds.add(gender.id);
    if (!gender.label.trim()) say("gender.noLabel", gender.id, "the question has nothing to ask");
  }
  for (const look of book.looks) {
    if (look.gender && !genderIds.has(look.gender)) {
      say("look.genderUnknown", look.id, `look is tagged "${look.gender}", which the book does not offer`);
    }
  }
  for (const gender of genders) {
    // An empty grid is a dead end the buyer reaches by answering a question
    // honestly. One look is the floor; how far above it is not this file's
    // business.
    if (!book.looks.some((l) => !l.gender || l.gender === gender.id)) {
      say("gender.noLooks", gender.id, "answering this leaves the grid of looks empty");
    }
  }

  // --- the page the grid of tiles shows ----------------------------------
  // Both failures here are *silent* in a browser, which is why they are
  // refusals: an unknown id draws a page nobody chose, and a babyless page
  // draws twelve identical tiles under the question "which baby?".
  if (book.tilePage !== undefined) {
    const page = pageSequence(book).find((p) => p.id === book.tilePage);
    if (!page) {
      say("tile.pageUnknown", book.id, `tilePage "${book.tilePage}" is not a page of this book`);
    } else if (page.art.kind === "drawn" && page.art.scene.babyless) {
      say(
        "tile.pageBabyless",
        book.tilePage,
        "the grid's tiles would be identical for every look, under the question which baby",
      );
    } else if (page.id === book.cover.id) {
      // The cover carries the name and the buyer's cover colour, so a grid of
      // covers would be a grid of the same baby in three colours.
      say("tile.pageIsCover", book.tilePage, "the tiles would show the cover, not the book");
    }
  }

  // --- the covers --------------------------------------------------------
  if (book.covers.length === 0) say("covers.empty", book.id, "a book needs at least one cover");
  const coverIds = new Set<string>();
  for (const cover of book.covers) {
    if (coverIds.has(cover.id)) say("cover.duplicateId", cover.id, "two covers share an id");
    coverIds.add(cover.id);
  }
  const tintId = book.coverTint?.layerId;
  // Two mechanisms, one for each state a cover page can be in: a drawn cover
  // recolours its own ground, and an uploaded cover can only have a declared
  // shape filled over it. Either satisfies this; neither does not.
  const groundTakesCover =
    book.cover.art.kind === "drawn" && book.cover.art.scene.groundFromCover === true;
  if (book.covers.length > 1 && !tintId && !groundTakesCover) {
    say(
      "cover.choiceDoesNothing",
      book.id,
      "more than one cover is offered, no coverTint layer is declared and the cover's ground " +
        "does not take the choice, so picking one changes nothing the buyer can see",
    );
  }
  if (tintId) {
    const target = (book.cover.layers ?? []).find((l) => l.id === tintId);
    if (!target) {
      say("cover.tintLayerMissing", tintId, "coverTint names a layer the cover does not have");
    } else if (target.kind !== "shape") {
      say("cover.tintLayerNotShape", tintId, `coverTint names a ${target.kind} layer; only a shape takes a fill`);
    }
  }

  // --- the pages ---------------------------------------------------------
  if (book.pages.length === 0) say("pages.empty", book.id, "a book needs at least one page");

  const sequence = pageSequence(book);
  const pageIds = new Set<string>();
  let nameSlots = 0;
  let photoSlots = 0;
  let dedicationSlots = 0;
  let storySlots = 0;
  let fromSlots = 0;

  for (const [index, page] of sequence.entries()) {
    const where = `${book.id}/${page.id}`;
    if (pageIds.has(page.id)) say("page.duplicateId", where, "two pages share an id");
    pageIds.add(page.id);

    for (const layer of page.layers ?? []) {
      if (layer.id === RESERVED_LAYER_ID) {
        say("page.reservedLayerId", where, `"${RESERVED_LAYER_ID}" is the artwork's own layer id`);
      }
      if (layer.kind === "textSlot" || layer.kind === "photoSlot") {
        if (layer.kind === "textSlot" && !isTextRole(layer.slot)) {
          say(
            "slot.unknownRole",
            where,
            `text slot "${layer.slot}" is not one of ${TEXT_ROLES.join(", ")} — ` +
              "nothing on the form could ever fill it",
          );
        }
        if (layer.kind === "photoSlot" && !isPhotoRole(layer.slot)) {
          say("slot.unknownRole", where, `photo slot "${layer.slot}" is not "${SLOT.photo}"`);
        }
        if (layer.slot === SLOT.name) nameSlots++;
        if (layer.slot === SLOT.photo) photoSlots++;
        if (layer.slot === SLOT.dedication) dedicationSlots++;
        if (layer.slot === SLOT.from) fromSlots++;
      }
      if (layer.kind === "textSlot" && layer.slot === SLOT.story) storySlots++;
      if (layer.kind === "textSlot") {
        // The coverage guard only works while every face a book names has
        // declared runs. An undeclared face is treated as covering everything
        // (see `unsettable`), so this is the check that keeps the editor's
        // refusal meaningful rather than vacuous.
        if (!Object.prototype.hasOwnProperty.call(FACE_COVERAGE, layer.font)) {
          say(
            "text.faceCoverageUndeclared",
            where,
            `face "${layer.font}" has no entry in FACE_COVERAGE, so every character would be ` +
              "accepted and some of them would print as nothing",
          );
        }
        if (layer.slot === SLOT.dedication && maxLinesOf(layer) < 2) {
          say(
            "text.dedicationSingleLine",
            where,
            "the dedication slot declares one line; a dedication is prose and needs maxLines",
          );
        }
        // The mirror of the rule above, and the reason the two are separate
        // roles. "Grandma" is one line by design — a from-line that could take
        // several would be a second dedication with no counter of its own, and
        // `acceptLines` would let a buyer push the real dedication's last line
        // off the bottom of the page from a field that looks like a signature.
        if (layer.slot === SLOT.from && maxLinesOf(layer) !== 1) {
          say(
            "text.fromLineMultiLine",
            where,
            `the from-line slot declares ${maxLinesOf(layer)} lines; it is one line`,
          );
        }
      }
    }

    // --- the authored story ---------------------------------------------
    problems.push(...storyProblems(book, page, where));

    // --- the artwork ----------------------------------------------------
    problems.push(...artProblems(book, page, where));

    // --- the page, as the page template it derives into -----------------
    // Run against the first look and cover: what differs between looks is the
    // bottom layer's address, and nothing `validateTemplate` asks about.
    try {
      const derived = pageTemplateFor(book, index, {
        lookId: book.looks[0]?.id ?? "",
        coverId: book.covers[0]?.id ?? "",
      });
      problems.push(...validateTemplate(derived));
    } catch (error) {
      if (!(error instanceof BookArtMissing)) throw error;
      // Already reported by `artProblems`; deriving is how it was proved.
    }
  }

  if (nameSlots === 0) {
    say("book.noNameSlot", book.id, `no page carries a "${SLOT.name}" slot; the name goes nowhere`);
  }
  if (photoSlots !== 1) {
    say(
      "book.photoSlotCount",
      book.id,
      `${photoSlots} photo slots; the buyer supplies exactly one photograph`,
    );
  }
  if (dedicationSlots !== 1) {
    say(
      "book.dedicationSlotCount",
      book.id,
      `${dedicationSlots} dedication slots; the buyer writes exactly one`,
    );
  }
  if (fromSlots > 1) {
    // Zero is allowed: a book need not offer a signature, and the bar reports
    // the ask as not-done rather than the build failing. Two is not, for the
    // reason every other role gives — one value cannot be in two boxes without
    // one of them being the one nobody proofread.
    say("book.fromSlotCount", book.id, `${fromSlots} from-line slots; the buyer signs once`);
  }
  if (storySlots === 0) {
    // Not an error about drawing — a book with no narrative draws perfectly
    // well. It is a statement that the captain's words have nowhere to go, and
    // the captain has said the book has words.
    say("book.noStorySlot", book.id, "no page carries a storyText slot, so the book has no words");
  }

  return problems;
}

/**
 * Whether this page's authored words fit the slot they are set in — **with the
 * longest name the form will accept in them.**
 *
 * This is the check the story slot exists to make possible and the reason the
 * story is data rather than paint. `{name}` means a line's length depends on a
 * buyer, so a line checked against the empty string is a line checked against
 * the one buyer who will never exist. The substitution here uses a name of the
 * tightest `maxChars` the name slots declare, which is the longest the form can
 * produce — so a story that passes cannot be overflowed by anybody.
 *
 * Character counts and not measurement, for the reason named at the top of
 * `lib/render/svg.ts`: two shapers disagree about advance widths, and a check
 * that measured would be made differently by the browser and by the rasteriser.
 */
function storyProblems(book: BookTemplate, page: BookPage, where: string): Problem[] {
  const out: Problem[] = [];
  const say = (code: string, detail: string) => out.push({ code, where, detail });
  const slot = (page.layers ?? []).find(
    (l) => l.kind === "textSlot" && l.slot === SLOT.story,
  );

  if (page.story && !slot) {
    say("page.storyGoesNowhere", "the page carries authored words and no storyText slot to set them in");
    return out;
  }
  if (slot && !page.story) {
    say("page.storySlotEmpty", "the page has a storyText slot and no authored words for it");
    return out;
  }
  if (!slot || slot.kind !== "textSlot" || !page.story) return out;

  // The longest name the form can produce, as the worst case.
  const longest = "M".repeat(Math.max(limitsForRole(book, SLOT.name).maxChars, 0));
  const worst = storyTextFor(page, longest);
  const lines = worst.split("\n");
  const length = measuredLength(slot, worst);
  const perLine = maxCharsPerLineOf(slot);
  const widest = lines.reduce((most, line) => Math.max(most, line.length), 0);
  const token = page.story.includes(NAME_TOKEN) ? " with the longest name the form accepts" : "";

  if (length > slot.maxChars) {
    say("text.storyOverflows", `${length} characters${token}, the slot takes ${slot.maxChars}`);
  }
  if (lines.length > maxLinesOf(slot)) {
    say("text.storyOverflows", `${lines.length} lines, the slot takes ${maxLinesOf(slot)}`);
  }
  if (widest > perLine) {
    say(
      "text.storyOverflows",
      `a line of ${widest} characters${token}, the slot takes ${perLine} across`,
    );
  }
  return out;
}

/**
 * Whether this page can be drawn for every look the book offers.
 *
 * Uploaded artwork is also checked against the **declared page size**, because
 * an `AssetRef` carries `px` as a derived fact and a page image of the wrong
 * size is the exact failure `docs/look-upload-contract.md` § 2 exists to
 * prevent: it renders, it looks plausible on screen, and it prints soft or with
 * a white edge.
 */
function artProblems(book: BookTemplate, page: BookPage, where: string): Problem[] {
  const out: Problem[] = [];
  const say = (code: string, detail: string) => out.push({ code, where, detail });
  const want = book.page.print.pixels;

  if (page.art.kind === "asset") {
    const extra = Object.keys(page.art.byLook).filter((id) => !book.looks.some((l) => l.id === id));
    for (const id of extra) {
      say("art.lookUnknown", `artwork is declared for look "${id}", which the book does not offer`);
    }
    for (const look of book.looks) {
      const asset = page.art.byLook[look.id];
      if (!asset) {
        say("art.lookMissing", `no uploaded artwork for look "${look.id}"`);
        continue;
      }
      const [w, h] = asset.px;
      if (w !== h) say("art.notSquare", `look "${look.id}" artwork is ${w}×${h}, not square`);
      else if (w !== want.width) {
        say(
          "art.wrongSize",
          `look "${look.id}" artwork is ${w}×${h}; the book declares ${want.width}×${want.height}`,
        );
      }
      if (asset.mime !== "image/png") {
        say("art.notPng", `look "${look.id}" artwork is ${asset.mime}; the contract is PNG`);
      }
    }
    return out;
  }

  for (const look of book.looks) {
    if (!look.baby) {
      say(
        "art.babyMissing",
        `the page is a drawn placeholder and look "${look.id}" declares no placeholder baby`,
      );
    }
  }
  if (page.art.scene.groundFromCover && page.id !== book.cover.id) {
    say(
      "art.interiorTintedByCover",
      "an interior page takes its ground from the cover choice, so picking a cover would " +
        "recolour the middle of the book",
    );
  }
  return out;
}

/**
 * Is this buyer's book printable?
 *
 * Run before a payment is taken. It delegates every page to the single-page
 * `validateFill`, which is where the character limit, the digest shape and the
 * photograph's declared size are already checked — then adds the three
 * questions that only exist because the buyer filled in a *form* rather than a
 * page.
 *
 * Reported but not blocking: an empty photo window and an empty text slot. They
 * are the legitimate state of a book somebody is still working on and never the
 * state of an order, which is `blockingProblems`' whole job.
 */
export function validateBookFill(book: BookTemplate, fill: BookFill): Problem[] {
  const problems: Problem[] = [];
  const say = (code: string, where: string, detail: string) =>
    problems.push({ code, where, detail });

  if (fill.schema !== 1) say("schema.unknown", book.id, `fill schema ${fill.schema} is not 1`);
  if (fill.bookId !== book.id) say("fill.wrongBook", fill.bookId, `expected ${book.id}`);
  if (fill.bookRev !== book.rev) {
    say("fill.staleRevision", fill.bookId, `fill is against ${fill.bookRev}, book is ${book.rev}`);
  }
  if (!book.looks.some((l) => l.id === fill.lookId)) {
    say("fill.unknownLook", fill.lookId, "the book does not offer that look");
  }
  if (!book.covers.some((c) => c.id === fill.coverId)) {
    say("fill.unknownCover", fill.coverId, "the book does not offer that cover");
  }
  if (fill.photo?.asset?.px) {
    // Refused rather than printed soft. `./photo.ts` carries the argument and
    // the derived floor; this is the gate in front of the money.
    const verdict = checkPhoto(book, fill.photo.asset.px);
    if (!verdict.ok) {
      say(
        "fill.photoTooSmall",
        SLOT.photo,
        `${verdict.got} px on its shorter side; the window needs ${verdict.want}`,
      );
    }
  }

  const sequence = pageSequence(book);
  for (const [index, page] of sequence.entries()) {
    const derived = (() => {
      try {
        return pageTemplateFor(book, index, { lookId: fill.lookId, coverId: fill.coverId });
      } catch {
        return null;
      }
    })();
    if (!derived) {
      say("fill.pageUndrawable", `${book.id}/${page.id}`, "the chosen look has no artwork for it");
      continue;
    }
    for (const problem of validateFill(derived, pageFillFor(book, index, fill))) {
      problems.push({ ...problem, where: `${book.id}/${page.id} ${problem.where}` });
    }

    // The two **shape** limits, which a single page's validator does not know
    // about because no slot before this book had more than one line. They are
    // checked here rather than left to the renderer's `TextOverflows` so that
    // an order that cannot print is a 422 naming the slot, not a 500 thrown
    // halfway through page twelve of a twenty-five page render.
    for (const layer of page.layers ?? []) {
      if (layer.kind !== "textSlot") continue;
      const value =
        layer.slot === SLOT.name
          ? fill.name
          : layer.slot === SLOT.dedication
            ? fill.dedication
            : layer.slot === SLOT.from
              ? (fill.from ?? "")
              : layer.slot === SLOT.story
                ? storyTextFor(page, fill.name)
                : "";
      if (!value) continue;
      const lines = value.split("\n").length;
      const limit = maxLinesOf(layer);
      if (lines > limit) {
        say(
          "fill.tooManyLines",
          `${book.id}/${page.id} ${layer.slot}`,
          `${lines} lines, the slot takes ${limit} — the extra lines would print off the page`,
        );
      }
      const perLine = maxCharsPerLineOf(layer);
      const widest = value.split("\n").reduce((most, line) => Math.max(most, line.length), 0);
      if (widest > perLine) {
        say(
          "fill.lineTooLong",
          `${book.id}/${page.id} ${layer.slot}`,
          `a line of ${widest} characters, the slot takes ${perLine} across — ` +
            "it would be set off both sides of the page",
        );
      }
      // No character-count check here: `validateFill` above has already made
      // it against the derived page template, with the same `measuredLength`.
      // Two reports of one fault read as two faults.
    }
  }

  return problems;
}
