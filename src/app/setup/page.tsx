'use client';

import { useState } from 'react';

export default function SetupPage() {
  const [rawInput, setRawInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('saving');
    const response = await fetch('/api/profile/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawInput }),
    });
    setStatus(response.ok ? 'saved' : 'error');
  }

  return (
    <main>
      <h1>What are you growing toward?</h1>
      <p>List 1-2 growth directions, comma-separated (e.g. "backend infra, ai/ml").</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder="backend infra, ai/ml"
        />
        <button type="submit" disabled={status === 'saving'}>
          Save
        </button>
      </form>
      {status === 'saved' && <p>Saved.</p>}
      {status === 'error' && <p>Something went wrong — try again.</p>}
    </main>
  );
}
