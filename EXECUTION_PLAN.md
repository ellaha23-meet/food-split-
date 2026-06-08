# Tally — End-to-End Execution Plan

*Companion to `tallyspec.md`. This document turns the product spec into a buildable, sequenced engineering plan: stack decisions, data model, the reconciliation engine, milestone-by-milestone delivery, testing, security/privacy, risks, and the MVP cut line.*

> **See also `PHASES.md`** — the milestones below are decomposed there into ~35 small, independently-verifiable phases, each with a strict contract (hard constraints + binary exit criteria) and project-wide guardrails.

---

## 1. Executive summary

Tally is a real-time, zero-install bill-splitting web app. One **Host** photographs a receipt, an OCR/vision pipeline turns it into editable line items, guests join a live session over the web (no app, no account) and **claim** the dishes they ate, and the app splits tax + tip proportionally, reconciles to the exact cent, and hands each guest a one-tap P2P payment link back to the Host.

The whole loop must finish **before the server brings the card back** (~2 minutes), which makes three properties load-bearing for every decision below:

1. **Latency** — claiming and the presence board must feel instant (real-time channel, optimistic UI).
2. **Zero friction for guests** — a link/QR opens a page that works immediately on any phone browser.
3. **Cent-exact reconciliation** — the math must always sum to what the Host was charged; this is the trust anchor and gets a dedicated, heavily-tested engine.

**Recommended stack:** Next.js (React, TypeScript) PWA for both Host and guest flows · Supabase (Postgres + Realtime + Storage + Auth) as the backend · a vision LLM (Claude) for receipt → structured-JSON extraction with manual fallback · P2P deep links for settlement · Twilio (opt-in) for SMS nudges. Rationale and alternatives are in §3.

**Release strategy:** a thin **walking skeleton** first, then an **MVP (v0.1)** that honors all five non-negotiables, then **v1.0** (memory, nudges, edge cases), then **fast-follows** (multi-payer + debt minimization, in-app payments). See §2.

**Notional timeline:** ~10–12 weeks to v1.0 with 2 engineers (or ~16–20 weeks solo). MVP demoable end-to-end by ~week 5. See §7.

---

## 2. Scope & release strategy

The spec is broad. We ship in honest increments, never violating a design principle to move faster.

### 2.1 The five non-negotiables (acceptance gates for every release)

| # | Principle | What it forces in the build |
|---|-----------|------------------------------|
| 1 | Zero install for guests | Guest claim page is a plain URL; works on first load, no signup, ephemeral identity |
| 2 | One person enters data once | Only the Host digitizes/edits the receipt |
| 3 | Claiming in parallel | Real-time multi-user claims + live presence board |
| 4 | Always reconciles to the cent | Deterministic largest-remainder rounding engine, invariant-tested |
| 5 | Settlement is the main event | Payment links + settlement status board are in scope from MVP, not deferred |

### 2.2 Release tiers

**Walking skeleton (internal only, ~week 2–3)** — prove the spine end-to-end with fakes:
- Hard-coded receipt → session → two browsers claim items in real time → totals compute → console-logged payment link. No OCR, no auth, ugly UI. Validates the realtime + reconciliation spine.

**MVP / v0.1 (the demoable product, ~week 5)** — the smallest thing that honors all five principles:
- Host web flow: photograph receipt → vision OCR → verify/edit screen → manual add/even-split fallback.
- Session: short join code, QR, shareable link.
- Guest claim page: name + color, tappable item grid, optimistic claims, un-claim.
- Emergent sharing (co-tap → equal split); live presence + unclaimed-items board.
- Tip entry (18/20/22%/custom), proportional vs even tip; **grand-total == printed-total guard**.
- Reconciliation engine: proportional tax/tip + largest-remainder rounding, cent-exact.
- Unclaimed-items resolution (claim / host-assign / split remainder).
- Settlement: per-guest amount + Venmo/Cash App/PayPal deep link; Host settlement board with manual "mark paid."

