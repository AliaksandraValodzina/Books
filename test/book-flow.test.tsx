/**
 * **The buyer flow, rendered and read: one step, the whole book, and no wall.**
 *
 * `test/funnel.test.tsx` makes the argument for the single page and it is the
 * same one here — three claims are made about these screens that only a render
 * can check, and each costs real money if it is wrong:
 *
 * **There is no wall.** `kn-whole-book-preview` measured thirteen sellers and
 * this is the strongest single finding in the research: the narrative sellers
 * show every page, personalised, unwatermarked, with no account. It is the kind
 * of thing that gets quietly reintroduced by somebody adding "just an email
 * field", so it is asserted rather than remembered — every page of the book
 * reaches the markup, and none of the words a wall is built out of do.
 *
 * **The form says it is one step.** "Step 1 of 1" is Wonderbly's own label and
 * it removes the fear of a long form before the form starts.
 *
 * **The controls are on the pages they affect, and found by asking the
 * template.** Nothing in a component writes down which page carries the
 * photograph, so these tests ask the template the same question the components
 * do — a test that hard-coded page two would be the second copy of the fact the
 * components are specifically built not to keep.
 *
 * Everything stateful is tested where it is pure, in `test/book-order.test.ts`.
 * These render at the state a visitor arrives in, which is what a server render
 * can see: `BookProvider` loads a stored order in an effect, and effects do not
 * run in `renderToStaticMarkup`. That is a real limit and it is the reason
 * `Confirm` takes props rather than reading context.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FIRST_BOOK } from "../templates/first-book";
import BookProvider from "../app/_book/BookProvider";
import Chooser from "../app/_book/Chooser";
import Preview from "../app/_book/Preview";
import Confirm from "../app/_book/Confirm";
import { EDITIONS, priceOf } from "../lib/book/editions";
import { pageSequence, pageWithSlot, tileIndexOf } from "../lib/book/derive";
import { ASKS, SLOT } from "../lib/book/slots";
import { nameSlotFont } from "../lib/book/name";
import { FACES } from "../lib/render/fonts";

const book = FIRST_BOOK;

function inProvider(node: React.ReactElement) {
  return renderToStaticMarkup(<BookProvider book={book}>{node}</BookProvider>);
}

/** Every `data-testid` in a string of markup, in order. */
function testIds(markup: string): string[] {
  return [...markup.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
}

const chooser = inProvider(<Chooser />);
const preview = inProvider(<Preview />);

// ---------------------------------------------------------------------------

describe("step 1 of 1 — the only form there is", () => {
  it("says so, in those words", () => {
    expect(chooser).toContain("Step 1 of 1");
  });

  it("asks the question before the grid, and shows no grid until it is answered", () => {
    // The captain's decision of 6 November, reversing the brief. A fresh order
    // has no answer, so there is nothing to choose a baby from yet.
    for (const gender of book.genders ?? []) {
      expect(testIds(chooser)).toContain(`gender-${gender.id}`);
    }
    expect(testIds(chooser)).not.toContain("look-grid");
    for (const look of book.looks) expect(testIds(chooser)).not.toContain(`look-${look.id}`);
  });

  it("shows every look of the answered gender once the question is answered", () => {
    // Rendered through the real filter rather than by constructing a list: how
    // many looks a gender has is data and nothing here counts them.
    const answered = renderToStaticMarkup(
      <BookProvider book={{ ...book, genders: [] }}>
        <Chooser />
      </BookProvider>,
    );
    const ids = testIds(answered);
    expect(ids).toContain("look-grid");
    for (const look of book.looks) expect(ids).toContain(`look-${look.id}`);
  });

  it("will not go on until there is a name and a baby", () => {
    expect(chooser).toContain("Name them, and pick a baby");
    expect(chooser).not.toContain('href="/preview"');
  });

  it("draws each tile from the declared tile page, not from page one", () => {
    /**
     * The opening spread is babyless on purpose, so tiles drawn from it would
     * be twelve identical pictures under the question "which baby?". The tile
     * page is declared and the validator refuses a babyless one; this is the
     * other half — that the grid actually draws *different babies*.
     */
    const tile = tileIndexOf(book);
    const page = pageSequence(book)[tile];
    expect(page.art.kind === "drawn" && page.art.scene.babyless).toBeFalsy();

    const answered = renderToStaticMarkup(
      <BookProvider book={{ ...book, genders: [] }}>
        <Chooser />
      </BookProvider>,
    );
    // Each look's baby is drawn in its own colours, so the tiles differ. The
    // control is that this would fail on a babyless page, where every tile is
    // the same string.
    const skins = new Set(book.looks.map((l) => l.baby!.skin));
    for (const skin of skins) expect(answered).toContain(skin);
  });
});

// ---------------------------------------------------------------------------

describe("straight into the whole book, with nothing in front of it", () => {
  it("renders every page of the book", () => {
    const pages = [...preview.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1]));
    expect(new Set(pages).size).toBe(pageSequence(book).length);
    expect(preview).toContain(`All ${pageSequence(book).length} pages`);
  });

  it("has no watermark, no account and no email wall", () => {
    /**
     * The strongest single finding in the research, asserted rather than
     * remembered — this is the kind of thing somebody reintroduces by adding
     * "just an email field".
     *
     * Two assertions, because either alone is weak. The **words** a wall is
     * built out of must not appear; and the **mechanisms** must not either,
     * since a wall with friendlier copy is still a wall.
     */
    const lower = preview.toLowerCase();
    for (const word of [
      "sign in",
      "sign up",
      "log in",
      "create an account",
      "enter your email",
      "unlock",
      "preview only",
      "to see the rest",
    ]) {
      expect(lower, word).not.toContain(word);
    }
    expect(preview).not.toMatch(/type="(email|password)"/);
    expect(preview).toContain("No watermark, no account");

    // The only mention of a watermark anywhere is the promise that there is
    // not one — and the pages themselves carry no overlay text.
    expect(lower.split("watermark").length - 1).toBe(1);
  });

  it("offers one page or two, and two is the default", () => {
    expect(testIds(preview)).toContain("one-page");
    expect(testIds(preview)).toContain("two-page");
    // Attribute order is React's business, so the assertion does not depend on it.
    const two = /<button[^>]*data-testid="two-page"[^>]*>/.exec(preview)?.[0] ?? "";
    const one = /<button[^>]*data-testid="one-page"[^>]*>/.exec(preview)?.[0] ?? "";
    expect(two).toContain('aria-pressed="true"');
    expect(one).toContain('aria-pressed="false"');
  });
});

