/**
 * POST /api/sessions — create a session with hard-coded items (P2.1/P2.5).
 * Used by the walking skeleton; receipt digitization (P4) replaces the hard-coded items.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/session/create';

interface CreateSessionBody {
  hostAccountId: string;
  items: Array<{ name: string; qty: number; unitPriceCents: number }>;
  taxCents: number;
  tipCents: number;
  tipMode?: 'proportional' | 'even';
  serviceChargeCents?: number;
  discountCents?: number;
  discountMode?: 'proportional' | 'assigned';
  printedTotalCents: number;
  taxInclusive?: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CreateSessionBody;
  try {
    body = (await req.json()) as CreateSessionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    hostAccountId,
    items,
    taxCents,
    tipCents,
    tipMode = 'proportional',
    serviceChargeCents = 0,
    discountCents = 0,
    discountMode = 'proportional',
    printedTotalCents,
    taxInclusive = false,
  } = body;

  if (!hostAccountId || !items?.length || printedTotalCents == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const result = await createSession({
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
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
