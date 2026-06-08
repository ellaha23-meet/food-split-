/**
 * POST /api/host-sessions — prototype host entry point.
 *
 * Ensures a demo host account exists (real auth/onboarding is F1, out of
 * prototype scope) and creates a session + line items from the host's input.
 * printedTotalCents is derived as subtotal+tax+tip so the I4 guard reconciles.
 *
 * G6: runs server-side only; uses the service role key, never shipped to client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { createSession } from '@/lib/session/create';

const DEMO_HOST_EMAIL = 'demo-host@tally.internal';

async function ensureDemoHost(): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('host_account')
    .select('id')
    .eq('display_name', 'Demo Host')
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  // Create the backing auth user (idempotent-ish: ignore "already exists").
  const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: DEMO_HOST_EMAIL,
    email_confirm: true,
  });
  let authUserId = created?.user?.id;
  if (authErr || !authUserId) {
    // Fall back to looking the user up if it already existed.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    authUserId = list?.users.find((u) => u.email === DEMO_HOST_EMAIL)?.id;
    if (!authUserId) {
      throw new Error(`Could not provision demo host: ${authErr?.message ?? 'unknown'}`);
    }
  }

  const { data: host, error: hostErr } = await supabaseAdmin
    .from('host_account')
    .insert({ auth_user_id: authUserId, display_name: 'Demo Host' })
    .select('id')
    .single();
  if (hostErr || !host) throw new Error(`Could not create host account: ${hostErr?.message}`);
  return host.id;
}

interface Body {
  items: Array<{ name: string; qty: number; unitPriceCents: number }>;
  taxCents: number;
  tipCents: number;
  tipMode?: 'proportional' | 'even';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.items?.length) {
    return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
  }

  const taxCents = body.taxCents || 0;
  const tipCents = body.tipCents || 0;
  const subtotalCents = body.items.reduce((a, i) => a + i.qty * i.unitPriceCents, 0);
  const printedTotalCents = subtotalCents + taxCents + tipCents;

  try {
    const hostAccountId = await ensureDemoHost();
    const result = await createSession({
      hostAccountId,
      items: body.items,
      taxCents,
      tipCents,
      tipMode: body.tipMode ?? 'proportional',
      serviceChargeCents: 0,
      discountCents: 0,
      discountMode: 'proportional',
      printedTotalCents,
      taxInclusive: false,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
