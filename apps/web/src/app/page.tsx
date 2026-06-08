import { CreateSessionForm } from '@/components/CreateSessionForm';

export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>Tally</h1>
      <p style={{ color: '#555' }}>
        Real-time bill splitting. Enter the receipt, share the link, let everyone tap what they had.
      </p>
      <CreateSessionForm />
    </main>
  );
}
