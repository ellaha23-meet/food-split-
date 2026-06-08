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
      <main className="page">
        <div className="container container--narrow">
          <h1 className="brand brand--lg">Tally</h1>
          <p className="error">{errorMessage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container container--narrow">
        <span className="sticker" style={{ marginBottom: 8, display: 'inline-block' }}>You&apos;re in</span>
        <h1 className="brand brand--xl">Tally</h1>
        <p className="tagline" style={{ marginBottom: 20 }}>Joining: <strong>{sessionName}</strong></p>
        <GuestJoinForm sessionId={sessionId} />
      </div>
    </main>
  );
}
