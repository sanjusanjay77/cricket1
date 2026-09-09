import { useState } from 'react';

// Change this to set your own password for creating new scoreboards.
const SCOREBOARD_PASSWORD = 'gcc';
const STORAGE_KEY = 'cricscore_new_scoreboard_unlocked';

export default function ScoreboardGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  if (unlocked) return children;

  const submit = (e) => {
    e.preventDefault();
    if (input === SCOREBOARD_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, 'true');
      setUnlocked(true);
    } else {
      setError('Incorrect password');
    }
  };

  return (
    <div className="max-w-sm mx-auto card space-y-4 fade-in text-center">
      <div className="text-4xl">🔒</div>
      <h1 className="text-xl font-bold">Password Required</h1>
      <p className="text-sm text-slate-400">Creating a new scoreboard is password-protected on this site.</p>
      <form onSubmit={submit} className="space-y-3 text-left">
        <input
          type="password"
          className="input"
          placeholder="Enter password"
          value={input}
          autoFocus
          onChange={(e) => { setInput(e.target.value); setError(''); }}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="btn btn-primary w-full">Unlock</button>
      </form>
    </div>
  );
}