**v1.0 (~week 10–12)** — the spec in full:
- Recurring-diner memory (names + payment handles), table preferences/defaults, lightweight meal history.
- Custom share ratios (the bottle-of-wine case); treated/comped diners; discounts (proportional or assigned); service-charge handling; post-hoc tip entry; tax-inclusive pricing.
- Automated nudges (opt-in SMS / web push) + "running tab" roll-forward.
- Reconnect/resume; Host final override; PWA install for Hosts; offline-tolerant guest state.
- Privacy controls (short retention, data minimization), analytics, hardening.

**Fast-follows (post-v1)** — explicitly deferred by the spec:
- Multiple payers + debt-minimization pass (fewest transfers).
- Optional in-app payments (introduces money-transmitter scope — separate legal/compliance track).
- Native Host app if web proves insufficient.

### 2.3 Out of scope for v1
Real money movement/custody; international payment rails beyond deep links; multi-currency conversion; accounts for guests; receipt-level fraud detection beyond the social "table is watching" mechanism.

---

## 3. Architecture & technology decisions

### 3.1 Topology

```
┌─────────────┐         ┌──────────────────────────────┐
│  Host (web  │  HTTPS   │   Next.js app (Vercel)       │
│  PWA)       │◄────────►│   - SSR/edge routes          │
└─────────────┘  WS      │   - API routes / RPC         │
                         │   - receipt-OCR orchestration │
┌─────────────┐  HTTPS   └───────────────┬──────────────┘
│ Guests (web │◄────────►                │
│ claim page) │  WS                      │ service-role
└─────────────┘                          ▼
                         ┌──────────────────────────────┐
                         │  Supabase                     │
                         │  - Postgres (source of truth) │
                         │  - Realtime (claims/presence) │
                         │  - Storage (receipt images)   │
                         │  - Auth (Host accounts only)  │
                         │  - Edge Functions (cron nudge)│
                         └───────────────┬──────────────┘
                                         │
                  ┌──────────────────────┼───────────────────────┐
                  ▼                      ▼                        ▼
          Vision LLM (Claude)     P2P deep links          Twilio (opt-in SMS)
          receipt→JSON            (no money custody)        nudges
```

### 3.2 Key decisions (with rationale and alternatives)

| Decision | Choice | Why | Alternatives considered |
|---|---|---|---|
| **App shell** | Single Next.js (TS) app, PWA, serving both Host and guest routes | One codebase; guest route is a lightweight public page; SSR keeps first-load fast for zero-install | Separate native Host app (more cost, slower; defer to fast-follow); two repos (more overhead) |
| **Backend / realtime** | Supabase (Postgres + Realtime) | Relational integrity matters for the cent-reconciliation invariant; Realtime gives presence + change feeds; Storage + Auth bundled; fast to build | Firebase (NoSQL hurts the relational reconciliation/transactions); custom Socket.io + Postgres (more infra to run); Ably/Pusher (realtime only, still need a DB) |
| **Receipt parsing** | Vision LLM (Claude, multimodal) emitting structured line-item JSON via a strict schema; manual fallback always available | Survives messy real receipts (abbreviations, multiples, modifiers) better than rigid OCR templates; one call returns structured data | Dedicated receipt-OCR SaaS (Veryfi/Mindee/Taggun) — strong but template-bound and another vendor; raw OCR + custom parser (brittle). **Design the parser behind an interface so the provider is swappable.** |
| **Payments** | Deep links into Venmo / Cash App / PayPal / Apple Cash / Zelle; Tally never touches money | Keeps v1 out of money-transmitter regulation; uses apps people already have | In-app payments (regulatory + PCI scope) — explicit fast-follow |
| **Nudges** | Opt-in SMS via Twilio + web push for installed PWAs; otherwise Host-tappable pre-written message | Guests have no account; SMS needs a phone number (friction), so make it optional and degrade gracefully | Email (guests have no account); push only (requires PWA install) |
| **Hosting** | Vercel (app) + Supabase (data) | Edge/SSR performance, simple CI/CD, generous free tiers for a young product | Single VPS (more ops); AWS from scratch (slower to ship) |
| **State authority** | Server-side session state in Postgres; clients optimistic then reconciled | Spec requires reconnect/resume; server is source of truth | Client-authoritative (loses state on disconnect) |

