# Tally — Phased Build with Strict Constraints

*Companion to `EXECUTION_PLAN.md`. That document gives the architecture and milestones; this one decomposes the work into small, independently-verifiable phases and binds each (and the project as a whole) to **strict constraints** that may not be violated to move faster.*

---

## How to read this

Every phase is a **contract** with the same fields:

- **Goal** — one sentence; the single concern of the phase.
- **Depends on** — phases that must be `DONE` first.
- **In scope** — exactly what gets built.
- **Out of scope (strict)** — explicitly deferred; building it here is a constraint violation.
- **Constraints** — hard rules. Binary. Non-negotiable.
- **Exit criteria** — binary, testable checks. All must be green to mark the phase `DONE`.
- **Size** — target effort. A phase that grows past its size is split, not stretched.

A phase is either `NOT STARTED`, `IN PROGRESS`, or `DONE`. There is no "mostly done."

---

## Global strict constraints (apply to *every* phase)

These are project-wide invariants. A change that breaks any of them does not merge — full stop.

- **G1 — Money is integer cents.** No floating-point money anywhere, in any layer. Display formatting is the only place cents become a decimal string.
- **G2 — The reconciliation engine is pure.** `/packages/reconcile` has zero I/O, zero clock, zero randomness, zero framework imports. It is a deterministic function of its inputs. Violation = the trust anchor is untestable.
- **G3 — Server is the source of truth.** Clients are optimistic but never authoritative. Totals shown to anyone are recomputed from persisted state, never from client-side deltas.
- **G4 — The guest path needs nothing.** No install, no account, no camera, no permission prompt to *claim*. If a guest feature requires any of these, it is not on the guest path.
- **G5 — Phase gate is mandatory.** No phase begins until its dependencies are `DONE`. No phase is `DONE` until it passes the Phase Gate (below).
- **G6 — Secrets stay server-side.** No OCR/LLM/Twilio/Supabase service keys in any client bundle. Enforced by a build-time check.
- **G7 — Small and revertible.** One concern per phase, target ≤ 2–3 days, single PR, independently revertible. WIP limit: one in-progress phase per engineer.
- **G8 — No money-path TODOs.** Code in the reconciliation, claim, or settlement paths ships with zero `TODO`/`FIXME`/skipped tests. Stub elsewhere, never there.
- **G9 — Capability-scoped guest access.** A join code grants read on its session and write only on the holder's own participant + claims. No phase may widen this.

---

## Phase Gate (the strict "DONE" checklist)

A phase is `DONE` only when **all** of these are true:

1. CI green: typecheck + lint + unit/property tests, zero skips in money-path code.
2. Every Exit criterion in the phase contract is demonstrably met.
3. No Global Constraint (G1–G9) regressed (CI guards enforce G1, G2, G6 mechanically).
4. The phase's slice is demoable or has an automated test proving the behavior.
5. Out-of-scope items did not leak in.

---

## Phase map (ordering & gates)

```
P0 Foundations ─► P1 Engine ─► P2 Realtime spine (WALKING SKELETON gate)
                                   │
                                   ├─► P3 Claiming UX
                                   ├─► P4 Receipt digitization   (parallelizable)
                                   ▼
                          P5 Tip & live totals ─► P6 Settlement   (MVP gate)
                                   │
                                   ├─► P7 Advanced fairness
                                   ├─► P8 Nudges & running tab
                                   ├─► P9 Memory
                                   ▼
                          P10 Hardening ─► P11 Privacy & launch    (v1.0 gate)
                                   │
                                   ▼
                          F1 Multi-payer / debt-min   (fast-follow)
```

**Critical path:** P0 → P1 → P2 → P5 → P6. P4 (OCR) and P9 (memory) are off-spine and run in parallel.

---

# PHASE 0 — Foundations

