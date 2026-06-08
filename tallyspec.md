# Tally — End-to-End Solution Spec

*(Working name. The premise: one person pays the whole bill, and everyone else settles up by claiming the dishes they ate or shared from a digital copy of the receipt — fast, fair, and done before the server brings the card back.)*

## The core model in one sentence

One **Host** pays the full bill on their card; the receipt becomes a live, tappable digital list; every other diner claims the items they personally had (sharing emerges automatically when two people tap the same dish); the app splits tax and tip proportionally, reconciles to the exact amount charged, and hands each person a one-tap payment link back to the Host.

## Design principles (the non-negotiables)

Everything below is built on five commitments. If a feature violates one of these, it doesn't ship.

1. **Zero install for guests.** Because the friends are different each time, you cannot assume anyone but the Host has the app. Guests join through a link or QR code in a browser — no download, no account. The moment one person has to install something, the whole thing dies at the table.
2. **One person enters data once.** Only the Host digitizes the receipt. Every other person does the one thing they're actually qualified to do: identify their own meal, which they remember perfectly.
3. **Claiming happens in parallel.** The slow, awkward part of splitting a bill is one person reading the list aloud while everyone half-listens. Tally replaces that with everyone tapping their own items simultaneously. Five people claiming at once takes ten seconds, not five minutes.
4. **It always reconciles to the cent.** The sum of what everyone owes must exactly equal what the Host was charged. This invariant is the trust anchor — the Host can see the numbers add up to the real total, every time.
5. **Settlement is the main event, not the epilogue.** The split is over in two minutes; "hey, you still owe me $12" lingers for four days and sours the next brunch. Tally automates collection so the Host never has to personally chase anyone.

## The end-to-end journey

### Phase 0 — One card pays

Nothing changes about the meal. At the end, one person's card pays the whole bill — which is what the restaurant wants anyway (one transaction, one tip line). That person is the Host. They open Tally; everyone else keeps their phone in their pocket for now.

### Phase 1 — Digitize the receipt

The Host photographs the itemized receipt. Receipt-parsing OCR extracts the structured contents: each line item with its name, quantity, and price, plus the subtotal, tax, any auto-applied service charge, and the printed total. The parser is built to survive real receipts — abbreviated names ("AVO TST" becomes "Avocado toast"), multiples ("2 × Latte"), modifiers, and combined lines.

The Host then sees a quick verification screen — the parsed items as an editable list — and corrects any misreads, merges or splits lines, and confirms the subtotal matches. This is the single data-entry step in the entire flow, done once, by one person. If the receipt won't parse (handwritten, faded, non-itemized), the Host can add items manually or drop to an even split for the whole table.

### Phase 2 — Open the session

The Host sets the tip here — a suggested 18/20/22% or a custom amount, entered as a percentage or a flat figure — and chooses whether tip is split *proportionally* (the fair default, matching how tax already works) or *evenly* across heads. Tally confirms the grand total now equals the printed total before going further; if it doesn't, the Host is prompted to fix it. This guarantee is what makes everyone trust the result.

Tally then creates a session with a short join code, a QR code, and a shareable link. If the Host has dined with some of these people before, their names and preferred payment methods are pre-seeded so the table is half set up already. The Host displays the QR at the table or drops the link into the group chat for anyone claiming later.

### Phase 3 — Parallel claiming (the core)

Each guest scans the QR and lands on a web page — no install, no signup. They confirm their name and pick a color, and they're in. They see the live digital receipt as a grid of tappable item cards, and they tap the dishes they ordered. Each tap is a claim.

Sharing is not a separate mode — it *emerges*. If more than one person taps the same item, that item automatically becomes shared and splits equally among everyone who claimed it. Three people pick at the fries, the fries split three ways, with no one having to declare "that was shared." For the bottle-of-wine case where an even split isn't right, a claimer can set a custom ratio, but equal is the default because it's almost always what people mean.

While this happens, a live board is visible to the whole table: who has joined, who is still claiming, every item's claim status, and — most importantly — which items are still **unclaimed**. The orphaned avocado toast sitting there with no name on it is visible to everyone, so its owner claims it. This visibility is the entire anti-cheating mechanism; the table is watching, so honesty comes for free without Tally having to enforce anything. Each person watches their own running total tick up as they claim — their items, plus their proportional slice of tax and tip.

A subtle but important property: because people claim only what they had, the awkward sentence "I only got a coffee, can we not split evenly?" never has to be said out loud. The model itself handles the asymmetry quietly.

### Phase 4 — The fairness math

Once claiming settles, Tally computes each person's total:

Tax is allocated in proportion to each person's claimed subtotal, because that's exactly how tax accrued in the first place. Tip follows the mode the Host chose — proportional by default, even if selected. An auto-applied service charge is treated like tip. Discounts or comped items are spread proportionally, or assigned to a specific person if the Host marks them that way.