### 3.3 Why server-authoritative + optimistic UI
Each tap writes a claim to Postgres and broadcasts via Realtime; the tapping client updates instantly (optimistic) and rolls back on failure. This gives the "ten seconds, not five minutes" feel while keeping a single source of truth that survives a dropped connection (spec edge case: "guest loses connection mid-claim").

---

## 4. Data model

Postgres schema (names illustrative). Money stored as **integer cents** everywhere — never floats — to keep reconciliation exact.

```sql
-- Durable, tied to a Host account
host_account     (id, auth_user_id, display_name, default_tip_pct,
                  default_tip_mode, created_at)

saved_diner      (id, host_account_id, name, color,
                  preferred_method,            -- venmo|cashapp|paypal|applecash|zelle
                  handles jsonb,               -- { venmo:'@x', cashapp:'$y', ... }
                  running_tab_cents,           -- optional rolling balance
                  last_seen_at)

-- One meal
session          (id, host_account_id, join_code UNIQUE, status,  -- open|claiming|reconciling|settling|closed
                  receipt_image_path,
                  subtotal_cents, tax_cents, service_charge_cents,
                  tip_cents, tip_mode,         -- proportional|even
                  discount_cents, discount_mode,
                  printed_total_cents, tax_inclusive bool,
                  created_at, closed_at)

line_item        (id, session_id, name, qty, unit_price_cents,
                  total_price_cents, status,   -- unclaimed|claimed|assigned|comped
                  sort_order)

-- Ephemeral per-session identity (no account)
participant      (id, session_id, saved_diner_id NULL, display_name,
                  color, is_treated bool, is_host_proxy bool,
                  joined_at, last_active_at)

claim            (id, line_item_id, participant_id, weight INT DEFAULT 1,
                  created_at)
                  -- equal split = equal weights; custom ratio = differing weights

settlement       (id, session_id, participant_id, amount_owed_cents,
                  status,                      -- pending|paid|rolled_to_tab|comped
                  payment_method, payment_link, paid_at, nudged_at)

meal_history     (id, host_account_id, session_id, summary jsonb, dined_at)
```

Notes:
- `claim.weight` makes "emergent equal split" the default (all weight 1) and "custom ratio" a non-special case (different weights).
- Row-Level Security: guests get a scoped, capability-style token (the join code grants read on the session and write on their own participant/claims only). Hosts authenticate normally and own their sessions.
- `printed_total_cents` is captured from the receipt so the **grand-total guard** (§5.3) has something to assert against.

---

## 5. The reconciliation engine (the trust anchor)

This is the most correctness-critical module. It is a **pure, deterministic function** (no I/O, no clock, no randomness) so it can be exhaustively unit- and property-tested, and it runs identically on server (authoritative) and client (preview).

### 5.1 Inputs / outputs

```
compute(session, lineItems, participants, claims) -> {
  perParticipant: [{ participantId,
                     claimedSubtotalCents, taxCents, tipCents,
                     serviceCents, discountCents, totalCents }],
  unclaimedCents,
  grandTotalCents
}
```

### 5.2 Algorithm

1. **Per-item share.** For each `line_item`, sum the weights of its claims. Each claimer's share of that item = `item.total_price_cents * weight / sumWeights`, computed in rationals (keep numerator/denominator or use a big-rational), **not** rounded yet.
2. **Claimed subtotal** per participant = Σ their item shares.
3. **Unclaimed** = Σ items with no claims. Engine surfaces this; the session **cannot close** while `unclaimedCents > 0` unless explicitly resolved (claim / assign / split-even — §6, Phase 4).
4. **Tax** allocated proportionally: `participant.tax = tax_cents * claimedSubtotal / totalClaimedSubtotal`.
5. **Tip / service charge**:
   - proportional → same proportional formula as tax;
   - even → `tip_cents / participantCount` (heads, excluding treated diners).