### P0.1 Repo scaffold & tooling
- **Goal:** A monorepo that typechecks, lints, and runs an empty test suite in CI.
- **Depends on:** —
- **In scope:** Next.js + TS app shell; `/packages/reconcile` empty package; ESLint/Prettier; strict `tsconfig`; test runner (Vitest); `SessionStart` hook so web sessions can run tests/lint.
- **Out of scope (strict):** Any feature code, any UI beyond a placeholder route.
- **Constraints:** `strict: true` in tsconfig from commit one. CI must fail on type error, lint error, or test failure.
- **Exit criteria:** `npm run typecheck|lint|test` all pass in CI on an empty project; preview deploy renders a placeholder page.
- **Size:** 0.5 day.

### P0.2 Schema & data layer
- **Goal:** Postgres schema v1 applied via migration, with RLS.
- **Depends on:** P0.1.
- **In scope:** Migration for all tables in `EXECUTION_PLAN.md §4`; RLS policies (Host owns sessions; capability-scoped guest access per G9); seed script.
- **Out of scope (strict):** App queries, ORMs beyond a thin typed client.
- **Constraints:** All money columns are `integer` (cents) — enforced by a schema lint test (G1). RLS enabled on every table; **no table ships with RLS off**.
- **Exit criteria:** Migration applies cleanly to a fresh DB and rolls back; a test proves a guest token cannot read another session; money-column type test passes.
- **Size:** 1 day.

### P0.3 CI/CD & secrets
- **Goal:** Push-to-preview pipeline with server-only secrets.
- **Depends on:** P0.1.
- **In scope:** Vercel preview deploys; secret management; a build-time check that fails if a server-only env var name appears in the client bundle (G6).
- **Out of scope (strict):** Production domain, monitoring (P11).
- **Constraints:** The secret-leak check is a CI gate, not a warning.
- **Exit criteria:** A PR produces a preview URL; an intentional secret-in-client test build fails CI.
- **Size:** 0.5 day.

---

# PHASE 1 — Reconciliation engine (the spine)

> The whole product's trust depends on this package. It is built and fully tested **before any UI consumes it**.

### P1.1 Money & rational primitives
- **Goal:** Cent-and-rational arithmetic with no floats.
- **Depends on:** P0.1.
- **In scope:** Integer-cent type; rational helper (bigint numerator/denominator) for intermediate shares; format-for-display helper.
- **Out of scope (strict):** Any allocation logic.
- **Constraints:** G2 (pure). A lint/test rule bans the JS `number` type for money values and bans `/` on money outside the rational helper.
- **Exit criteria:** Unit tests cover add/sub/scale/compare and rational→cents; zero float usage proven by a static check.
- **Size:** 0.5 day.

### P1.2 Per-item shares & claimed subtotal
- **Goal:** Given items + weighted claims, compute each participant's claimed subtotal as exact rationals.
- **Depends on:** P1.1.
- **In scope:** Weight-based item splitting; unclaimed detection; per-participant subtotal as rationals (unrounded).
- **Out of scope (strict):** Tax, tip, rounding.
- **Constraints:** G2. Equal split = equal weights (no special case). Output is exact (unrounded) rationals only.
- **Exit criteria:** Tests for solo, equal-share, weighted-share, and fully-unclaimed cases; `unclaimedCents` correct.
- **Size:** 1 day.

### P1.3 Tax / tip / service / discount allocation
- **Goal:** Allocate tax, tip, service charge, and discounts onto participants.
- **Depends on:** P1.2.
- **In scope:** Proportional tax; proportional-or-even tip/service; proportional-or-assigned discount; treated-diner redistribution (share → 0, payer set excludes them).
- **Out of scope (strict):** Rounding, persistence, UI.
- **Constraints:** G2. Component conservation must hold in rationals before rounding (I2). No negative participant totals (I3).
- **Exit criteria:** Tests for each mode (proportional vs even tip, proportional vs assigned discount, treated diner) verify component sums equal inputs exactly.
- **Size:** 1.5 days.

