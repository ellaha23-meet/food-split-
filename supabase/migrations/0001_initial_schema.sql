-- Migration 0001: Initial Tally schema
-- All money columns are INTEGER (cents) — G1: no floats anywhere.
-- RLS is enabled on every table — G9.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- Tables
-- ============================================================

-- Durable host identity (one row per authenticated user who has hosted)
create table host_account (
  id                  uuid primary key default gen_random_uuid(),
  auth_user_id        uuid not null unique references auth.users(id) on delete cascade,
  display_name        text not null,
  default_tip_pct     integer not null default 20,        -- percentage, e.g. 20 = 20%
  default_tip_mode    text not null default 'proportional'
                        check (default_tip_mode in ('proportional', 'even')),
  created_at          timestamptz not null default now()
);

-- Recurring guests the Host remembers (name + payment handles)
create table saved_diner (
  id                  uuid primary key default gen_random_uuid(),
  host_account_id     uuid not null references host_account(id) on delete cascade,
  name                text not null,
  color               text not null,
  preferred_method    text not null default 'venmo'
                        check (preferred_method in ('venmo','cashapp','paypal','applecash','zelle')),
  handles             jsonb not null default '{}',        -- { venmo: '@x', cashapp: '$y', ... }
  running_tab_cents   integer not null default 0,         -- G1: integer cents
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now()
);

-- One meal / bill-splitting session
create table session (
  id                    uuid primary key default gen_random_uuid(),
  host_account_id       uuid not null references host_account(id) on delete cascade,
  join_code             text not null unique,
  status                text not null default 'open'
                          check (status in ('open','claiming','reconciling','settling','closed')),
  receipt_image_path    text,
  subtotal_cents        integer not null default 0,         -- G1
  tax_cents             integer not null default 0,         -- G1
  service_charge_cents  integer not null default 0,         -- G1
  tip_cents             integer not null default 0,         -- G1
  tip_mode              text not null default 'proportional'
                          check (tip_mode in ('proportional', 'even')),
  discount_cents        integer not null default 0,         -- G1
  discount_mode         text not null default 'proportional'
                          check (discount_mode in ('proportional', 'assigned')),
  printed_total_cents   integer not null default 0,         -- G1; grand-total guard (I4) asserts against this
  tax_inclusive         boolean not null default false,
  created_at            timestamptz not null default now(),
  closed_at             timestamptz
);

