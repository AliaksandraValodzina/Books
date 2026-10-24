/**
 * The furniture of the page, drawn from numbers.
 *
 * Every mark on this page that is not a customer's photograph or a customer's
 * word is made here: the dotted cloth, the strip of tape, the kiss. **Nothing
 * is traced and nothing is sampled.** Each one is a small amount of geometry
 * driven by the parameters an `Art` declares, which is why the artwork is ours
 * by construction — a scrapbook page with hearts and a kiss on it is a
 * convention, and a convention is not a thing anybody owns, but a *file* is,
 * and there is no file here.
 *
 * It is also the only way the print file can be honest. A decorative sprite
 * authored at screen size and blown up to 3150 px is soft at exactly the
 * resolution somebody paid for; a curve has no resolution at all.
 *
 * Every wobble comes from `./random.ts` seeded by the template, so this module
 * is a pure function of its input and the page renders the same bytes forever.
 */

import type { Art, Box, Colour } from "../template/types";
import { r } from "../template/geometry";
import { jitter, mulberry32 } from "./random";

/** A fragment: things that must go in `<defs>`, and the drawing itself. */
export interface Fragment {
  defs: string;
  body: string;
}

const EMPTY: Fragment = { defs: "", body: "" };

/** Fractional helpers — every shape below is written against its own box. */
function at(b: Box, fx: number, fy: number): [number, number] {
  return [r(b.x + b.width * fx), r(b.y + b.height * fy)];
}

function pathFrom(b: Box, cmds: Array<[string, ...Array<[number, number]>]>): string {
  return cmds
    .map(([op, ...pts]) => `${op} ${pts.map(([fx, fy]) => at(b, fx, fy).join(" ")).join(" ")}`)
    .join(" ")
    .concat(" Z");
}

// ---------------------------------------------------------------------------
// The cloth
// ---------------------------------------------------------------------------

/**
 * A brown polka-dot cloth.
 *
 * Dots on a half-dropped grid — two per tile, on the tile's diagonal — which is
 * what makes it read as fabric rather than as graph paper. The weave is two
 * one-point thread patterns crossing at low opacity; it is almost invisible on
 * screen and is most of why the ground does not look like flat vector colour at
 * 300 DPI.
 */
function polkaCloth(id: string, b: Box, a: Extract<Art, { kind: "polkaCloth" }>): Fragment {
  const pitch = Math.max(a.pitch, 1);
  const defs: string[] = [];
  defs.push(
    `<pattern id="${id}-dots" width="${r(pitch)}" height="${r(pitch)}" patternUnits="userSpaceOnUse">` +
      `<rect width="${r(pitch)}" height="${r(pitch)}" fill="${a.background}"/>` +
      `<circle cx="${r(pitch * 0.25)}" cy="${r(pitch * 0.25)}" r="${r(a.radius)}" fill="${a.dot}"/>` +
      `<circle cx="${r(pitch * 0.75)}" cy="${r(pitch * 0.75)}" r="${r(a.radius)}" fill="${a.dot}"/>` +
      `</pattern>`,
  );
  const body: string[] = [
    `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.width)}" height="${r(b.height)}" fill="url(#${id}-dots)"/>`,
  ];
  if (a.weave) {
    const w = a.weave;
    const wp = Math.max(w.pitch, 0.5);
    defs.push(
      `<pattern id="${id}-weave" width="${r(wp)}" height="${r(wp)}" patternUnits="userSpaceOnUse">` +
        `<rect x="0" y="0" width="${r(w.width)}" height="${r(wp)}" fill="${w.colour}"/>` +
        `<rect x="0" y="0" width="${r(wp)}" height="${r(w.width)}" fill="${w.colour}"/>` +
        `</pattern>`,
    );
    body.push(
      `<rect x="${r(b.x)}" y="${r(b.y)}" width="${r(b.width)}" height="${r(b.height)}" ` +
        `fill="url(#${id}-weave)" opacity="${r(w.opacity)}"/>`,
    );
  }
  return { defs: defs.join(""), body: body.join("") };
}

