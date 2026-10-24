import type { Metadata } from "next";
import { fontFaceCss } from "../lib/render/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Books — My Forever",
  description: "A personalised printed photo book page, rendered from its template.",
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
