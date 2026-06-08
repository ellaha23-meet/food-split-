-- Migration 0002: Per-diner tip
-- Tip moves from a single session-level amount to each diner's own choice.
-- Each participant tips on their own share; settlement adds their tip on top.
-- All money columns remain INTEGER (cents) — G1.

alter table participant
  add column tip_cents integer not null default 0;  -- G1: this diner's chosen tip