// ---------------------------------------------------------------------------
// The tape
// ---------------------------------------------------------------------------

/**
 * A strip of translucent tape with torn ends.
 *
 * The long edges are straight — tape is cut from a roll along them — and the
 * short ends are torn, which is the whole tell. The tear is a walk of a few
 * segments whose wander is `tear` points either side of a straight cut, seeded,
 * so a given strip is torn the same way forever.
 *
 * The highlight band along the top and the shadow below are what stop it
 * reading as a flat rectangle: real tape is a little glossy and lifts the card
 * a fraction off the cloth.
 */
function tape(id: string, b: Box, a: Extract<Art, { kind: "tape" }>): Fragment {
  const steps = 7;
  const j = jitter(a.seed, a.tear);
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const y = b.y + (b.height * i) / steps;
    left.push([b.x + j(), y]);
    right.push([b.x + b.width + j(), y]);
  }
  const d =
    `M ${r(left[0][0])} ${r(left[0][1])} ` +
    left
      .slice(1)
      .map(([x, y]) => `L ${r(x)} ${r(y)}`)
      .join(" ") +
    ` L ${r(right[steps][0])} ${r(right[steps][1])} ` +
    right
      .slice(0, steps)
      .reverse()
      .map(([x, y]) => `L ${r(x)} ${r(y)}`)
      .join(" ") +
    " Z";

  const defs =
    `<filter id="${id}-soft" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feGaussianBlur stdDeviation="${r(b.height * 0.06)}"/>` +
    `</filter>` +
    // The gloss and the edge darkening are clipped to the strip, or their
    // straight ends run past the torn ones and give the whole thing away.
    `<clipPath id="${id}-strip"><path d="${d}"/></clipPath>` +
    // The sheen is a gradient and not a band. Hard-edged highlights turned the
    // first version of this into three stacked bars; tape catches the light
    // across its whole width and loses it gradually.
    `<linearGradient id="${id}-sheen" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.08"/>` +
    `<stop offset="0.2" stop-color="#ffffff" stop-opacity="0.5"/>` +
    `<stop offset="0.52" stop-color="#ffffff" stop-opacity="0.04"/>` +
    `<stop offset="0.78" stop-color="#ffffff" stop-opacity="0.22"/>` +
    `<stop offset="1" stop-color="#6f6552" stop-opacity="0.14"/>` +
    `</linearGradient>`;

  const box = `x="${r(b.x - b.width)}" y="${r(b.y)}" width="${r(b.width * 3)}" height="${r(b.height)}"`;

  const body =
    // The lift off the cloth.
    `<path d="${d}" fill="#2a1a10" opacity="0.26" filter="url(#${id}-soft)" ` +
    `transform="translate(0 ${r(b.height * 0.07)})"/>` +
    // The tape itself.
    `<path d="${d}" fill="${a.colour}" opacity="${r(a.opacity)}"/>` +
    // Clipped to the strip, or the sheen's straight ends run past the torn ones
    // and give the whole thing away.
    `<g clip-path="url(#${id}-strip)">` +
    `<rect ${box} fill="url(#${id}-sheen)" opacity="${r(a.opacity + 0.2)}"/>` +
    `</g>`;

  return { defs, body };
}

// ---------------------------------------------------------------------------
// The kiss
// ---------------------------------------------------------------------------

/**
 * A lipstick print.
 *
 * Three things are doing all the work, and the first version of this had none
 * of them and read as a hatched blob:
 *
 * - **The two lips do not touch.** A gap of a few percent of the box between
 *   the upper lip's underside and the lower lip's top is the mouth line, and
 *   without it the two fills merge into one shape with no mouth in it.
 * - **The cupid's bow is a real M**, with the centre dip lower than the two
 *   peaks by a wide margin. Softening it is what turns lips into a heart.
 * - **The creases radiate.** They lean away from the centre by an amount that
 *   grows with their distance from it, which is how lips actually crease and
 *   why parallel strokes read as hatching instead.
 *
 * They are clipped to the lips so one can never escape onto the card, and the
 * whole mark is a little transparent, because a kiss is a print and not a
 * sticker.
 */
