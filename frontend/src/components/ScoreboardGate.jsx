import { useState } from 'react';

// GCC Admin Password
const SCOREBOARD_PASSWORD = 'gcc';

export default function ScoreboardGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  if (unlocked) return children;

  const submit = (e) => {
    e.preventDefault();

    if (input.trim() === SCOREBOARD_PASSWORD) {
      setUnlocked(true);
      setError('');
    } else {
      setError('Incorrect password');
      setInput('');
    }
  };

  return (
    <div className="max-w-sm mx-auto card space-y-4 fade-in text-center">
      <div className="text-4xl">🔒</div>

      <h1 className="text-xl font-bold">
        GCC Scoreboard Lock
      </h1>

      <p className="text-sm text-slate-400">
        Enter password to access scoring panel.
      </p>

      <form onSubmit={submit} className="space-y-3 text-left">
        <input
          type="password"
          className="input"
          placeholder="Enter GCC Password"
          value={input}
          autoFocus
          onChange={(e) => {
            setInput(e.target.value);
            setError('');
          }}
        />

        {error && (
          <p className="text-red-400 text-sm">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
