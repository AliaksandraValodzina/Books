/**
 * **One renderer, and here is the proof.**
 *
 * The rule is easy to state and easy to lose: the page a customer sees and the
 * file that prints must come from the same code reading the same description.
 * It is lost the first time somebody adds `if (forPrint)` to make one small
 * thing nicer on screen, and the loss is invisible until a book arrives.
 *
 * So the test takes the two strings the two paths actually produce — the screen
 * one with its asset URLs, the print one with its `data:` URIs — normalises
 * *only* the addresses, and demands the rest be character for character
 * identical. An `if (forPrint)` anywhere in the renderer fails this.
 */

import { describe, expect, it } from "vitest";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { renderPageSvg } from "../lib/render/svg";
import { renderPrintSvg } from "../lib/render/raster";
import { assetUrl } from "../lib/assets/resolve";

/** Replace every `href="…"` with its index, so only the addresses are forgotten. */
function withoutAddresses(svg: string): string {
  let n = 0;
  return svg.replace(/href="[^"]*"/g, () => `href="#${n++}"`);
}

describe("the screen and the print file", () => {
  it("are the same drawing", async () => {
    const screen = renderPageSvg(MY_FOREVER, FIXTURE_FILL, { href: assetUrl });
    const print = await renderPrintSvg(MY_FOREVER, FIXTURE_FILL);
    expect(withoutAddresses(print)).toBe(withoutAddresses(screen));
  });

  it("differ in nothing but how an asset is addressed", async () => {
    const screen = renderPageSvg(MY_FOREVER, FIXTURE_FILL, { href: assetUrl });
    const print = await renderPrintSvg(MY_FOREVER, FIXTURE_FILL);
    // The premise of the test above: the two really do address assets
    // differently, so the comparison is not trivially true.
    expect(screen).not.toBe(print);
    expect(screen).toContain("/api/assets/");
    expect(print).toContain("data:image/png;base64,");
  });

  it("would notice a difference, if there were one", () => {
    // The guard on the guard. `guides` is the one thing the screen can do that
    // the print path cannot, and it is reachable only by passing the option —
    // `renderPrintSvg` takes no such argument. If the comparison above were
    // blind to structural differences this would pass, and it must not.
    const plain = renderPageSvg(MY_FOREVER, FIXTURE_FILL, { href: assetUrl });
    const guided = renderPageSvg(MY_FOREVER, FIXTURE_FILL, { href: assetUrl, guides: true });
    expect(withoutAddresses(guided)).not.toBe(withoutAddresses(plain));
  });

  it("never draws guides on the way to print", async () => {
    const print = await renderPrintSvg(MY_FOREVER, FIXTURE_FILL);
    // The guide overlay's two colours. A trim mark inside a customer's book is
    // a defect, so this is asserted on the bytes rather than trusted to the
    // absence of an argument.
    expect(print).not.toContain("#e0245e");
    expect(print).not.toContain("#1f9d55");
  });

  it("states the page as a shape rather than a size", () => {
    const svg = renderPageSvg(MY_FOREVER, FIXTURE_FILL, { href: assetUrl });
    expect(svg).toContain(`viewBox="0 0 756 756"`);
    // A width or a height on the root would be a second opinion about the size,
    // and the rasteriser's `fitTo` would then be arguing with it.
    expect(/<svg[^>]*\swidth=/.test(svg)).toBe(false);
    expect(/<svg[^>]*\sheight=/.test(svg)).toBe(false);
  });
});

describe("the renderer refuses what it does not understand", () => {
  it("will not draw a schema it has never heard of", () => {
    const future = { ...MY_FOREVER, schema: 2 as unknown as 1 };
    expect(() => renderPageSvg(future, FIXTURE_FILL, { href: assetUrl })).toThrow(/schema/);
  });
});
