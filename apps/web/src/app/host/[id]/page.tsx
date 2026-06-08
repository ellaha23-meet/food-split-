/**
 * Host live view — shareable join link + the live session (host controls on).
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import { LiveSession } from '@/components/LiveSession';
import { ShareLink } from '@/components/ShareLink';
import { Wave } from '@/components/ui';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HostPage({ params }: PageProps) {
  const { id } = await params;

  const { data: session } = await supabaseAdmin
    .from('session')
    .select('id, join_code')
    .eq('id', id)
    .single();

  if (!session) {
    return (
      <main className="page">
        <div className="container">
          <h1 className="brand brand--lg">Tally</h1>
          <p className="error">Session not found.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container">
        <span className="sticker sticker--yellow" style={{ marginBottom: 8, display: 'inline-block' }}>Host</span>
        <h1 className="brand brand--xl">Tally</h1>
        <p className="tagline">Snap the receipt, tap what you had, add your tip, and pay with Bit.</p>
        <Wave />
        <ShareLink joinCode={session.join_code} />
        <Wave />
        <LiveSession sessionId={session.id} participantId={null} isHost />
      </div>
    </main>
  );
}
