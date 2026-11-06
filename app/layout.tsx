import type { Metadata } from "next";
import { BRAND } from "../lib/brand";
import { fontFaceCss } from "../lib/render/fonts";
import "./globals.css";

/**
 * The default for any page that does not set its own.
 *
 * It names the shop rather than a title, because the shop sells the baby book
 * and "My Forever" is the technical spine behind it at `/my-forever`, which
 * sets its own. The name comes from `lib/brand.ts` and is written nowhere
 * else — the shop has already been renamed once.
 */
export const metadata: Metadata = {
  title: `${BRAND.name} — personalised printed books`,
  description: "Personalised printed books, rendered from a template that is data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          The faces come out of `lib/render/fonts.ts` — the same table the
          rasteriser reads its file paths from. A second list of `@font-face`
          rules hand-written in CSS is exactly the drift this product cannot
          afford: the screen would set a word in a face the print file does not
          have, and nobody would see it until the book arrived.
        */}
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss() }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
