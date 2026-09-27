import { useEffect, useMemo, useRef, useState } from 'react';
import { Teams } from '../api/api.js';

/**
 * Type a team name. Matching existing teams show above to pick instead of retyping.
 * If nothing matches, an inline "Create team" option appears to add it on the spot.
 */
export default function TeamAutocomplete({
  teams,
  value,
  onCreated,
  onChange,
  placeholder = 'Type team name…',
  excludeId = null,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const boxRef = useRef(null);

  /*
   * IMPORTANT:
   * Never assume teams is an array.
   * This prevents .find(), .filter(), and .some() crashes
   * when data is temporarily undefined during page loading.
   */
  const safeTeams = useMemo(
    () => (Array.isArray(teams) ? teams : []),
    [teams]
  );

  const selectedTeam = useMemo(() => {
    return safeTeams.find(
      (team) =>
        team &&
        String(team.id) === String(value)
    );
  }, [safeTeams, value]);

  const matches = useMemo(() => {
    const pool = safeTeams.filter(
      (team) =>
        team &&
        String(team.id) !== String(excludeId)
    );

    const cleanQuery = query.trim();

    if (!cleanQuery) {
      return pool.slice(0, 8);
    }

    const q = cleanQuery.toLowerCase();

    return pool
      .filter((team) =>
        String(team.name || '')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 8);
  }, [safeTeams, query, excludeId]);

  const exactMatch = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      return false;
    }

    return safeTeams.some(
      (team) =>
        String(team?.name || '')
          .trim()
          .toLowerCase() === cleanQuery
    );
  }, [safeTeams, query]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (
        boxRef.current &&
        !boxRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);

    return () => {
      document.removeEventListener(
        'mousedown',
        onClickOutside
      );
    };
  }, []);

  const createTeam = async () => {
    const cleanName = query.trim();

    if (!cleanName || creating) {
      return;
    }

    setCreating(true);

    try {
      const shortName = cleanName
        .slice(0, 4)
        .toUpperCase();

      const team = await Teams.create({
        name: cleanName,
        short_name: shortName,
      });

      if (team) {
        setQuery('');
        setOpen(false);

        if (typeof onCreated === 'function') {
          onCreated(team);
        }
      }
    } catch (error) {
      console.error('Failed to create team:', error);

      alert(
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to create team'
      );
    } finally {
      setCreating(false);
    }
  };

  /*
   * Existing selected-team display.
   */
  if (selectedTeam) {
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-emerald-600/60 rounded-xl px-3 py-2">
        <span className="font-medium flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold"
            style={{
              background:
                selectedTeam.logo_color || '#334155',
            }}
          >
            {selectedTeam.short_name?.slice(0, 2)}
          </span>

          {selectedTeam.name}
        </span>

        <button
          type="button"
          className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
          onClick={() => onChange(null)}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative"
      ref={boxRef}
    >
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-xl shadow-xl">
          {matches.map((team) => (
            <button
              type="button"
              key={team.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex items-center gap-2"
              onClick={() => {
                onChange(team.id);
                setQuery('');
                setOpen(false);
              }}
            >
              <span
                className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0"
                style={{
                  background:
                    team.logo_color || '#334155',
                }}
              >
                {team.short_name?.slice(0, 2)}
              </span>

              {team.name}
            </button>
          ))}

          {query.trim() && !exactMatch && (
            <button
              type="button"
              disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/20 border-t border-slate-700 font-medium disabled:opacity-50"
              onClick={createTeam}
            >
              {creating
                ? 'Creating…'
                : `+ Create team "${query.trim()}"`}
            </button>
          )}

          {matches.length === 0 && !query.trim() && (
            <div className="px-3 py-2 text-sm text-slate-400">
              Start typing a team name…
            </div>
          )}

          {matches.length === 0 &&
            query.trim() &&
            exactMatch && (
              <div className="px-3 py-2 text-sm text-slate-400">
                No matching team available.
              </div>
            )}
        </div>
      )}
    </div>
  );
}