### P1.4 Largest-remainder rounding & invariants
- **Goal:** Round once, deterministically, so totals sum to the exact charged amount.
- **Depends on:** P1.3.
- **In scope:** Floor-to-cents + largest-remainder distribution; stable tie-break by participant id; invariant assertions I1–I5.
- **Out of scope (strict):** Anything stateful.
- **Constraints:** G2. Rounding happens **exactly once, at the end**. Identical inputs → byte-identical output (I5). I1 (Σ == printed total) asserted in code.
- **Exit criteria:** The §5.4 worked example passes; I1–I5 unit tests pass; a re-run produces identical bytes.
- **Size:** 1 day.

### P1.5 Property-based test suite
- **Goal:** Prove invariants hold across generated chaos.
- **Depends on:** P1.4.
- **In scope:** fast-check generators for random receipts/claims/modes; assert I1–I5 over ≥10k cases; fixture corpus of hand-built tricky cases.
- **Out of scope (strict):** Performance tuning.
- **Constraints:** Zero invariant violations tolerated; a single counterexample blocks the gate.
- **Exit criteria:** ≥10k generated cases pass with zero violations; suite runs in CI.
- **Size:** 1 day.

> **GATE — Engine complete.** No UI may import `reconcile` until P1.5 is `DONE`.

---

# PHASE 2 — Realtime spine (walking skeleton)

> Proves the realtime + reconciliation spine end-to-end with fakes. Ugly is allowed; broken is not.

### P2.1 Session creation (hard-coded items)
- **Goal:** Create a session row from a fixed item list.
- **Depends on:** P0.2, P1.5.
- **In scope:** Create session + line items server-side; status lifecycle (`open`).
- **Out of scope (strict):** OCR, tip UI, styling.
- **Constraints:** G3 (server creates state). Money stays integer cents end-to-end.
- **Exit criteria:** Calling create yields a persisted session + items readable via the typed client.
- **Size:** 0.5 day.

### P2.2 Join code, QR & link
- **Goal:** A short, collision-checked join code with QR + shareable URL.
- **Depends on:** P2.1.
- **In scope:** Unambiguous-charset code generator with collision check; QR + link generation; capability token minting.
- **Out of scope (strict):** Pretty landing page.
- **Constraints:** Codes are collision-checked on insert; rate-limited generation. Token scope obeys G9.
- **Exit criteria:** Generated code resolves to its session; a token cannot access a different session (test).
- **Size:** 0.5 day.

### P2.3 Guest landing & ephemeral identity
- **Goal:** A guest opens the link, sets name + color, becomes a participant.
- **Depends on:** P2.2.
- **In scope:** Public route; name + color picker; ephemeral `participant` row; no auth.
- **Out of scope (strict):** Saved-diner pre-seed (P9), styling polish.
- **Constraints:** G4 (no install/account/camera). Participant is session-scoped and ephemeral.
- **Exit criteria:** Two browsers join the same code and both persist as participants.
- **Size:** 0.5 day.

### P2.4 Realtime claim write + broadcast
- **Goal:** A claim written by one client appears on others via Realtime.
- **Depends on:** P2.3.
- **In scope:** Claim insert; Realtime channel subscription; recompute-on-change calls the engine server-side.
- **Out of scope (strict):** Optimistic UI, un-claim polish, presence board.
- **Constraints:** G3 — the broadcast total comes from the engine over persisted state, not from the emitting client.
- **Exit criteria:** Client A claims an item; Client B sees it and an updated, engine-computed total within the latency budget.
- **Size:** 1 day.

### P2.5 Skeleton integration
- **Goal:** End-to-end: create → two guests claim → cent-exact totals.
- **Depends on:** P2.4.
- **In scope:** Glue + a Playwright E2E across two browser contexts.
- **Out of scope (strict):** Everything cosmetic.
- **Constraints:** Totals must be cent-exact (I1) at the end of the E2E run.
- **Exit criteria:** E2E passes in CI; totals reconcile to the fixed receipt total.
- **Size:** 0.5 day.

