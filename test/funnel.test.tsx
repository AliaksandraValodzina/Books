/**
 * **The page a customer actually lands on, rendered and read.**
 *
 * Three claims are made about this page that only a render can check, and each
 * one is a thing that would cost real money if it were wrong:
 *
 * **Nothing is invented.** The repository does not know what this costs, how
 * many pages it is, what it is printed on, or when it arrives. Marking those
 * is not a nicety: a plausible price on a public page is a fabricated
 * commercial claim, and a customer cannot tell a guess from a quote. So every
 * unconfirmed fact must reach the markup carrying the placeholder, and the
 * numbers that *are* stated must be the ones the template and print spec
 * actually say.
 *
 * **The order is the argument.** Object, line, editor, facts, delivery, buy.
 * The editor is the hero and must come before the price, because the sale is
 * made when somebody sees their own photograph in the heart — not after they
 * have read a specification.
 *
 * **Checkout never lies.** No confirmation word, in either environment, and no
 * key material in the markup.
 *
 * This file is deliberately `.tsx`, and `test/config.test.ts` asserts that the
 * runner's pattern collects that extension — it did not, and a component test
 * would have been collected by nobody and reported by nothing.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../app/page";
import Checkout from "../app/checkout/page";
import { DELIVERY, PLACEHOLDER, UNCONFIRMED, WHAT_YOU_GET } from "../lib/product";
import { MY_FOREVER } from "../templates/my-forever";
import type { PhotoSlotLayer, TextSlotLayer } from "../lib/template/types";

/** An async server component, rendered the way the framework would read it. */
async function markupOf(element: Promise<React.ReactElement> | React.ReactElement) {
  return renderToStaticMarkup(await element);
}

async function homeMarkup(guides = false) {
  return markupOf(Home({ searchParams: Promise.resolve(guides ? { guides: "1" } : {}) }));
}

async function checkoutMarkup(env: Record<string, string | undefined>) {
  const before = process.env.STRIPE_SECRET_KEY;
  try {
    if (env.STRIPE_SECRET_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
    return await markupOf(Checkout());
  } finally {
    if (before === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = before;
  }
}

describe("the page renders at all", () => {
  it("draws the editable page, not an empty frame", async () => {
    // The guard this whole file would be worthless without: a suite that would
    // pass if the editor rendered nothing is not a suite.
    const html = await homeMarkup();
    expect(html).toContain('data-testid="editor-stage"');
    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 756 756"');
    // Two SVGs: the small object shot and the editor's own page.
    expect(html.match(/<svg/g)?.length).toBe(2);
    // And real drawing in them, not an empty root.
    // The cloth's dot pattern and the heart paths: real drawing, not a root
    // element with nothing inside it.
    expect(html).toContain("<pattern");
    expect(html).toContain("<path");
  });

  it("gives every slot in the template something to touch", async () => {
    const html = await homeMarkup();
    for (const layer of MY_FOREVER.layers) {
      if (layer.kind === "photoSlot") {
        expect(html, `no handle for ${layer.id}`).toContain(
          `data-testid="photo-handle-${(layer as PhotoSlotLayer).slot}"`,
        );
        expect(html).toContain((layer as PhotoSlotLayer).prompt ?? "");
      }
      if (layer.kind === "textSlot") {
        expect(html, `no handle for ${layer.id}`).toContain(
          `data-testid="text-handle-${(layer as TextSlotLayer).slot}"`,
        );
      }
    }
  });

  it("offers the guides only when asked, and never by default", async () => {
    const plain = await homeMarkup(false);
    const guided = await homeMarkup(true);
    // The guide overlay's two colours — the same pair `test/one-renderer.test.ts`
    // asserts can never reach a print file.
    expect(plain).not.toContain("#e0245e");
    expect(guided).toContain("#e0245e");
    expect(guided).toContain("#1f9d55");
  });
});

describe("the order of the page", () => {
  it("puts the editor above the price, because that is what sells it", async () => {
    const html = await homeMarkup();
    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, `"${needle}" is not on the page`).toBeGreaterThan(-1);
      return i;
    };
    const object = at("not a photograph of the printed book");
    const editor = at('data-testid="editor-stage"');
    const facts = at("What you get");
    const delivery = at(DELIVERY.label);
    const buy = at('data-testid="buy"');

    expect(object).toBeLessThan(editor);
    expect(editor).toBeLessThan(facts);
    expect(facts).toBeLessThan(delivery);
    expect(delivery).toBeLessThan(buy);
  });

  it("says who it is for, in words that are not 'personalised photo products'", async () => {
    const html = await homeMarkup();
    expect(html).toContain("the two of you");
    expect(html.toLowerCase()).not.toContain("personalised photo product");
  });
});

