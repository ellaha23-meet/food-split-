/**
 * P6.1: Payment deep links — prefilled with amount + memo.
 *
 * Tally never touches money (no custody, G-money-out-of-scope). We only build
 * deep links into the user's own payment apps. The link amount MUST equal the
 * engine's per-participant total exactly (cents → dollars string).
 */

import { formatCentsPlain, asCents } from '@tally/reconcile';

export type PaymentApp = 'venmo' | 'cashapp' | 'paypal' | 'applecash' | 'zelle';

export interface PaymentLink {
  app: PaymentApp;
  /** A tappable URL, or null when the app has no deep-link scheme (degrade). */
  url: string | null;
  /** Human label. */
  label: string;
  /** Exact amount string, e.g. "12.34" — always shown for copy-paste. */
  amount: string;
  /** When url is null, the recipient handle to pay manually. */
  handle: string | null;
}

export interface BuildLinksInput {
  amountCents: number;
  memo: string;
  /** Recipient handles keyed by app, e.g. { venmo: '@alice', cashapp: '$alice' }. */
  handles: Partial<Record<PaymentApp, string>>;
}

/**
 * Build deep links for every supported app. Apps with a known scheme get a
 * one-tap URL; the rest degrade to handle + copyable amount (P6.1 constraint).
 */
export function buildPaymentLinks(input: BuildLinksInput): PaymentLink[] {
  const amount = formatCentsPlain(asCents(input.amountCents));
  const memo = encodeURIComponent(input.memo);
  const h = input.handles;

  const links: PaymentLink[] = [];

  // Venmo — one-tap with amount + note
  if (h.venmo) {
    const recipient = h.venmo.replace(/^@/, '');
    links.push({
      app: 'venmo',
      label: 'Venmo',
      url: `https://venmo.com/${encodeURIComponent(recipient)}?txn=pay&amount=${amount}&note=${memo}`,
      amount,
      handle: h.venmo,
    });
  }

  // Cash App — $cashtag, amount path; note not supported in web link
  if (h.cashapp) {
    const tag = h.cashapp.replace(/^\$/, '');
    links.push({
      app: 'cashapp',
      label: 'Cash App',
      url: `https://cash.app/$${encodeURIComponent(tag)}/${amount}`,
      amount,
      handle: h.cashapp,
    });
  }

  // PayPal — paypal.me link
  if (h.paypal) {
    const user = h.paypal.replace(/^@/, '');
    links.push({
      app: 'paypal',
      label: 'PayPal',
      url: `https://paypal.me/${encodeURIComponent(user)}/${amount}`,
      amount,
      handle: h.paypal,
    });
  }

  // Apple Cash — no deep link; degrade to handle + copyable amount
  if (h.applecash) {
    links.push({ app: 'applecash', label: 'Apple Cash', url: null, amount, handle: h.applecash });
  }

  // Zelle — no universal deep link; degrade to handle + copyable amount
  if (h.zelle) {
    links.push({ app: 'zelle', label: 'Zelle', url: null, amount, handle: h.zelle });
  }

  return links;
}