> **GATE — Walking skeleton.** The spine is proven. Feature phases may now build on it.

---

# PHASE 3 — Claiming UX (the core experience)

### P3.1 Tappable grid + optimistic claim/un-claim
- **Goal:** Tap to claim, re-tap to un-claim, instantly.
- **Depends on:** P2.5.
- **In scope:** Item-card grid; optimistic update + server reconcile + rollback on failure; per-claimer running total.
- **Out of scope (strict):** Custom ratios (P7), presence board.
- **Constraints:** G3 — optimistic UI rolls back to server truth on conflict. Un-claim only allowed before session close.
- **Exit criteria:** Tap/un-tap feel instant; a forced server rejection rolls the UI back; running total matches engine.
- **Size:** 1.5 days.

### P3.2 Emergent sharing
- **Goal:** Co-tapped items split equally with no "share" mode.
- **Depends on:** P3.1.
- **In scope:** Multiple claims on one item → equal weights → equal split, reflected live for all claimers.
- **Out of scope (strict):** Uneven ratios (P7).
- **Constraints:** Equal split is the default and is expressed purely as equal weights (no special-casing).
- **Exit criteria:** Three clients tapping one item each see a 3-way split that sums exactly to the item price.
- **Size:** 0.5 day.

### P3.3 Presence board + unclaimed highlight
- **Goal:** The whole table sees who joined, who's claiming, and what's orphaned.
- **Depends on:** P3.2.
- **In scope:** Realtime presence; per-item claim status; **prominent unclaimed-item highlight** (the anti-cheat surface).
- **Out of scope (strict):** Settlement status (P6).
- **Constraints:** Unclaimed items must be unmistakably visible — this is the load-bearing honesty mechanism.
- **Exit criteria:** Board updates < 300ms p95 with 5 clients; unclaimed items are visually distinct; presence reflects join/leave.
- **Size:** 1 day.

### P3.4 Reconnect & resume
- **Goal:** A dropped guest rejoins and recovers exact state.
- **Depends on:** P3.3.
- **In scope:** Rehydrate participant + claims from server on reconnect (G3).
- **Out of scope (strict):** Offline editing/queueing.
- **Constraints:** No client-persisted authoritative state; server rehydration only.
- **Exit criteria:** Kill a client mid-claim, reopen the link → exact prior state restored (test).
- **Size:** 0.5 day.

---

# PHASE 4 — Receipt digitization (off-spine, parallelizable)

### P4.1 Capture & store
- **Goal:** Host captures/uploads a receipt image to private storage.
- **Depends on:** P0.2, P0.3.
- **In scope:** Camera + file input (Host only); orientation/size handling; private bucket + signed URL.
- **Out of scope (strict):** Parsing.
- **Constraints:** Images live in a private bucket; no public URLs. Camera is Host-only (G4 keeps guests camera-free).
- **Exit criteria:** An uploaded image is retrievable only via signed URL.
- **Size:** 1 day.

### P4.2 ReceiptParser interface + vision impl
- **Goal:** Image → strict structured line-item JSON.
- **Depends on:** P4.1.
- **In scope:** `ReceiptParser` interface; Claude vision implementation with a strict output schema (name, qty, unit/total price, subtotal, tax, service, total); name normalization helpers.
- **Out of scope (strict):** UI editing, fallback flow.
- **Constraints:** Provider sits behind the interface (swappable). LLM keys server-side (G6). Output validated against the schema; invalid output → typed failure, never a guess passed downstream.
- **Exit criteria:** On the test corpus, valid images yield schema-valid JSON; malformed output raises a typed parse failure.
- **Size:** 1.5 days.

### P4.3 Verification & edit screen
- **Goal:** Host corrects parsed items to a confirmed-correct list.
- **Depends on:** P4.2.
- **In scope:** Editable list; fix/merge/split lines; edit prices/qty; confirm subtotal matches.
- **Out of scope (strict):** Tip entry (P5).
- **Constraints:** This screen is **mandatory** — a session cannot proceed on unverified parse output. Subtotal must reconcile before continuing.
- **Exit criteria:** Host can correct a deliberately-misparsed receipt to a correct subtotal in < 60s (measured on corpus).
- **Size:** 1.5 days.

