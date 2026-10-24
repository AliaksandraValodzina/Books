/**
 * Write the evidence: a real print file, and the two documents it came from.
 *
 *     npm run print
 *
 * Everything it writes under `data/bk-spine-template-and-print/` is committed.
 * A dimension in a README is a claim; a PNG whose header says 3150 is a fact,
 * and `test/print-size.test.ts` reads the header rather than this script's
 * word for it.
 *
 * The template and the fill go beside the picture in JSON, serialised out of
 * the same objects the renderer was handed. That is the round trip the format
 * is claiming to support — a page that is data, readable by something that is
 * not this codebase — and writing it next to the output is how the claim stays
 * checkable by somebody who does not want to read TypeScript.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MY_FOREVER } from "../templates/my-forever";
import { FIXTURE_FILL } from "../fixtures/order";
import { renderPrintPng } from "../lib/render/raster";
import { blockingProblems, validateFill, validateTemplate } from "../lib/template/validate";
import { templateRev } from "../lib/template/rev";

const OUT = path.join(process.cwd(), "data", "bk-spine-template-and-print");

async function main() {
  const stamped = templateRev(MY_FOREVER);
  if (stamped !== MY_FOREVER.rev) {
    throw new Error(
      `template ${MY_FOREVER.id} is stamped ${MY_FOREVER.rev} but hashes to ${stamped}. ` +
        `Set rev to "${stamped}" in templates/${MY_FOREVER.id}.ts.`,
    );
  }

  const problems = [
    ...validateTemplate(MY_FOREVER),
    ...blockingProblems(validateFill(MY_FOREVER, FIXTURE_FILL)),
  ];
  if (problems.length) {
    for (const p of problems) console.error(`${p.code}  ${p.where}  ${p.detail}`);
    throw new Error(`${problems.length} problem(s); nothing written`);
  }

  const { png, pixels, svg } = await renderPrintPng(MY_FOREVER, FIXTURE_FILL);
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, `${MY_FOREVER.id}-print-3150.png`), png);
  await writeFile(path.join(OUT, `${MY_FOREVER.id}.template.json`), JSON.stringify(MY_FOREVER, null, 2) + "\n");
  await writeFile(path.join(OUT, `${MY_FOREVER.id}.fill.json`), JSON.stringify(FIXTURE_FILL, null, 2) + "\n");
  await writeFile(path.join(OUT, `${MY_FOREVER.id}.print.svg`), svg + "\n");

  console.log(`wrote ${pixels.width}×${pixels.height} (${(png.length / 1024 / 1024).toFixed(2)} MB) to ${OUT}`);
}

void main();
