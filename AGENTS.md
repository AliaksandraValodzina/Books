<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Books

Personalised printed photo book pages. `README.md` is the orientation; the two
documents that decide everything else are `docs/template-format.md` and
`docs/print.md`.

## The three rules this codebase is built on

**A page template is data, not code.** `lib/template/types.ts` is the format and
carries its own reasoning. Add a capability by adding a *field* with a stated
meaning for its absence, never by adding a branch in a component.

**One renderer.** `lib/render/svg.ts` draws the page; the screen inlines its
output and `lib/render/raster.ts` rasterises the same string.
`test/one-renderer.test.ts` fails on any `if (forPrint)`. If the screen needs
something the print file must not have, it is an *option on the render call*
that the print path does not pass — `guides` is the only example.

**Nothing reads an optional field directly.** `lib/template/defaults.ts` holds
the tolerant readers. A stored template or fill can come from a newer publisher
or a hand-edited file, and the renderer's duty is to draw the sane thing.

## Two things that will bite

**Restamp the template.** `templates/*.ts` carry `rev`, eight hex of their own
content hash. Edit a template and `npm run print` refuses until `rev` is
updated — it prints the value to use. `test/template.test.ts` asserts it too.

**Keep the render deterministic.** Every wobble comes from a seeded
`mulberry32` in `lib/render/random.ts`. `Math.random` anywhere in a render path
breaks the byte-identity test and makes the committed print file meaningless.
Re-run `npm run print` and commit `data/` whenever a render legitimately
changes.

## Writing a test here

Pixel assertions live in `test/pixels.ts`. The standard is that a test which
would pass if the renderer drew nothing is not a test: every content assertion
is paired with the same assertion against a render with that layer removed. A
quick way to check a new test earns its place is to mutate the code it covers
and confirm it goes red.

## Secrets

The repository is public. `.env.example` names every variable and carries no
value for any of them. The only variable with a reader today is
`R2_PUBLIC_BASE_URL`, which is a public URL.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
