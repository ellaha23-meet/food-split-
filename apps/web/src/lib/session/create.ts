/**
 * P2.1: Session creation — server-side only (G3, G6).
 *
 * Creates a session row + line items from a given item list.
 * Called from API routes or Server Actions; never from client components.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type { TipMode, DiscountMode } from '@/types/database';

export interface CreateSessionItemInput {
  name: string;
  qty: number;
  unitPriceCents: number;
}

export interface CreateSessionInput {
  hostAccountId: string;
  items: CreateSessionItemInput[];
  taxCents: number;
  tipCents: number;
  tipMode: TipMode;
  serviceChargeCents: number;
  discountCents: number;
  discountMode: DiscountMode;
  printedTotalCents: number;
  taxInclusive: boolean;
}

export interface CreateSessionResult {
  sessionId: string;
  joinCode: string;
}

const JOIN_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous (no 0/O/1/I)
const JOIN_CODE_LENGTH = 6;
const MAX_COLLISION_RETRIES = 5;

function generateJoinCode(): string {
  const chars = [];
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    chars.push(JOIN_CODE_CHARSET[Math.floor(Math.random() * JOIN_CODE_CHARSET.length)]);
  }
  return chars.join('');
}

export async function createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const {
    hostAccountId,
    items,
    taxCents,
    tipCents,
    tipMode,
    serviceChargeCents,
    discountCents,
    discountMode,
    printedTotalCents,
    taxInclusive,
  } = input;

  const subtotalCents = items.reduce((acc, item) => acc + item.qty * item.unitPriceCents, 0);

  // Collision-checked join code generation (G9: unique per session)
  let joinCode: string | null = null;
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const candidate = generateJoinCode();
    const { data: existing } = await supabaseAdmin
      .from('session')
      .select('id')
      .eq('join_code', candidate)
      .single();
    if (!existing) {
      joinCode = candidate;
      break;
    }
  }
  if (!joinCode) {
    throw new Error('Failed to generate a unique join code after multiple attempts');
  }

  // Create session row
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('session')
    .insert({
      host_account_id: hostAccountId,
      join_code: joinCode,
      status: 'open',
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      service_charge_cents: serviceChargeCents,
      tip_cents: tipCents,
      tip_mode: tipMode,
      discount_cents: discountCents,
      discount_mode: discountMode,
      printed_total_cents: printedTotalCents,
      tax_inclusive: taxInclusive,
    })
    .select()
    .single();

  if (sessionError || !session) {
    throw new Error(`Failed to create session: ${sessionError?.message ?? 'unknown error'}`);
  }

  // Create line items
  const lineItemRows = items.map((item, idx) => ({
    session_id: session.id,
    name: item.name,
    qty: item.qty,
    unit_price_cents: item.unitPriceCents,
    total_price_cents: item.qty * item.unitPriceCents,
    status: 'unclaimed' as const,
    sort_order: idx,
  }));

  const { error: itemError } = await supabaseAdmin.from('line_item').insert(lineItemRows);

  if (itemError) {
    throw new Error(`Failed to create line items: ${itemError.message}`);
  }

  return { sessionId: session.id, joinCode };
}
