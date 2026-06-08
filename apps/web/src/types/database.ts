/**
 * Database types derived from the Supabase schema (migration 0001).
 * All money fields are `number` (integer cents) — G1.
 */

export type SessionStatus = 'open' | 'claiming' | 'reconciling' | 'settling' | 'closed';
export type TipMode = 'proportional' | 'even';
export type DiscountMode = 'proportional' | 'assigned';
export type SettlementStatus = 'pending' | 'paid' | 'rolled_to_tab' | 'comped';
export type PaymentMethod = 'venmo' | 'cashapp' | 'paypal' | 'applecash' | 'zelle';
export type LineItemStatus = 'unclaimed' | 'claimed' | 'assigned' | 'comped';

export interface HostAccount {
  id: string;
  auth_user_id: string;
  display_name: string;
  default_tip_pct: number;
  default_tip_mode: TipMode;
  created_at: string;
}

export interface SavedDiner {
  id: string;
  host_account_id: string;
  name: string;
  color: string;
  preferred_method: PaymentMethod;
  handles: Record<string, string>;
  running_tab_cents: number;
  last_seen_at: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  host_account_id: string;
  join_code: string;
  status: SessionStatus;
  receipt_image_path: string | null;
  subtotal_cents: number;
  tax_cents: number;
  service_charge_cents: number;
  tip_cents: number;
  tip_mode: TipMode;
  discount_cents: number;
  discount_mode: DiscountMode;
  printed_total_cents: number;
  tax_inclusive: boolean;
  created_at: string;
  closed_at: string | null;
}

export interface LineItem {
  id: string;
  session_id: string;
  name: string;
  qty: number;
  unit_price_cents: number;
  total_price_cents: number;
  status: LineItemStatus;
  sort_order: number;
  created_at: string;
}

export interface Participant {
  id: string;
  session_id: string;
  saved_diner_id: string | null;
  display_name: string;
  color: string;
  is_treated: boolean;
  is_host_proxy: boolean;
  tip_cents: number;
  joined_at: string;
  last_active_at: string;
}

export interface Claim {
  id: string;
  line_item_id: string;
  participant_id: string;
  weight: number;
  created_at: string;
}

export interface Settlement {
  id: string;
  session_id: string;
  participant_id: string;
  amount_owed_cents: number;
  status: SettlementStatus;
  payment_method: string | null;
  payment_link: string | null;
  paid_at: string | null;
  nudged_at: string | null;
  created_at: string;
}

export interface MealHistory {
  id: string;
  host_account_id: string;
  session_id: string | null;
  summary: Record<string, unknown>;
  dined_at: string;
}

// Supabase Database schema type (for createClient<Database>)
export interface Database {
  public: {
    Tables: {
      host_account: { Row: HostAccount; Insert: Omit<HostAccount, 'id' | 'created_at'>; Update: Partial<HostAccount> };
      saved_diner: { Row: SavedDiner; Insert: Omit<SavedDiner, 'id' | 'created_at'>; Update: Partial<SavedDiner> };
      session: { Row: Session; Insert: Omit<Session, 'id' | 'created_at'>; Update: Partial<Session> };
      line_item: { Row: LineItem; Insert: Omit<LineItem, 'id' | 'created_at'>; Update: Partial<LineItem> };
      participant: { Row: Participant; Insert: Omit<Participant, 'id'>; Update: Partial<Participant> };
      claim: { Row: Claim; Insert: Omit<Claim, 'id' | 'created_at'>; Update: Partial<Claim> };
      settlement: { Row: Settlement; Insert: Omit<Settlement, 'id' | 'created_at'>; Update: Partial<Settlement> };
      meal_history: { Row: MealHistory; Insert: Omit<MealHistory, 'id'>; Update: Partial<MealHistory> };
    };
  };
}