describe("what the page claims", () => {
  it("marks every fact nobody has a number for", async () => {
    const html = await homeMarkup();
    expect(UNCONFIRMED.length).toBeGreaterThan(0);
    for (const fact of UNCONFIRMED) {
      expect(html, `${fact.label} is not on the page`).toContain(fact.label);
    }
    // One marker per unconfirmed fact, plus the delivery box's own heading.
    const markers = html.match(new RegExp(PLACEHOLDER, "g")) ?? [];
    expect(markers.length).toBeGreaterThanOrEqual(UNCONFIRMED.length);
  });

  it("states no price at all, rather than a plausible one", async () => {
    const html = await homeMarkup();
    const priceRow = WHAT_YOU_GET.find((f) => f.label === "Price")!;
    expect(priceRow.confirmed).toBe(false);
    // No currency amount anywhere on the page. A number with a symbol in front
    // of it is the one thing a customer will read as a quote.
    expect(html).not.toMatch(/[£$€]\s?\d/);
  });

  it("states the numbers it does have, and they are the artefact's own", async () => {
    const html = await homeMarkup();
    // Derived from the template rather than typed into the copy, so the page
    // cannot drift from the file it describes.
    expect(html).toContain(`${MY_FOREVER.print.pixels.width} × ${MY_FOREVER.print.pixels.height} px`);
    const dpi = Math.round((MY_FOREVER.print.pixels.width / MY_FOREVER.canvas.width) * 72);
    expect(html).toContain(`${dpi} DPI`);
    expect(html).toContain("sRGB");
  });

  it("does not promise a delivery window it does not have", async () => {
    const html = await homeMarkup();
    expect(DELIVERY.confirmed).toBe(false);
    expect(html).toContain(DELIVERY.label);
    // No "N working days" anywhere: that is the shape of the claim a customer
    // would plan a birthday around.
    expect(html).not.toMatch(/\d+\s*[-–]\s*\d+\s*(working\s+)?days/i);
    expect(html).not.toMatch(/within\s+\d+\s+(days|weeks)/i);
  });

  it("would notice a made-up price, so the checks above are not vacuous", async () => {
    // The paired negative. The assertions are regexes, and a regex that never
    // matches anything passes whatever the page says — so here is a page that
    // must fail them.
    const pretend = '<p>Price</p><p>£29.00</p><p>Arrives within 5 days</p>';
    expect(pretend).toMatch(/[£$€]\s?\d/);
    expect(pretend).toMatch(/within\s+\d+\s+(days|weeks)/i);
  });
});

describe("the checkout page", () => {
  it("is honest when no key is configured", async () => {
    const html = await checkoutMarkup({ STRIPE_SECRET_KEY: undefined });
    expect(html).toContain("Payments are not switched on yet");
    expect(html).toContain("nothing has been charged");
    expect(html).toContain("STRIPE_SECRET_KEY");
  });

  it("is still honest when a key IS configured, because the rest is not built", async () => {
    const html = await checkoutMarkup({ STRIPE_SECRET_KEY: "sk_test_" + "x".repeat(24) });
    expect(html).toContain("not finished");
    expect(html).toContain("Nothing has been charged");
  });

  it("never shows anything a customer could read as a confirmation", async () => {
    for (const key of [undefined, "sk_test_" + "x".repeat(24), "sk_live_" + "y".repeat(24)]) {
      const html = (await checkoutMarkup({ STRIPE_SECRET_KEY: key })).toLowerCase();
      for (const lie of [
        "thank you for your order",
        "order confirmed",
        "payment received",
        "your order is on its way",
        "successfully",
      ]) {
        expect(html, `"${lie}" with key=${key}`).not.toContain(lie);
      }
    }
  });

  it("never puts key material in the markup", async () => {
    // The page reads the environment on the server. Only the *presence* of a
    // key may cross to the browser, never the value.
    const secret = "sk_live_" + "Z9".repeat(16);
    const html = await checkoutMarkup({ STRIPE_SECRET_KEY: secret });
    expect(html).not.toContain(secret);
    expect(html).not.toContain(secret.slice(8));
    expect(html).not.toMatch(/sk_(live|test)_[A-Za-z0-9]{8,}/);
  });

  it("offers a way back to the page the customer made", async () => {
    const html = await checkoutMarkup({ STRIPE_SECRET_KEY: undefined });
    expect(html).toContain('href="/"');
    // And says the work is safe, which is true: the draft is in their browser
    // and nothing on this path has touched it.
    expect(html).toContain("still in this browser");
  });
});
