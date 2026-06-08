-- Seed data for local development
-- Run after migration 0001.

-- Insert a test host account (requires auth.users row — use Supabase local auth or override)
-- This seed is intentionally minimal; real test data is created via the app or E2E tests.

-- Example: create a session with hard-coded items (used in P2.1 walking skeleton tests)
-- Uncomment and adapt for local dev:

/*
insert into host_account (id, auth_user_id, display_name)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000', -- replace with a real auth.users id
  'Dev Host'
);

insert into session (id, host_account_id, join_code, subtotal_cents, tax_cents, tip_cents, printed_total_cents)
values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'TEST01',
  1000,  -- $10.00
  90,    -- $0.90
  200,   -- $2.00
  1290   -- $12.90
);

insert into line_item (session_id, name, qty, unit_price_cents, total_price_cents, sort_order)
values
  ('00000000-0000-0000-0000-000000000002', 'Fries',  1, 500, 500,  1),
  ('00000000-0000-0000-0000-000000000002', 'Burger', 1, 500, 500, 2);
*/