### P4.4 Manual add & even-split fallback
- **Goal:** A path that always works when OCR can't.
- **Depends on:** P4.3.
- **In scope:** Manual quick-add items; "even split for the table" fallback.
- **Out of scope (strict):** —
- **Constraints:** The fallback must be reachable from any parse failure; no dead ends.
- **Exit criteria:** With OCR forced to fail, the Host still reaches a valid, reconciling session.
- **Size:** 0.5 day.

---

# PHASE 5 — Tip & live totals

### P5.1 Tip entry, mode & grand-total guard
- **Goal:** Set tip, choose proportional/even, and refuse to open unless totals reconcile.
- **Depends on:** P4.3 (or P4.4), P1.5.
- **In scope:** 18/20/22%/custom (% or flat); proportional/even toggle; **I4 grand-total guard** blocking session open on mismatch.
- **Out of scope (strict):** Post-hoc tip edit (P7).
- **Constraints:** A session **cannot leave `open`** unless `subtotal + tax + service + tip − discount == printed_total` (I4). The guard is a hard block, not a warning.
- **Exit criteria:** A deliberately mismatched total is rejected with a fix prompt; a matched total proceeds.
- **Size:** 1 day.

### P5.2 Wire engine to live claims
- **Goal:** Every participant sees their items + proportional tax/tip tick up live.
- **Depends on:** P5.1, P3.3.
- **In scope:** Engine recompute on every claim change; live per-participant breakdown (items + tax + tip).
- **Out of scope (strict):** Discounts/treated (P7).
- **Constraints:** G3 — totals are engine output over server state. Cent-exact (I1) at every observed state.
- **Exit criteria:** With mixed shares + tax + tip, on-screen totals are cent-exact and update live for all clients.
- **Size:** 1 day.

### P5.3 Unclaimed-resolution UX
- **Goal:** A session can always reach "fully resolved."
- **Depends on:** P5.2.
- **In scope:** Resolve orphans by claim / Host-assign / split-remainder-evenly; session cannot close while anything is unresolved.
- **Out of scope (strict):** —
- **Constraints:** Close is **blocked** while `unclaimedCents > 0` and unresolved. No silent dropping of orphan amounts (would break I1).
- **Exit criteria:** Each resolution path closes the gap to a cent-exact total; close stays blocked until resolved.
- **Size:** 1 day.

---

# PHASE 6 — Settlement (MVP-completing)

### P6.1 Payment deep links
- **Goal:** Each guest gets a one-tap link prefilled with amount + memo.
- **Depends on:** P5.3.
- **In scope:** Venmo / Cash App / PayPal deep links (amount + memo); graceful degrade for Apple Cash / Zelle (handle + copy-amount).
- **Out of scope (strict):** In-app payments (F2), nudges (P8).
- **Constraints:** Tally never touches money (no custody) — keeps v1 out of money-transmitter scope. Link amount must equal the engine's per-participant total exactly.
- **Exit criteria:** Each supported app opens prefilled with the correct amount; unsupported apps show handle + exact copyable amount.
- **Size:** 1 day.

### P6.2 Settlement board & mark-paid
- **Goal:** Host sees paid vs pending in real time.
- **Depends on:** P6.1.
- **In scope:** Star-debt board (everyone owes Host); manual "mark paid"; guest "I paid" → board updates → Host notified.
- **Out of scope (strict):** Automated nudges (P8), running tab (P8).
- **Constraints:** G3 — settlement status is server state, broadcast via Realtime.
- **Exit criteria:** Status changes reflect across clients in real time; closure notifies the Host.
- **Size:** 1 day.

> **GATE — MVP (v0.1).** All five non-negotiables demonstrably hold end-to-end. Demoable.