6. **Discounts**: proportional (like tax) or assigned to a specific participant (subtracts from theirs only).
7. **Treated diners**: their claimed items redistribute across the rest (re-run allocation excluding them from the payer set; their share goes to 0).
8. **Round once, at the end, deterministically.** Each participant total is a rational; floor each to cents, then distribute the leftover cents using the **largest-remainder method**, ties broken by a stable key (participant id) so the result is reproducible. This guarantees `Σ totalCents == grandTotalCents` exactly.

### 5.3 Invariants (asserted in code + tested)
- **I1 — Conservation:** `Σ perParticipant.totalCents == session.printed_total_cents` (when fully claimed). The single most important test.
- **I2 — Component conservation:** Σ tax shares == tax_cents; Σ tip shares == tip_cents; etc.
- **I3 — Non-negativity:** no participant total < 0 (discounts can't overshoot a share).
- **I4 — Grand-total guard:** before a session leaves "open," assert `subtotal + tax + service + tip - discount == printed_total` (within 0 cents). If not, Host is prompted to fix (spec Phase 2).
- **I5 — Determinism:** same inputs → byte-identical outputs (no float, no map-iteration-order dependence).

### 5.4 Worked example (rounding remainder)
Three friends share $10.00 fries equally (weights 1/1/1). Raw share = 333.33¢ each → floor to 333¢ → Σ = 999¢, **1¢ short**. Largest-remainder: all fractional remainders equal (.33), tie broken by participant id → the first participant absorbs the extra cent → 334/333/333 = **1000¢**. Everyone sees a clean number; the table still sums to exactly $10.00. Generalizes to tax/tip proportions, which produce far messier fractions.

### 5.5 Implementation guidance
- Use integer cents + rational arithmetic (e.g., a small `bigint` numerator/denominator helper, or a vetted rational lib). Avoid floating point entirely.
- The engine ships as a standalone TS package (`/packages/reconcile`) imported by both client and server so previews and the authoritative total can never disagree.
- Property-based tests (fast-check): for random receipts/claims, assert I1–I5 hold across thousands of generated cases.

---

## 6. Milestone plan (mapped to spec phases)

Each milestone lists scope, key tasks, dependencies, and **exit criteria** (its Definition of Done).

### M0 — Foundations (week 1)
- Repo scaffold (Next.js + TS, ESLint/Prettier, strict tsconfig), monorepo with `/packages/reconcile`.
- Supabase project, schema migration v1 (§4), RLS policies, seed script.
- CI (typecheck, lint, unit tests), preview deploys on Vercel, environment/secret management.
- SessionStart hook so web sessions can run tests/lint (see repo tooling).
- **Exit:** green CI; a migration applies cleanly; a smoke test hits the DB and Realtime channel.

### M1 — Reconciliation engine (week 1–2) · *Spec Phase 4*
- Implement `compute()` (§5) with rational math + largest-remainder rounding.
- Invariants I1–I5; unit + property tests; worked-example fixtures.
- **Exit:** 100% of invariant tests pass; property tests run ≥10k cases with zero violations; engine has no I/O imports.

### M2 — Receipt digitization (week 2–4) · *Spec Phase 1*
- `ReceiptParser` interface; Claude vision implementation emitting strict JSON (name, qty, unit/total price, subtotal, tax, service, total).
- Image capture/upload (camera + file), Storage upload, orientation/size handling.
- **Verification screen**: editable list — fix misreads, merge/split lines, edit prices, confirm subtotal; manual quick-add; "even split for the table" fallback.
- Normalization helpers ("AVO TST"→"Avocado toast", "2 × Latte"→qty 2).
- **Exit:** on a test corpus of ≥30 real receipts, parser produces an editable list the Host can correct to a correct subtotal in <60s; fallback path works when parsing fails.

### M3 — Sessions: create & join (week 3–4) · *Spec Phase 2*
- Session creation: tip entry (18/20/22%/custom %, flat), tip-mode toggle, **grand-total guard (I4)**.
- Join code generator (short, unambiguous charset, collision-checked), QR generation, shareable link.
- Guest landing: confirm name + pick color → ephemeral participant; capability token via join code; RLS scoping.
- Pre-seed names/methods if the Host has saved diners (depends on M8 data; degrade gracefully if absent).
- **Exit:** Host creates a session that refuses to open unless totals reconcile; two devices join via QR and link and appear as participants.

### M4 — Parallel claiming + presence (week 4–5) · *Spec Phase 3 (the core)*
- Tappable item grid; tap = claim, re-tap = un-claim (optimistic + server reconcile).
- **Emergent sharing**: co-tap → equal split via equal weights; per-claimer live running total.
- **Live board** (Realtime): who joined, who's still claiming, per-item claim status, and **highlighted unclaimed items**.
- Reconnect/resume from server state (spec edge case).
- **Exit:** 5 simulated clients claim concurrently; board updates <300ms p95; un-claim works; a refreshed/reconnected client recovers exact state; unclaimed items are unmistakably visible.

### M5 — Live totals + fairness integration (week 5–6) · *Spec Phase 4*
- Wire M1 engine to live claims; each participant sees their items + proportional tax/tip tick up.
- Unclaimed-resolution UX: someone claims / Host assigns / split remainder evenly.
- Treated-diner toggle; custom ratio editor (weights); service-charge-as-tip; discounts (proportional/assigned); post-hoc tip edit with recompute.
- **Exit:** with mixed shares + tax + tip + a discount, on-screen totals are cent-exact (I1) and update live; session cannot close while anything is unclaimed/unresolved.

### M6 — Settlement (week 6–7) · *Spec Phase 5 (the lingering part)*
- Per-guest final amount + **one-tap payment link** (amount + memo prefilled) into Venmo/Cash App/PayPal; degrade gracefully for Apple Cash/Zelle (no universal deep link → show handle + copy-amount).
- Host **settlement board**: paid vs pending; manual "mark paid"; guest "I paid" → board clears, Host notified.
- Star debt structure (everyone owes Host).
- **Exit:** each guest gets a correct deep link that opens the right app prefilled; Host board reflects status changes in real time.

### M7 — Nudges & running tab (week 7–8) · *Spec Phase 5 cont.*
- Supabase Edge Function (scheduled) checks pending balances; opt-in SMS via Twilio / web push; soft, tasteful copy; throttled (one gentle nudge that evening/next morning).
- Optional **running-tab roll-forward** for recurring diners instead of chasing.
- **Exit:** a pending balance triggers exactly one scheduled nudge through the chosen channel; roll-forward updates `saved_diner.running_tab_cents` and skips the nudge.

### M8 — Memory & closure (week 8–9) · *Spec Phase 6*
- Save diners (name + handle, no guest account) against the Host; learn table defaults (tip %, mode, split style).
- Lightweight meal history; pre-population on next session (feeds M3).
- **Exit:** hosting the same crew again pre-fills names + payment links; defaults reflect the table's learned habits; history list renders.

### M9 — Edge-case hardening + polish (week 9–11)
- Walk the entire §7-spec edge-case matrix below; PWA polish (installability, offline-tolerant guest state, fast first paint); accessibility; empty/error states; load test for concurrent claiming.
- **Exit:** every edge case in §8 has a passing test or a demonstrated manual behavior; Lighthouse PWA + performance budgets met; a 10-person concurrent session stays cent-exact and responsive.

### M10 — Privacy, observability, launch (week 11–12)
- Data minimization + short retention jobs (purge ephemeral guest data after closure window); privacy copy; security review (RLS, token scope, secret handling).
- Analytics + funnel metrics (§12); error monitoring (Sentry); structured logs.
- **Exit:** security review passed; retention job verified; dashboards live; v1.0 tagged.

### Fast-follows (post-v1)
- **F1** Multiple payers + **debt-minimization** pass (min transfers) — turns the star graph into a general settlement graph; needs its own algorithm + tests.
- **F2** Optional in-app payments — separate compliance/legal track (money-transmitter, PCI).
- **F3** Native Host app if web ceilings are hit.

---

## 7. Critical path, sequencing & timeline

**Critical path:** M0 → M1 (engine) → M4/M5 (realtime claiming + live totals) → M6 (settlement). OCR (M2) and memory (M8) are parallelizable and not on the spine.

```
Week:        1    2    3    4    5    6    7    8    9   10   11   12
Foundations [M0 ]
Engine          [M1   ]
OCR                 [M2        ]
Sessions             [M3   ]
Claiming                   [M4  ]
Live totals                   [M5  ]
Settlement                         [M6 ]
Nudges/tab                             [M7 ]
Memory                                     [M8 ]
Hardening                                      [M9      ]
Privacy/launch                                      [M10    ]
  ▲ walking skeleton ~end of wk3   ▲ MVP demoable ~wk5      ▲ v1.0 ~wk12
```

- **2-engineer split:** Eng A owns the spine (M1 → M4 → M5 → M6); Eng B owns OCR (M2), sessions/join (M3), memory (M8), nudges (M7). Converge for M9/M10.
- **Solo:** same order, ~1.6–1.8× wall-clock (~16–20 weeks); cut M7 running-tab and custom-ratio to post-MVP if needed.

---

## 8. Edge-case implementation matrix

Every spec edge case mapped to an implementation and its owning milestone.

| Edge case | Handling | Milestone |
|---|---|---|
| Receipt won't OCR | Manual quick-add or even-split fallback on verify screen | M2 |
| Item nobody claims | Highlighted on board; resolve by claim / host-assign / split-even; **blocks close** | M4/M5 |
| No smartphone / left early | Host adds a proxy participant (`is_host_proxy`), claims for them, texts a link | M4/M6 |
| Shared apps/bottles/platters | Emergent co-tap equal split; custom ratio (weights) for uneven | M4/M5 |
| Someone is treated | `is_treated` flag; their items redistribute across payers | M5 |
| Accidental claim | Un-tap before close; Host final override | M4/M5 |
| Tip added after card runs | Post-hoc tip entry → recompute totals | M5 |
| Tax-inclusive pricing | Parser reads subtotal/tax structure; `tax_inclusive` flag keeps proportional alloc valid | M2/M5 |
| Two cards / cash thrown in | Multi-payer + debt-minimization | **F1 (fast-follow)** |
| Guest loses connection | Server-authoritative state; rejoin via same link resumes | M3/M4 |
| Fractional cents | Largest-remainder rounding (I1) | M1 |

---

## 9. Testing & QA strategy

- **Unit + property tests** — reconciliation engine (§5); the bar is highest here (I1–I5, fast-check fuzzing).
- **OCR corpus regression** — a fixture set of ≥30 real/synthetic receipts (abbreviations, multiples, tax-inclusive, service charge, faded); track parse accuracy + "time-to-correct-subtotal."
- **Realtime/concurrency tests** — headless multi-client harness simulating N guests claiming/un-claiming simultaneously; assert convergence and cent-exactness under races.
- **E2E (Playwright)** — full journeys across Host + multiple guest browsers: digitize → open → parallel claim → reconcile → settle.
- **Resilience** — drop/restore a guest's connection mid-claim; assert resume.
- **Load** — 10+ concurrent participants; latency budget (board update <300ms p95) and engine correctness hold.
- **Accessibility + device matrix** — iOS Safari / Android Chrome (the real guest environment), tap targets, color-blind-safe participant colors.

---

## 10. Security & privacy

- **Guests never create accounts.** Identity is a name + color, ephemeral, scoped to one session.
- **Capability tokens:** the join code grants narrow RLS permissions — read the session, write only your own participant + claims. No cross-session access.
- **Data minimization + short retention:** purge ephemeral guest rows after a closure window (e.g., 7–30 days); only Host-saved diners persist (name + handle), and only with the Host's account.
- **No money custody** in v1 → out of money-transmitter scope; payment handles are stored, not card data → no PCI scope.
- **Secrets:** OCR/LLM keys and Twilio creds server-side only; never shipped to the guest bundle.
- **Receipt images:** private Storage bucket, signed URLs, deleted on the retention schedule.
- **Abuse/guard rails:** join-code rate limiting + collision-resistant generation; the social "table is watching" board is the primary anti-cheat, by design.

---

## 11. Observability & success metrics

- **Monitoring:** Sentry (errors), structured logs on session lifecycle + reconciliation asserts (alert on any I1 violation in prod — should be impossible), Realtime channel health.
- **Product funnel:** receipt-parse success rate, time-to-correct-subtotal, join rate per session, time-to-all-claimed, % sessions fully reconciled without manual override, settlement completion rate, time-to-settle.
- **North-star:** % of meals where the full loop finishes **before the card returns** (proxy: session open → all-claimed under ~2 min) and settlement-completion rate.

---

## 12. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| OCR accuracy on messy receipts | Erodes the "enter once" promise | Vision LLM + always-available manual edit + even-split fallback; verification screen is mandatory, not optional |
| Realtime races corrupt totals | Breaks the trust anchor | Server-authoritative writes; engine recomputes from DB state, not from client deltas; concurrency tests |
| Payment deep links inconsistent (Zelle/Apple Cash lack universal links) | Settlement friction | Deep-link the apps that support it; for others show handle + copy-amount + prefilled memo; remember per-diner method |
| Nudges feel spammy / need phone numbers | Damages the "warm goodbye" goal | Opt-in only, throttled, soft copy; degrade to Host-tappable message; web push for installed PWAs |
| Guest browser quirks (iOS Safari camera/PWA) | Friction at the table | Device matrix testing; progressive enhancement; the guest path needs no camera/PWA |
| Vendor lock-in (Supabase/LLM) | Long-term flexibility | Reconciliation engine is vendor-agnostic; `ReceiptParser` behind an interface; keep schema portable |
| Scope creep from rich edge cases | Slips MVP | Strict MVP cut line (§2.2); custom ratios/running-tab/multi-payer explicitly tiered |

---

## 13. Open decisions to confirm before/early in M0

1. **Host surface:** web PWA only for v1 (recommended) vs. also a native Host app? (Plan assumes web-only.)
2. **OCR provider:** vision LLM (recommended, flexible) vs. dedicated receipt-OCR SaaS (template-bound but tuned)? Interface lets us A/B.
3. **Nudge channel for v1:** SMS (needs phone numbers) vs. push-only (needs PWA install) vs. Host-tappable message only?
4. **Backend:** Supabase (recommended) vs. Firebase vs. custom WS — locks the data layer.
5. **Currency/locale for v1:** US-first (USD, post-card tip line) with tax-inclusive *parsing* supported, or broader from day one?

Recommended defaults are baked into this plan; these are the decisions most worth confirming because they're expensive to reverse.

---

## 14. Definition of done (v1.0)

- All five non-negotiables demonstrably hold in an end-to-end run.
- Reconciliation invariants I1–I5 pass in CI, including property tests.
- The full journey (digitize → open → parallel claim → reconcile → settle → nudge) works across a Host browser + ≥3 guest browsers, cent-exact.
- Every edge case in §8 (excluding fast-follows) has a passing test or demonstrated behavior.
- Security review passed; retention jobs verified; monitoring + funnel dashboards live.
- A 10-person concurrent session stays responsive and cent-exact.
