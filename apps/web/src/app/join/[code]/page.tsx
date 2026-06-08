/**
 * P2.3: Guest landing page — join a session by code.
 *
 * G4: No install, no account, no camera, no permission prompt to claim.
 * Guest enters name + picks color → ephemeral participant row created.
 */

import { resolveJoinCode } from '@/lib/session/join';
import { GuestJoinForm } from './GuestJoinForm';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: PageProps) {
  const { code } = await params;

  let sessionId: string | null = null;
  let sessionName: string | null = null;
  let errorMessage: string | null = null;

  try {
    const { session } = await resolveJoinCode(code);
    sessionId = session.id;
    sessionName = `Session ${session.join_code}`;
  } catch {
    errorMessage = `Invalid or expired join code "${code}". Ask your host for a new link.`;
  }

  if (errorMessage || !sessionId) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <h1>Tally</h1>
        <p style={{ color: 'red' }}>{errorMessage}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Tally</h1>
      <p>Joining: <strong>{sessionName}</strong></p>
      <GuestJoinForm sessionId={sessionId} />
    </main>
  );
}
