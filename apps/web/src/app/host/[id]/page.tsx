/**
 * Host live view — shareable join link + the live session (host controls on).
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import { LiveSession } from '@/components/LiveSession';
import { ShareLink } from '@/components/ShareLink';

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
      <main style={{ fontFamily: 'var(--font-body)', padding: '2rem' }}>
        <h1>Tally</h1>
        <p style={{ color: 'crimson' }}>Session not found.</p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: 'var(--font-body)', padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <h1>Tally — host</h1>
      <ShareLink joinCode={session.join_code} />
      <hr style={{ margin: '20px 0' }} />
      <LiveSession sessionId={session.id} participantId={null} isHost />
    </main>
  );
}