// ---------------------------------------------------------------------------

describe("the extras sit on the page they affect", () => {
  it("puts one panel on the dedication spread, holding the words and the photograph", () => {
    const ids = testIds(preview);
    expect(ids.filter((id) => id === "dedication-control")).toHaveLength(1);
    // One control, not two: the captain chose Wonderbly's shape, where the
    // dedication and the photograph open together.
    expect(preview).toContain("Personalise your dedication");
    expect(ids).toContain("photo-input");
    expect(ids).toContain("from");
    expect(preview).toContain("Upload a photo");
    expect(preview).toContain("Choose the highest quality one you have");
  });

  it("offers crop and delete only once there is a photograph to crop", () => {
    const ids = testIds(preview);
    expect(ids).not.toContain("crop-photo");
    expect(ids).not.toContain("remove-photo");
  });

  it("shows the dedication's hard limit as a live count", () => {
    const slot = book.cover.layers && pageWithSlot(book, SLOT.dedication);
    expect(slot).toBeGreaterThan(0);
    expect(testIds(preview)).toContain("dedication-count");
    expect(preview).toContain("of 10 lines");
    expect(preview).toContain("of 300 characters");
    // And the warning the research says to copy exactly.
    expect(preview).toContain("Read it back there before you order");
  });

  it("offers the hardcover upgrade exactly once, after the dedication", () => {
    const ids = testIds(preview);
    expect(ids.filter((id) => id === "upgrade-control")).toHaveLength(1);
    // After the dedication and before the bar, which is MyStoryTale's placement
    // and the one thing worth taking from them.
    expect(ids.indexOf("upgrade-control")).toBeGreaterThan(ids.indexOf("dedication-control"));
    expect(ids.indexOf("upgrade-control")).toBeLessThan(ids.indexOf("continue"));
    for (const edition of EDITIONS) {
      expect(preview).toContain(priceOf(edition.price));
    }
  });

  it("states one real price with no theatre around it", () => {
    // Under Australian Consumer Law a "was/now" where the higher price was never
    // genuinely charged is a misleading representation about price. There is
    // nowhere in the type to put one, and nothing on the page shows one.
    expect(preview).not.toMatch(/<s>|line-through|was AUD|RRP|% off|ends in/i);
  });
});

