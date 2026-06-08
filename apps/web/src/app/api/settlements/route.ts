/**
 * PATCH /api/settlements — mark a participant's debt paid/pending (P6.2).
 *
 * G3: settlement status is server state, broadcast to all clients via Realtime
 * (clients subscribe to the `settlement` table). Either the host marks paid or
 * a guest taps "I paid" — both hit this same server-owned transition.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

interface PatchBody {
  settlementId: string;
  status: 'pending' | 'paid';
  paymentMethod?: string;
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { settlementId, status, paymentMethod } = body;
  if (!settlementId || (status !== 'pending' && status !== 'paid')) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
  };
  if (paymentMethod) update['payment_method'] = paymentMethod;

  const { data, error } = await supabaseAdmin
    .from('settlement')
    .update(update)
    .eq('id', settlementId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 500 });
  }

  return NextResponse.json({ settlement: data });
}