Unclaimed items can't simply be ignored, or the bill won't add up. The session stays open until everything is claimed or explicitly resolved: someone claims the orphan, the Host assigns it, or the remaining unclaimed amount is split evenly across the table. And because proportional splits and three-way shares produce fractional cents, Tally distributes the rounding remainder deterministically (largest-remainder method) so that the individual totals sum to the exact amount charged — never a penny off, never a penny over. Everyone sees a clean number; the reconciliation happens underneath.

### Phase 5 — Settlement (the part that actually lingers)

The debt structure is a simple star: everyone owes the Host. On each guest's screen, their final amount appears with a one-tap payment link, pre-filled with the amount and a memo ("Friday brunch — your share"), opening straight into Venmo, Cash App, PayPal, Apple Cash, or Zelle depending on what they use. Tally remembers each recurring person's preferred method so the link is correct without asking.

The Host gets a live settlement board showing who has paid and who is still pending. Unpaid balances trigger a gentle automated nudge later — that evening or the next morning — so the Host never has to send the relationship-damaging "you still owe me" text themselves; Tally does it softly, on their behalf. For recurring groups, a small lingering balance can optionally roll forward into a running tab with that person rather than being chased at all, which quietly turns the exact-split model into a light "you'll get it next time" ledger when that's friendlier. When a guest pays, the board clears and the Host is notified — clean closure.

### Phase 6 — Closure and memory

Tally remembers the people you dine with (name plus payment handle, with no account required on their end), so the next time you host this crew the table is pre-populated and the payment links are pre-filled. It also learns each table's habits — the tip percentage they land on, whether they prefer proportional or even tip, their usual split mode — and makes those the defaults. A lightweight history of past meals supports the optional running-tab behavior and lets anyone see, over time, that it all came out roughly fair. The practical target for the whole loop: it should be finished before the server returns the card.

## Edge cases and how each is handled

A spec is only as good as its handling of the messy real world. Each of these has a defined behavior so the session can always close cleanly:

- **Receipt won't OCR (handwritten, faded, non-itemized):** manual quick-add, or fall back to an even split for the table.
- **Item nobody claims:** flagged on the live board; resolved by someone claiming it, the Host assigning it, or splitting the remainder evenly.
- **Diner with no smartphone, or who left early:** the Host claims on their behalf and sends them a payment link by text, or collects from them directly.
- **Shared appetizers, bottles, platters:** handled automatically by co-tapping; custom ratios available for the rare uneven case.
- **Someone is being treated (birthday, etc.):** mark them as treated; their items redistribute across the rest of the table.
- **Accidental or mistaken claim:** any claim can be un-tapped before the session closes, and the Host has a final override.
- **Tip added after the card runs (US tip line):** the Host can enter the actual tip amount after the fact and the totals recompute.
- **Tax-inclusive pricing (common outside the US):** the parser reads the subtotal and tax structure accordingly so proportional allocation still works.
- **Two cards used, or someone threw in cash:** support multiple payers and run a small debt-minimization pass so people make the fewest transfers (a fast-follow beyond the first version).
- **A guest loses connection mid-claim:** session state lives server-side; they rejoin via the same link and pick up where they left off.
- **Fractional cents:** largest-remainder rounding guarantees the individual totals sum to the exact charged amount.

## Light technical architecture

The Host uses the app (native or web); guests use a pure web claim page delivered as a PWA, so there is genuinely nothing to install. State syncs in real time across all devices via a live channel (WebSocket or a Firebase-style backend) so claims and the presence board update instantly. Receipt parsing runs through a specialized receipt-OCR service or a vision model emitting structured line-item JSON. Payments deliberately use deep links into the consumer P2P apps people already have, rather than Tally handling money itself — this keeps the product out of money-transmitter regulation in the first version, with optional in-app payments as a later add. Sessions are short-lived and keyed by their join code; guest identities are ephemeral (just a name and color), while recurring identities and preferences are stored against the Host's account. Personal data is kept minimal and retention short, since guests never create accounts.

## Why this is the optimal shape

This design wins on the dimension that actually matters — total human effort and lingering friction — rather than on arithmetic sophistication. One person enters data once; everyone else only identifies their own meal. Claiming runs in parallel, so the table-wide time cost barely grows with group size. The reconciliation invariant makes the result trustworthy at a glance. Automated, no-chase settlement removes the single most relationship-damaging part of splitting a bill. The zero-install guest flow and ephemeral identities make it survive the rotating-friends reality, while recurring memory makes it faster every week with the people who do come back. And because people claim only what they had, the model preserves the social warmth of the meal — no public nickel-and-diming, just a quiet tap and a clean goodbye.
