/**
 * Content addressing, and the lie it is there to catch.
 *
 * An `AssetRef` is an address *and* a claim about what is at it. The claim is
 * the half that matters: a renderer that trusted it would print whatever file
 * happened to be sitting under the key, which is exactly what goes wrong when
 * an upload lands in the wrong place — silently, and in a customer's book.
 */

import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AssetDigestMismatch,
  AssetMissing,
  FIXTURE_ASSET_DIR,
  assetUrl,
  dataUri,
  loadAsset,
  sha256,
} from "../lib/assets/resolve";
import { LANDSCAPE, PORTRAIT } from "../fixtures/order";
import { renderPrintSvg } from "../lib/render/raster";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";

const ORIGINAL_BASE = process.env.R2_PUBLIC_BASE_URL;
afterEach(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.R2_PUBLIC_BASE_URL;
  else process.env.R2_PUBLIC_BASE_URL = ORIGINAL_BASE;
});

describe("the fixture photographs", () => {
  it("hash to the digests the fill names them by", async () => {
    for (const ref of [LANDSCAPE, PORTRAIT]) {
      expect(sha256(await loadAsset(ref))).toBe(ref.sha256);
    }
  });

  it("are the two different shapes the fixture claims", async () => {
    expect(LANDSCAPE.px[0]).toBeGreaterThan(LANDSCAPE.px[1]);
    expect(PORTRAIT.px[1]).toBeGreaterThan(PORTRAIT.px[0]);
  });
});

describe("a digest that does not match its bytes", () => {
  it("is refused rather than drawn", async () => {
    await expect(loadAsset({ ...LANDSCAPE, sha256: "0".repeat(64) })).rejects.toThrow(AssetMissing);
  });

  it("is caught even when the file is exactly where the key says it is", async () => {
    // The failure that matters: a file *under the right key* whose bytes are
    // something else. Nothing about the name gives it away and nothing short of
    // hashing catches it — which is why this is staged in the real store rather
    // than mocked, and removed again afterwards.
    const digest = "a".repeat(64);
    const decoy = path.join(FIXTURE_ASSET_DIR, `${digest}.png`);
    try {
      await writeFile(decoy, Buffer.from("not a photograph"));
      await expect(
        loadAsset({ sha256: digest, mime: "image/png", px: [10, 10], label: "decoy" }),
      ).rejects.toThrow(AssetDigestMismatch);
    } finally {
      await rm(decoy, { force: true });
    }
  });
});

describe("where an asset is served from", () => {
  it("is the local route when no bucket is configured", () => {
    delete process.env.R2_PUBLIC_BASE_URL;
    expect(assetUrl(LANDSCAPE)).toBe(`/api/assets/${LANDSCAPE.sha256}.png`);
  });

  it("is the bucket when one is", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://assets.example.test/";
    expect(assetUrl(LANDSCAPE)).toBe(`https://assets.example.test/${LANDSCAPE.sha256}.png`);
  });
});

describe("the print path", () => {
  it("carries its photographs in the file rather than fetching them", async () => {
    // A print file that depended on a bucket being reachable at the moment
    // somebody clicked Download is a print file that sometimes comes out with a
    // hole in it.
    const svg = await renderPrintSvg(MY_FOREVER, FIXTURE_FILL);
    expect(svg).not.toMatch(/href="https?:/);
    expect(svg).not.toContain("/api/assets/");
    expect(svg.match(/data:image\/png;base64,/g)).toHaveLength(2);
  });

  it("builds a data URI that decodes back to the same bytes", async () => {
    const bytes = await loadAsset(PORTRAIT);
    const uri = dataUri(bytes, PORTRAIT.mime);
    const back = Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
    expect(sha256(new Uint8Array(back))).toBe(PORTRAIT.sha256);
  });
});