-- Receipt line items
create table line_item (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references session(id) on delete cascade,
  name              text not null,
  qty               integer not null default 1,
  unit_price_cents  integer not null,                     -- G1
  total_price_cents integer not null,                     -- G1; = qty * unit_price_cents
  status            text not null default 'unclaimed'
                      check (status in ('unclaimed','claimed','assigned','comped')),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

-- Ephemeral per-session guest identity (no account, scoped to one session)
create table participant (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references session(id) on delete cascade,
  saved_diner_id  uuid references saved_diner(id) on delete set null,
  display_name    text not null,
  color           text not null,
  is_treated      boolean not null default false,
  is_host_proxy   boolean not null default false,
  joined_at       timestamptz not null default now(),
  last_active_at  timestamptz not null default now()
);

-- Claims: participant X claims item Y with weight W
-- Equal split = all weights 1 (no special case — G1/G2 constraint)
create table claim (
  id              uuid primary key default gen_random_uuid(),
  line_item_id    uuid not null references line_item(id) on delete cascade,
  participant_id  uuid not null references participant(id) on delete cascade,
  weight          integer not null default 1 check (weight > 0),
  created_at      timestamptz not null default now(),
  unique (line_item_id, participant_id)
);

-- Per-guest settlement record
create table settlement (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references session(id) on delete cascade,
  participant_id      uuid not null references participant(id) on delete cascade,
  amount_owed_cents   integer not null,                   -- G1; engine output
  status              text not null default 'pending'
                        check (status in ('pending','paid','rolled_to_tab','comped')),
  payment_method      text,
  payment_link        text,
  paid_at             timestamptz,
  nudged_at           timestamptz,
  created_at          timestamptz not null default now(),
  unique (session_id, participant_id)
);

-- Lightweight meal history (Host-owned summaries)
create table meal_history (
  id              uuid primary key default gen_random_uuid(),
  host_account_id uuid not null references host_account(id) on delete cascade,
  session_id      uuid references session(id) on delete set null,
  summary         jsonb not null default '{}',
  dined_at        timestamptz not null default now()
);

-- ============================================================
-- Constraints: money columns must be integer (G1 schema lint)
-- ============================================================
-- Verified by column type definition above (all INTEGER).
-- A test in packages/reconcile will assert no money column is NUMERIC or FLOAT.

-- ============================================================
-- Indexes
-- ============================================================
create index on session(host_account_id);
create index on session(join_code);
create index on line_item(session_id);
create index on participant(session_id);
create index on claim(line_item_id);
create index on claim(participant_id);
create index on settlement(session_id);
create index on saved_diner(host_account_id);

-- ============================================================
-- Row-Level Security (G9: every table, narrowest access)
-- ============================================================
alter table host_account      enable row level security;
alter table saved_diner       enable row level security;
alter table session           enable row level security;
alter table line_item         enable row level security;
alter table participant       enable row level security;
alter table claim             enable row level security;
alter table settlement        enable row level security;
alter table meal_history      enable row level security;

-- ────────────────────────────────────────────────────────────
-- host_account: only the owning user
-- ────────────────────────────────────────────────────────────
create policy "host_account: own row only"
  on host_account for all
  using (auth_user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- saved_diner: only the owning host
-- ────────────────────────────────────────────────────────────
create policy "saved_diner: host owns"
  on saved_diner for all
  using (
    host_account_id in (
      select id from host_account where auth_user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- session: host full access; guest read via join_code claim
-- The guest token (JWT custom claim) carries: role=guest, session_id=<uuid>
-- ────────────────────────────────────────────────────────────
create policy "session: host full access"
  on session for all
  using (
    host_account_id in (
      select id from host_account where auth_user_id = auth.uid()
    )
  );

create policy "session: guest read own session"
  on session for select
  using (
    id::text = (auth.jwt() -> 'app_metadata' ->> 'session_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  );

-- ────────────────────────────────────────────────────────────
-- line_item: host full access; guest read items in their session
-- ────────────────────────────────────────────────────────────
create policy "line_item: host full access"
  on line_item for all
  using (
    session_id in (
      select s.id from session s
      join host_account h on h.id = s.host_account_id
      where h.auth_user_id = auth.uid()
    )
  );

create policy "line_item: guest read own session"
  on line_item for select
  using (
    session_id::text = (auth.jwt() -> 'app_metadata' ->> 'session_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  );

-- ────────────────────────────────────────────────────────────
-- participant: host full; guest read all in session, write own row
-- ────────────────────────────────────────────────────────────
create policy "participant: host full access"
  on participant for all
  using (
    session_id in (
      select s.id from session s
      join host_account h on h.id = s.host_account_id
      where h.auth_user_id = auth.uid()
    )
  );

create policy "participant: guest read session participants"
  on participant for select
  using (
    session_id::text = (auth.jwt() -> 'app_metadata' ->> 'session_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  );

create policy "participant: guest write own row"
  on participant for insert
  with check (
    session_id::text = (auth.jwt() -> 'app_metadata' ->> 'session_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
    and id::text = (auth.jwt() -> 'app_metadata' ->> 'participant_id')
  );

create policy "participant: guest update own row"
  on participant for update
  using (
    id::text = (auth.jwt() -> 'app_metadata' ->> 'participant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  );

-- ────────────────────────────────────────────────────────────
-- claim: host full; guest read all in session, write own claims only
-- ────────────────────────────────────────────────────────────
create policy "claim: host full access"
  on claim for all
  using (
    participant_id in (
      select p.id from participant p
      join session s on s.id = p.session_id
      join host_account h on h.id = s.host_account_id
      where h.auth_user_id = auth.uid()
    )
  );

create policy "claim: guest read session claims"
  on claim for select
  using (
    participant_id in (
      select id from participant
      where session_id::text = (auth.jwt() -> 'app_metadata' ->> 'session_id')
    )
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  );

create policy "claim: guest write own claims only"
  on claim for insert
  with check (
    participant_id::text = (auth.jwt() -> 'app_metadata' ->> 'participant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  );

create policy "claim: guest delete own claims only"
  on claim for delete
  using (
    participant_id::text = (auth.jwt() -> 'app_metadata' ->> 'participant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  );

-- ────────────────────────────────────────────────────────────
-- settlement: host full; guest read own settlement row
-- ────────────────────────────────────────────────────────────
create policy "settlement: host full access"
  on settlement for all
  using (
    session_id in (
      select s.id from session s
      join host_account h on h.id = s.host_account_id
      where h.auth_user_id = auth.uid()
    )
  );

create policy "settlement: guest read own row"
  on settlement for select
  using (
    participant_id::text = (auth.jwt() -> 'app_metadata' ->> 'participant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  );

create policy "settlement: guest update own status"
  on settlement for update
  using (
    participant_id::text = (auth.jwt() -> 'app_metadata' ->> 'participant_id')
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'guest'
  )
  with check (
    -- guests may only flip to 'paid', nothing else
    status = 'paid'
  );

-- ────────────────────────────────────────────────────────────
-- meal_history: host only
-- ────────────────────────────────────────────────────────────
create policy "meal_history: host owns"
  on meal_history for all
  using (
    host_account_id in (
      select id from host_account where auth_user_id = auth.uid()
    )
  );