// ---------------------------------------------------------------------------

describe("the persistent bar", () => {
  it("ticks every ask and marks the optional ones as optional", () => {
    const ids = testIds(preview);
    for (const ask of ASKS) expect(ids).toContain(`ask-${ask.id}`);
    for (const ask of ASKS.filter((a) => !a.required)) {
      const li = new RegExp(`<li[^>]*data-testid="ask-${ask.id}"[^>]*>`).exec(preview)?.[0] ?? "";
      expect(li, ask.id).toContain('data-required="no"');
    }
    // Nothing is done in a fresh order, and the bar says what is outstanding
    // rather than failing silently.
    expect(preview).toContain("Still to do:");
    expect(preview).toContain("Finish the book first");
  });

  it("carries the cover colourways, because a cover is a property of the object", () => {
    for (const cover of book.covers) {
      expect(testIds(preview)).toContain(`cover-${cover.id}`);
      expect(preview).toContain(cover.colour);
    }
    // And the colourways are in the bar rather than in a panel under the cover
    // spread, which is the captain's decision.
    const ids = testIds(preview);
    expect(ids.indexOf(`cover-${book.covers[0].id}`)).toBeGreaterThan(ids.indexOf("ask-name"));
  });
});

// ---------------------------------------------------------------------------

describe("confirm the spelling, which is where typos die", () => {
  const edition = EDITIONS[0];
  const markup = (name: string) =>
    renderToStaticMarkup(
      <Confirm
        name={name}
        face={FACES[nameSlotFont(book)]?.family}
        edition={edition}
        onBack={() => {}}
      />,
    );

  it("shows the name large and alone, in the face it will print in", () => {
    const out = markup("Rosalind");
    expect(out).toContain("This is how it will be printed");
    // Alone in its own element: nothing else is in the node the eye goes to.
    const node = /data-testid="confirm-name"[^>]*>([^<]*)</.exec(out);
    expect(node?.[1]).toBe("Rosalind");
    // In the cover's own face, so the letterforms approved are the ones printed.
    expect(out).toContain(FACES[nameSlotFont(book)].family);
  });

  it("makes them click past it, into the till that already exists", () => {
    const out = markup("Rosalind");
    expect(out).toContain('action="/api/checkout"');
    expect(out).toContain('method="post"');
    expect(testIds(out)).toContain("confirm-yes");
    // And a way back, so this is a check and not a trap.
    expect(testIds(out)).toContain("confirm-back");
    expect(out).toContain("Let me change it");
  });

  it("never reads as a confirmation of an order", () => {
    const out = markup("Rosalind").toLowerCase();
    for (const word of ["thank you", "order confirmed", "payment received", "we have received"]) {
      expect(out, word).not.toContain(word);
    }
    expect(out).toContain("nothing is charged");
  });
});
