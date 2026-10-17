
import { useEffect, useMemo, useRef, useState } from 'react';
import { Players } from '../api/api.js';

function cleanName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeName(name) {
  return cleanName(name).toLocaleLowerCase();
}

function normalizeId(id) {
  if (id === undefined || id === null || id === '') return '';
  if (typeof id === 'object') return normalizeId(id.id);
  return String(id);
}

function sameName(a, b) {
  return normalizeName(a) === normalizeName(b);
}

function getPlayerList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.players)) return result.players;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.players)) return result.data.players;
  return [];
}

function getCreatedPlayer(result) {
  return (
    result?.player ??
    result?.data?.player ??
    result?.data ??
    result
  );
}

function uniquePlayers(players, teamId) {
  const byId = new Map();

  for (const player of players) {
    if (!player || player.id == null) continue;

    const id = normalizeId(player.id);
    if (!id) continue;

    const existing = byId.get(id);

    if (!existing) {
      byId.set(id, player);
      continue;
    }

    const score = item =>
      Number(Boolean(item.name)) +
      Number(Boolean(item.role)) +
      Number(Boolean(item.team_id));

    if (score(player) > score(existing)) {
      byId.set(id, player);
    }
  }

  const byName = new Map();

  for (const player of byId.values()) {
    const nameKey = normalizeName(player.name);
    if (!nameKey) continue;

    const existing = byName.get(nameKey);

    if (!existing) {
      byName.set(nameKey, player);
      continue;
    }

    const existingIsTeam =
      teamId != null &&
      normalizeId(existing.team_id) === normalizeId(teamId);

    const playerIsTeam =
      teamId != null &&
      normalizeId(player.team_id) === normalizeId(teamId);

    if (playerIsTeam && !existingIsTeam) {
      byName.set(nameKey, player);
    }
  }

  return Array.from(byName.values());
}

export default function PlayerAutocomplete({
  players,
  value,
  onChange,
  onCreated,
  teamId,
  placeholder = 'Type a player name…',
  excludeIds = [],
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const boxRef = useRef(null);
  const createLockRef = useRef(false);

  const safePlayers = useMemo(
    () => (Array.isArray(players) ? players : []),
    [players]
  );

  const safeExcludeIds = useMemo(
    () => (Array.isArray(excludeIds) ? excludeIds : []),
    [excludeIds]
  );

  const uniqueList = useMemo(
    () => uniquePlayers(safePlayers, teamId),
    [safePlayers, teamId]
  );

  const selectedPlayer = useMemo(() => {
    const selectedId = normalizeId(value);
    if (!selectedId) return null;

    return (
      uniqueList.find(
        player => normalizeId(player.id) === selectedId
      ) || null
    );
  }, [uniqueList, value]);

  const matches = useMemo(() => {
    const excluded = new Set(safeExcludeIds.map(normalizeId));
    const q = normalizeName(query);

    return uniqueList
      .filter(player => !excluded.has(normalizeId(player.id)))
      .filter(player => !q || normalizeName(player.name).includes(q))
      .slice(0, 8);
  }, [uniqueList, safeExcludeIds, query]);

  const exactMatch = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return null;

    return (
      uniqueList.find(player => sameName(player.name, q)) || null
    );
  }, [uniqueList, query]);

  useEffect(() => {
    const onClickOutside = event => {
      if (boxRef.current && !boxRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);

    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  const selectPlayer = player => {
    if (!player || player.id == null) return;

    onChange?.(player.id);
    setQuery('');
    setCreateError('');
    setOpen(false);
  };

  const refreshAndFindExisting = async name => {
    if (!teamId) return null;

    try {
      const result = await Players.list(teamId);
      const refreshed = getPlayerList(result);

      const existing = refreshed.find(
        player =>
          player?.id != null &&
          sameName(player.name, name) &&
          (
            player.team_id == null ||
            normalizeId(player.team_id) === normalizeId(teamId)
          )
      );

      if (existing) {
        onCreated?.(existing);
        return existing;
      }
    } catch (error) {
      console.error('Failed to refresh player list:', error);
    }

    return null;
  };

  const createPlayer = async () => {
    const name = cleanName(query);

    if (!name || !teamId || createLockRef.current) return;

    const existing = uniqueList.find(
      player =>
        sameName(player.name, name) &&
        (
          player.team_id == null ||
          normalizeId(player.team_id) === normalizeId(teamId)
        )
    );

    if (existing) {
      selectPlayer(existing);
      return;
    }

    createLockRef.current = true;
    setCreating(true);
    setCreateError('');

    try {
      const result = await Players.create({
        team_id: teamId,
        name,
      });

      const player = getCreatedPlayer(result);

      if (!player || player.id == null) {
        const refreshed = await refreshAndFindExisting(name);

        if (refreshed) {
          selectPlayer(refreshed);
          return;
        }

        throw new Error(
          'The server did not return a valid player ID.'
        );
      }

      onCreated?.(player);
      onChange?.(player.id);
      setQuery('');
      setOpen(false);
    } catch (error) {
      console.error('Failed to create player:', error);

      // A 409 can mean another request already created this player.
      const existing = await refreshAndFindExisting(name);

      if (existing) {
        onChange?.(existing.id);
        setQuery('');
        setOpen(false);
      } else {
        setCreateError(
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          'Unable to add player.'
        );
      }
    } finally {
      createLockRef.current = false;
      setCreating(false);
    }
  };

  if (selectedPlayer) {
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-emerald-600/60 rounded-lg px-3 py-2">
        <span className="font-medium">{selectedPlayer.name}</span>

        <button
          type="button"
          className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
          onClick={() => {
            onChange?.(null);
            setQuery('');
            setCreateError('');
            setOpen(false);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="input"
        autoComplete="off"
        maxLength={80}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={event => {
          setQuery(event.target.value);
          setCreateError('');
          setOpen(true);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            setOpen(false);
          }

          if (event.key === 'Enter' && open) {
            event.preventDefault();

            if (exactMatch) {
              selectPlayer(exactMatch);
            } else if (query.trim()) {
              createPlayer();
            }
          }
        }}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
          {matches.length === 0 && !query.trim() && (
            <div className="px-3 py-2 text-sm text-slate-400">
              No players yet
            </div>
          )}

          {matches.map(player => (
            <button
              type="button"
              key={normalizeId(player.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex justify-between"
              onClick={() => selectPlayer(player)}
            >
              <span>{player.name}</span>

              {player.role && (
                <span className="text-slate-500 text-xs">
                  {player.role}
                </span>
              )}
            </button>
          ))}

          {teamId && query.trim() && (
            exactMatch ? (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/20 border-t border-slate-700 font-medium"
                onClick={() => selectPlayer(exactMatch)}
              >
                Select existing: {exactMatch.name}
              </button>
            ) : (
              <button
                type="button"
                disabled={creating}
                className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/20 border-t border-slate-700 font-medium disabled:opacity-50"
                onClick={createPlayer}
              >
                {creating ? 'Adding…' : `+ Add new player "${cleanName(query)}"`}
              </button>
            )
          )}

          {createError && (
            <div className="border-t border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">
              {createError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
