# Books

Personalised printed photo books. A customer fills a designed page with their
own photos and words, pays, and the finished page is downloaded as a
print-ready file and uploaded to Printify.

Sold from `books.keepnook.app`.

## Status

Nothing is built yet. This commit exists so the repository has a `main` branch
to work from.

## Two decisions already made

**A page template is data, not code.** A page is a description a renderer
reads — a canvas, a stack of layers, and typed slots a customer fills. This is
deliberate: the same templates are intended to be readable by the Keepnook iPad
app later, so a book is authored once rather than twice.

**One renderer, not two.** The page a customer sees and the file that goes to
the printer come from the same code reading the same description. Two
renderers drift, and you find out in a customer's printed book.

## This repository is public

No Stripe key, no Printify token, no Cloudflare credential and no account id
belongs in it. Environment variables only.
