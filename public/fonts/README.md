# Faces

Two, vendored rather than fetched from a CDN. The browser loads them over
`@font-face` from this directory and the rasteriser reads the same files off
disk, so the screen and the print file are set in the same bytes. A webfont CDN
would make a customer's print file depend on somebody else's uptime.

`lib/render/fonts.ts` is the registry a template names a face through; a
`textSlot` names a key there, never a CSS family.

| Key | Face | File | Licence |
|---|---|---|---|
| `typewriter` | Special Elite | `SpecialElite-Regular.ttf` | Apache-2.0 — `SpecialElite-LICENSE.txt` |
| `hand` | Indie Flower | `IndieFlower-Regular.ttf` | SIL Open Font License 1.1 — `IndieFlower-OFL.txt` |

Both are from the Google Fonts repository and both licences permit embedding,
redistribution and commercial use. The licence text ships beside each file
because the OFL requires it and because a public repository is where somebody
will look.