---

# PHASE 7 — Advanced fairness

### P7.1 Custom share ratios
- **Goal:** The bottle-of-wine case — uneven shares.
- **Depends on:** P6.2.
- **In scope:** Per-claimer weight editor; equal remains default.
- **Constraints:** Implemented purely via `claim.weight`; no new code path in the engine. Cent-exact preserved (I1).
- **Exit criteria:** A 70/30 split sums exactly to the item price.
- **Size:** 0.5 day.

### P7.2 Treated diners & comped items
- **Goal:** Mark a person treated; redistribute their items.
- **Depends on:** P7.1.
- **In scope:** `is_treated` toggle; comped-item handling; redistribution across payers.
- **Constraints:** Treated participant total → exactly 0; redistribution preserves I1.
- **Exit criteria:** Marking a diner treated zeroes their total and the table still reconciles.
- **Size:** 0.5 day.

### P7.3 Discounts & service charge
- **Goal:** Discounts (proportional or assigned) and service-charge-as-tip.
- **Depends on:** P7.2.
- **In scope:** Discount mode UI; service charge treated like tip.
- **Constraints:** No participant total < 0 (I3); component conservation (I2).
- **Exit criteria:** Proportional and assigned discounts both reconcile; service charge allocates per chosen mode.
- **Size:** 0.5 day.

### P7.4 Post-hoc tip & tax-inclusive pricing
- **Goal:** Enter the real tip after the card runs; handle tax-inclusive receipts.
- **Depends on:** P7.3.
- **In scope:** Editable tip after open with full recompute; `tax_inclusive` parsing/allocation path.
- **Constraints:** Recompute re-runs the engine and re-asserts I1/I4. No drift across edits (I5).
- **Exit criteria:** Editing tip recomputes cent-exact; a tax-inclusive receipt allocates correctly.
- **Size:** 1 day.

---

# PHASE 8 — Nudges & running tab

### P8.1 Scheduled nudge engine
- **Goal:** One gentle, opt-in reminder for pending balances.
- **Depends on:** P6.2.
- **In scope:** Supabase Edge Function (scheduled); opt-in SMS (Twilio) / web push; soft copy; throttling.
- **Constraints:** **Exactly one** nudge per pending balance per window; opt-in only; degrades to a Host-tappable message if no channel. No nudge to paid/rolled balances.
- **Exit criteria:** A pending balance triggers exactly one nudge via the chosen channel; opted-out balances get none.
- **Size:** 1.5 days.

### P8.2 Running-tab roll-forward
- **Goal:** Optionally roll a small balance forward instead of chasing.
- **Depends on:** P8.1, P9.1.
- **In scope:** Roll a pending balance into `saved_diner.running_tab_cents`; suppress nudge.
- **Constraints:** Roll-forward is opt-in per diner; rolled amounts never double-count in a future session's I1.
- **Exit criteria:** Rolling forward updates the tab and suppresses the nudge; the next session reflects the carried balance correctly.
- **Size:** 0.5 day.

---

# PHASE 9 — Memory & closure

### P9.1 Saved diners & pre-seed
- **Goal:** Remember people (name + handle) against the Host; pre-fill next time.
- **Depends on:** P6.2.
- **In scope:** Save diner on settlement; pre-seed names + payment methods at session open (feeds P2.3 path).
- **Constraints:** Saved data lives only against the **Host** account; guests still create no account (G4).
- **Exit criteria:** Re-hosting the same crew pre-fills names + payment links.
- **Size:** 1 day.

### P9.2 Learned defaults & history
- **Goal:** Learn tip %, tip mode, split style; show a light meal history.
- **Depends on:** P9.1.
- **In scope:** Per-table defaulting; history list with summaries.
- **Constraints:** Defaults are suggestions, always overridable; history stores summaries, minimal PII.
- **Exit criteria:** Defaults reflect prior sessions; history renders past meals.
- **Size:** 1 day.

---

# PHASE 10 — Hardening

