/**
 * Mint the two placeholder photographs the fixture fills the hearts with.
 *
 * **Not a build step.** It is run by hand when the fixture needs new pictures
 * and its output is committed, because the fixture's whole job is to be the
 * same two files forever: a template renders the same bytes every time only if
 * the photographs going into it are the same bytes every time.
 *
 * They are generated rather than photographed so that the repository — which is
 * public — carries no real person's face and no stock licence. They are
 * deliberately abstract: a fixture that looked like a real photograph would
 * invite somebody to treat it as one.
 *
 * The two are **different shapes on purpose** — one landscape, one portrait —
 * because a square heart filled by a landscape picture and a heart filled by a
 * portrait take different branches through `placePhoto`, and a fixture that
 * only ever exercised one of them would leave the other untested.
 *
 *     npx tsx scripts/make-fixture-photos.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { FIXTURE_ASSET_DIR, sha256 } from "../lib/assets/resolve";
import { mulberry32 } from "../lib/render/random";

function bokeh(seed: number, count: number, w: number, h: number): string {
  const rand = mulberry32(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const r = (0.03 + rand() * 0.1) * Math.min(w, h);
    out.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" ` +
        `fill="#ffffff" opacity="${(0.04 + rand() * 0.12).toFixed(3)}"/>`,
    );
  }
  return out.join("");
}

function placeholder(w: number, h: number, from: string, to: string, seed: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    bokeh(seed, 34, w, h) +
    `</svg>`
  );
}

const PHOTOS = [
  { name: "landscape", w: 1600, h: 1100, from: "#E2A26B", to: "#7C3F5B", seed: 20260101 },
  { name: "portrait", w: 1100, h: 1500, from: "#6E97C9", to: "#1F3350", seed: 20260202 },
];

async function main() {
  await mkdir(FIXTURE_ASSET_DIR, { recursive: true });
  for (const p of PHOTOS) {
    const svg = placeholder(p.w, p.h, p.from, p.to, p.seed);
    const png = new Uint8Array(
      new Resvg(svg, { fitTo: { mode: "width", value: p.w } }).render().asPng(),
    );
    const digest = sha256(png);
    await writeFile(path.join(FIXTURE_ASSET_DIR, `${digest}.png`), png);
    console.log(
      JSON.stringify(
        { label: p.name, sha256: digest, mime: "image/png", px: [p.w, p.h] },
        null,
        2,
      ),
    );
  }
}

void main();
