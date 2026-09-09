import { useEffect, useMemo, useRef, useState } from 'react';
import { Teams } from '../api/api.js';

/**
 * Type a team name. Matching existing teams show above to pick instead of retyping.
 * If nothing matches, an inline "Create team" option appears to add it on the spot.
 */
export default function TeamAutocomplete({ teams, value, onCreated, onChange, placeholder = 'Type team name…', excludeId = null }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const boxRef = useRef(null);

  const selectedTeam = useMemo(() => teams.find(t => t.id === value), [teams, value]);

  const matches = useMemo(() => {
    const pool = teams.filter(t => t.id !== excludeId);
    if (!query.trim()) return pool.slice(0, 8);
    const q = query.toLowerCase();
    return pool.filter(t => t.name.toLowerCase().includes(q)).slice(0, 8);
  }, [teams, query, excludeId]);

  const exactMatch = teams.some(t => t.name.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    const onClickOutside = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const createTeam = async () => {
    if (!query.trim() || creating) return;
    setCreating(true);
    const shortName = query.trim().slice(0, 4).toUpperCase();
    const team = await Teams.create({ name: query.trim(), short_name: shortName });
    setCreating(false);
    setQuery('');
    setOpen(false);
    onCreated(team);
  };

  if (selectedTeam) {
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-emerald-600/60 rounded-xl px-3 py-2">
        <span className="font-medium flex items-center gap-2">
          <span className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold" style={{ background: selectedTeam.logo_color }}>
            {selectedTeam.short_name?.slice(0, 2)}
          </span>
          {selectedTeam.name}
        </span>
        <button type="button" className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input className="input" placeholder={placeholder} value={query}
        onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-xl shadow-xl">
          {matches.map(t => (
            <button type="button" key={t.id} className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex items-center gap-2"
              onClick={() => { onChange(t.id); setQuery(''); setOpen(false); }}>
              <span className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0" style={{ background: t.logo_color }}>
                {t.short_name?.slice(0, 2)}
              </span>
              {t.name}
            </button>
          ))}
          {query.trim() && !exactMatch && (
            <button type="button" disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/20 border-t border-slate-700 font-medium"
              onClick={createTeam}>
              {creating ? 'Creating…' : `+ Create team "${query.trim()}"`}
            </button>
          )}
          {matches.length === 0 && !query.trim() && <div className="px-3 py-2 text-sm text-slate-400">Start typing a team name…</div>}
        </div>
      )}
    </div>
  );
}