### P10.1 Edge-case sweep
- **Goal:** Every spec edge case has a test or demonstrated behavior.
- **Depends on:** P7–P9 as applicable.
- **In scope:** Walk `EXECUTION_PLAN.md §8` matrix; add tests; fill gaps (no-smartphone proxy, mistaken claim override, etc.).
- **Constraints:** No edge case closes without a test or a recorded manual verification.
- **Exit criteria:** Every non-fast-follow row in §8 is green.
- **Size:** 1.5 days.

### P10.2 Load & latency
- **Goal:** 10-person concurrent session stays responsive and cent-exact.
- **Depends on:** P10.1.
- **In scope:** Concurrency harness; latency budget verification (board < 300ms p95); engine correctness under races.
- **Constraints:** Cent-exactness (I1) must hold under concurrent claim/un-claim races.
- **Exit criteria:** Load test passes budgets with zero invariant violations.
- **Size:** 1 day.

### P10.3 PWA & device matrix
- **Goal:** Installable Host PWA; guest path solid on iOS Safari / Android Chrome.
- **Depends on:** P10.2.
- **In scope:** PWA manifest/install (Host); device-matrix pass; accessibility (tap targets, color-blind-safe colors).
- **Constraints:** Guest path still needs no install (G4); PWA install is Host-only convenience.
- **Exit criteria:** Lighthouse PWA + perf budgets met; guest flow verified on target devices.
- **Size:** 1 day.

---

# PHASE 11 — Privacy & launch

### P11.1 Retention & data minimization
- **Goal:** Ephemeral guest data is purged on schedule.
- **Depends on:** P10.3.
- **In scope:** Retention job purging ephemeral participant/claim/image rows after a closure window; privacy copy.
- **Constraints:** Only Host-saved diners persist; receipt images deleted on schedule; retention job is idempotent.
- **Exit criteria:** Job purges expired data in a test; nothing Host-owned is deleted.
- **Size:** 1 day.

### P11.2 Observability & security review
- **Goal:** Monitoring live; security review passed.
- **Depends on:** P11.1.
- **In scope:** Sentry; funnel metrics (`EXECUTION_PLAN.md §11`); alert on any prod I1 assertion failure; RLS + token-scope review; secret-handling review.
- **Constraints:** An I1 violation in prod pages immediately (should be impossible — defense in depth).
- **Exit criteria:** Dashboards live; security review checklist signed off.
- **Size:** 1 day.

> **GATE — v1.0.** Definition of Done in `EXECUTION_PLAN.md §14` met.

---

# FAST-FOLLOW (post-v1, separate track)

### F1 — Multiple payers & debt minimization
- **Goal:** Support 2+ payers and minimize transfers.
- **Depends on:** v1.0.
- **In scope:** Multi-payer model; debt-minimization algorithm (fewest transfers); its own test suite.
- **Constraints:** Generalizes the star graph; must preserve I1 across the full settlement graph.
- **Size:** ~1 week.

### F2 — Optional in-app payments
- **Goal:** Native payment handling.
- **Depends on:** v1.0; **legal/compliance track first** (money-transmitter, PCI).
- **Constraints:** Does not start until compliance scope is cleared. Out of engineering's hands until then.
- **Size:** TBD (gated on legal).

---

## Constraint summary (the short list to pin above the desk)

1. Money is integer cents. No floats. (G1)
2. The engine is pure; round once; identical inputs → identical bytes. (G2, I4/I5)
3. Server is truth; clients are optimistic, never authoritative. (G3)
4. Guests install nothing, sign up for nothing, grant no camera to claim. (G4)
5. A phase isn't done until the Phase Gate is fully green. (G5)
6. Secrets never reach the client. (G6)
7. One small concern per phase; revertible; WIP = 1. (G7)
8. No TODOs or skipped tests in money-path code. (G8)
9. Join codes grant the narrowest possible access. (G9)
10. Totals always sum to the exact amount charged — every visible state. (I1)