function kiss(id: string, b: Box, a: Extract<Art, { kind: "kiss" }>): Fragment {
  const upper = pathFrom(b, [
    ["M", [0.02, 0.5]],
    ["C", [0.06, 0.32], [0.18, 0.13], [0.3, 0.16]],
    ["C", [0.38, 0.18], [0.45, 0.3], [0.5, 0.31]],
    ["C", [0.55, 0.3], [0.62, 0.18], [0.7, 0.16]],
    ["C", [0.82, 0.13], [0.94, 0.32], [0.98, 0.5]],
    ["C", [0.75, 0.45], [0.25, 0.45], [0.02, 0.5]],
  ]);
  const lower = pathFrom(b, [
    ["M", [0.02, 0.56]],
    ["C", [0.25, 0.515], [0.75, 0.515], [0.98, 0.56]],
    ["C", [0.92, 0.79], [0.74, 0.97], [0.5, 0.99]],
    ["C", [0.26, 0.97], [0.08, 0.79], [0.02, 0.56]],
  ]);

  const rand = mulberry32(a.seed);
  const creases: string[] = [];
  const n = Math.max(0, Math.floor(a.creases));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const fx = 0.1 + t * 0.8 + (rand() - 0.5) * (0.4 / n);
    const splay = (fx - 0.5) * 0.3;
    const up = 0.13 + rand() * 0.09;
    const down = 0.2 + rand() * 0.15;
    const [ux0, uy0] = at(b, fx, 0.47);
    const [ux1, uy1] = at(b, fx + splay * 0.5, 0.47 - up);
    const [lx0, ly0] = at(b, fx, 0.56);
    const [lx1, ly1] = at(b, fx + splay, 0.56 + down);
    creases.push(`<path d="M ${ux0} ${uy0} L ${ux1} ${uy1}"/>`);
    creases.push(`<path d="M ${lx0} ${ly0} L ${lx1} ${ly1}"/>`);
  }

  const defs = `<clipPath id="${id}-lips"><path d="${upper}"/><path d="${lower}"/></clipPath>`;

  const body =
    `<g opacity="0.9">` +
    `<path d="${upper}" fill="${a.colour}"/>` +
    `<path d="${lower}" fill="${a.colour}"/>` +
    `<g clip-path="url(#${id}-lips)" stroke="#ffffff" stroke-opacity="0.42" ` +
    `stroke-width="${r(b.width * 0.013)}" stroke-linecap="round" fill="none">` +
    creases.join("") +
    `</g></g>`;

  return { defs, body };
}

// ---------------------------------------------------------------------------

/**
 * The single entry point.
 *
 * An unrecognised `kind` draws **nothing** rather than falling back to a shape,
 * and that is the opposite of the rule a mask follows — deliberately. A mask
 * whose kind is unknown still has a photograph to show and an empty window
 * would be a hole in the page; a decoration whose kind is unknown is furniture
 * this renderer has never heard of, and inventing a brown rectangle where a
 * newer publisher meant something else is worse than leaving the cloth bare.
 */
export function drawArt(id: string, frame: Box, art: Art): Fragment {
  switch (art.kind) {
    case "polkaCloth":
      return polkaCloth(id, frame, art);
    case "tape":
      return tape(id, frame, art);
    case "kiss":
      return kiss(id, frame, art);
    default:
      return EMPTY;
  }
}

export function shadowFilter(id: string, blur: number, colour: Colour): string {
  return (
    `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feGaussianBlur stdDeviation="${r(blur)}" result="b"/>` +
    `<feFlood flood-color="${colour}" result="c"/>` +
    `<feComposite in="c" in2="b" operator="in"/>` +
    `</filter>`
  );
}
