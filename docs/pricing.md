# What the book costs, and what the page may say about it

**Two editions, two real prices, and no theatre.** `lib/book/editions.ts` holds
the numbers; this document holds the reasoning, because the reasoning is the
part that stops somebody adding a struck-out price in six months.

---

## The numbers

| | Price | Landed cost | Gross margin |
|---|---|---|---|
| **Softcover** — the listed price | **AUD 59** | ~20 | ~66% |
| **Hardcover** — the single upgrade | **AUD 69** | ~25 | ~64% |

Settled by the captain on 6 November against costs read off their own Printify
catalogue: **softcover AUD 11.67 (8.60 with Printify Premium), hardcover
AUD 16.50 (12.16 with Premium).** Shipping and the exchange rate are not pinned,
so the landed costs above carry a few dollars of slack and the margins are
±3 points. They land on the ~68% gross margin Wonderbly's audited accounts
actually run at, which is the only external check available.

**Printify Premium** saves AUD 3.07 a softcover and AUD 4.34 a hardcover. Its
subscription cost is not known and is not guessed; it is worth taking the moment
volume passes a handful a month.

---

## Why there is no "was" price, and why the type cannot hold one

The temptation in a launch is a strike-through: *~~AUD 79~~ AUD 59*. It is
rejected on three grounds, in increasing order of how expensive it is to learn.

**It is a misleading representation about price.** Under Australian Consumer
Law, a was/now comparison where the higher price was never genuinely charged for
a reasonable period is a misleading representation, and the ACCC enforces it.
This is a public page selling to Australian parents.

**It cannot be unwound.** By the time the "introductory" period is over, the
discounted price *is* the price, and raising it reads to every returning
customer as a price rise rather than as a return to normal.

**It is the wrong register.** The object is a hardbound book with a child's name
in it, bought as a gift. A countdown timer beside it does the same thing to the
purchase that a plastic sleeve does to a present.

So `Edition` has fields for a label, a price, a blueprint and a note, and **no
field for a comparison, a percentage or an expiry** — the same trick `Fact`
plays one level up in `lib/product.ts`, where the only arm with a `value` is the
confirmed one. A struck-out price is not a discouraged pattern here; it is
unrepresentable. `test/book-order.test.ts` and `test/book-flow.test.tsx` both
assert its absence, in the data and in the rendered page.

### What is allowed instead

**A genuine launch offer with a stated end date.** The captain intends AUD 10
off either edition until a date they name. That gives the same urgency lawfully,
and it gives a planned road back to full price once there are reviews to sell on
instead.

**It is not built, because the date does not exist yet.** An offer with no
stated end is the mechanic this page is avoiding, so there is nothing in the
code for one. When the captain names a date it is an `Offer` beside `Edition`
with an `endsOn`, and a page that renders it only while it is running.

**Second book half price** is the captain's other intended mechanic — Wonderbly's
bundle, which works unusually well here because the buyer is often shopping a
shower, siblings or grandparents. It needs a cart, and there is no cart: the
brief rules out order management entirely, so this waits for one.

---

## What the page says about delivery and about going wrong

In `BOOK_PROMISES`, and every line is the captain's own commitment rather than
anything this repository can measure:

- **Dispatch in 2–4 working days**, with shipping time stated separately and
  honestly rather than folded in.
- **A 24-hour free-change window** — *"we haven't printed it yet; tell us within
  24 hours and we'll fix anything, free."* This is honest **precisely because
  fulfilment is by hand**: there really is a gap between an order arriving and a
  file going to a printer, and saying so turns the slowest part of the process
  into the thing that makes a typo survivable.
- **Anything wrong with the object is reprinted free**, unconditionally.
- **Personalised books are not returnable for a change of mind**, stated plainly,
  because there is no cooling-off right for goods clearly personalised — and the
  quality remedies above survive in full regardless, which is why they are
  stated first.

**One standing policy is deliberately not on the page.** A customer's *own* typo
is reprinted once, free, without argument, and charged at cost the second time.
It is applied quietly when somebody asks, and never advertised, so that it stays
goodwill rather than an invitation. A book costs about AUD 20; a sour review
costs far more to a brand with none to dilute it. **Nothing that reaches the
markup may mention it.**

The order notification has to reach the captain immediately rather than sitting
in an inbox. With hand fulfilment the risk was never the printer — it was an
order arriving overnight and the 2–4 days starting a day late. That is a
checkout concern and the checkout is stubbed; see `lib/checkout.ts`.
