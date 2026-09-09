import { useEffect, useMemo, useRef, useState } from 'react';
import { Players } from '../api/api.js';

/**
 * Type-to-search player picker.
 * - If `value` (a player id) is already set, shows a compact chip with a "change" action
 *   instead of forcing the user to retype/reselect from scratch.
 * - Otherwise shows a text input; matching players appear in a dropdown as you type,
 *   and clicking one selects it immediately.
 * - If `teamId` is passed, a "+ Add new player" option appears when nothing matches,
 *   letting you register a brand-new player on the spot (no pre-registration needed) —
 *   they're created against that team and selected immediately.
 */
export default function PlayerAutocomplete({ players, value, onChange, onCreated, teamId, placeholder = 'Type a player name…', excludeIds = [] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef(null);

  const selectedPlayer = useMemo(() => players.find(p => p.id === value), [players, value]);

  const matches = useMemo(() => {
    const pool = players.filter(p => !excludeIds.includes(p.id));
    if (!query.trim()) return pool.slice(0, 8);
    const q = query.toLowerCase();
    return pool.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [players, query, excludeIds]);

  const exactMatch = players.some(p => p.name.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const createPlayer = async () => {
    if (!query.trim() || creating || !teamId) return;
    setCreating(true);
    try {
      const player = await Players.create({ team_id: teamId, name: query.trim() });
      onCreated?.(player);
      onChange(player.id);
      setQuery('');
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  if (selectedPlayer) {
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-emerald-600/60 rounded-lg px-3 py-2">
        <span className="font-medium">{selectedPlayer.name}</span>
        <button type="button" className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
          onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
          {matches.length === 0 && !query.trim() && <div className="px-3 py-2 text-sm text-slate-400">No players yet</div>}
          {matches.map(p => (
            <button type="button" key={p.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex justify-between"
              onClick={() => { onChange(p.id); setQuery(''); setOpen(false); }}>
              <span>{p.name}</span>
              {p.role && <span className="text-slate-500 text-xs">{p.role}</span>}
            </button>
          ))}
          {teamId && query.trim() && !exactMatch && (
            <button type="button" disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/20 border-t border-slate-700 font-medium"
              onClick={createPlayer}>
              {creating ? 'Adding…' : `+ Add new player "${query.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
