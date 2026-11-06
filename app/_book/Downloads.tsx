"use client";

/**
 * **The file that goes to the printer, and it is not the buyer's button.**
 *
 * The brief is explicit about the fulfilment model and it is the most important
 * simplification in the whole plan: *"no printer integration, no order API, no
 * automated fulfilment. An order arrives, a file is produced, a human uploads
 * it."* So there has to be a way for that human to get the file, and this is
 * it.
 *
 * It is **marked as the captain's and placed after the buyer's `Continue`**,
 * because a buyer who sees "Download the print file" on a shop page concludes
 * one of two wrong things: that the thing they are buying is a PDF, or that
 * they have already somehow bought it. Labelling it honestly costs one sentence
 * and removes both.
 *
 * **It is the same renderer.** The request carries the fill the preview above
 * was drawn from and the photograph's bytes; `app/api/book/print/route.ts`
 * re-verifies every byte against its digest and runs the same
 * `renderPageSvg` → `resvg` path. The preview and the file cannot be different
 * pictures, because they are not two pictures.
 */

import { useCallback, useState } from "react";
import { pageSequence } from "../../lib/book/derive";
import { bytesOf } from "../../lib/book/order";
import { useBook } from "./BookProvider";

type Kind = "pdf" | "png";

export default function Downloads() {
  const { book, order, fill, ready } = useBook();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sequence = pageSequence(book);

  const fetchFile = useCallback(
    async (kind: Kind, index?: number) => {
      setBusy(kind);
      setProblem(null);
      try {
        const query = kind === "png" ? `?format=png&page=${index}` : "?format=pdf";
        const response = await fetch(`/api/book/print${query}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fill, photos: bytesOf(order) }),
        });
        if (!response.ok) {
          const detail: unknown = await response.json().catch(() => null);
          const problems = (detail as { problems?: Array<{ code: string }> } | null)?.problems;
          const error = (detail as { error?: string } | null)?.error;
          setProblem(
            `The print file could not be made: ${
              problems?.map((p) => p.code).join(", ") ?? error ?? `HTTP ${response.status}`
            }`,
          );
          return;
        }
        // The server names the file — it is the one that knows the fill's
        // fingerprint, and a name invented here would be a second naming
        // scheme for the same artefact.
        const named = /filename="([^"]+)"/.exec(
          response.headers.get("content-disposition") ?? "",
        )?.[1];
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = named ?? `${book.id}.${kind}`;
        link.click();
        URL.revokeObjectURL(url);
      } catch {
        setProblem("The print file could not be fetched. Check the connection and try again.");
      } finally {
        setBusy(null);
      }
    },
    [book.id, fill, order],
  );

  return (
    <section
      data-testid="downloads"
      className="mt-12 rounded-xl border border-current/15 p-4 text-sm"
      aria-labelledby="for-the-printer"
    >
      <h3 id="for-the-printer" className="font-semibold">
        For whoever is sending this to the printer
      </h3>
      <p className="mt-1 opacity-70">
        Not part of buying the book. These are the print files for the order above, at{" "}
        {book.page.print.pixels.width} × {book.page.print.pixels.height} — the whole book as one
        PDF, or any single page as a PNG. The PNG carries a real sRGB chunk; the PDF is{" "}
        <code>/DeviceRGB</code>, which every reader treats as sRGB.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!ready || busy !== null}
          data-testid="download-pdf"
          onClick={() => void fetchFile("pdf")}
          className="rounded-lg bg-[#2b1d14] px-4 py-2 font-semibold text-[#efe9df] disabled:opacity-50"
        >
          {busy === "pdf" ? "Rendering every page…" : `The whole book (${sequence.length} pages, PDF)`}
        </button>

        <label className="flex items-center gap-2">
          <span className="sr-only">Which page</span>
          <select
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            data-testid="page-picker"
            className="rounded-lg border-2 border-current/20 bg-transparent px-2 py-2"
          >
            {sequence.map((p, i) => (
              <option key={p.id} value={i}>
                {p.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!ready || busy !== null}
            data-testid="download-png"
            onClick={() => void fetchFile("png", page)}
            className="rounded-lg border-2 border-current/25 px-4 py-2 font-semibold disabled:opacity-50"
          >
            {busy === "png" ? "Rendering…" : "That page (PNG)"}
          </button>
        </label>
      </div>

      <p role="status" className="mt-2">
        {problem ? (
          <span data-testid="download-problem" className="font-medium text-[#8e1c33]">
            {problem}
          </span>
        ) : ready ? (
          <span className="opacity-60">
            The whole book takes about half a minute — every page is rasterised at print
            resolution, one at a time.
          </span>
        ) : (
          <span className="opacity-60">
            The book has to be finished first: a print file with a hole in it is worse than none.
          </span>
        )}
      </p>
    </section>
  );
}
