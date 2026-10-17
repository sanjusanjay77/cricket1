
import { useEffect, useMemo, useRef, useState } from 'react';
import { Players } from '../api/api.js';

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function cleanName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeId(id) {
  return id === undefined || id === null || id === ''
    ? ''
    : String(id);
}

function sameName(a, b) {
  const first = normalizeName(a);
  return first !== '' && first === normalizeName(b);
}

function getPlayerList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.players)) return result.players;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.players)) {
    return result.data.players;
  }
  return [];
}

function getCreatedPlayer(result) {
  const candidates = [
    result?.player,
    result?.data?.player,
    result?.data,
    result,
  ];

  return candidates.find(
    (item) =>
      item &&
      typeof item === 'object' &&
      item.id != null &&
      !Array.isArray(item)
  ) ?? null;
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    'Failed to add player.'
  );
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

  // Remove duplicate IDs, then duplicate names for display.
  const uniquePlayers = useMemo(() => {
    const byId = new Map();

    for (const player of safePlayers) {
      if (!player || player.id == null || !cleanName(player.name)) {
        continue;
      }

      const id = normalizeId(player.id);
      const previous = byId.get(id);

      if (!previous) {
        byId.set(id, player);
        continue;
      }

      const score = (item) =>
        Number(Boolean(item.name)) +
        Number(Boolean(item.role)) +
        Number(item.team_id != null);

      if (score(player) > score(previous)) {
        byId.set(id, player);
      }
    }

    const byName = new Map();

    for (const player of byId.values()) {
      const key = normalizeName(player.name);

      if (!byName.has(key)) {
        byName.set(key, player);
      } else {
        // Prefer the record belonging to the requested team.
        const previous = byName.get(key);

        if (
          teamId != null &&
          normalizeId(player.team_id) === normalizeId(teamId) &&
          normalizeId(previous.team_id) !== normalizeId(teamId)
        ) {
          byName.set(key, player);
        }
      }
    }

    return [...byName.values()];
  }, [safePlayers, teamId]);

  const selectedPlayer = useMemo(() => {
    const selectedId = normalizeId(value);

    if (!selectedId) return null;

    return (
      safePlayers.find(
        (player) =>
          player &&
          normalizeId(player.id) === selectedId
      ) ||
      uniquePlayers.find(
        (player) => normalizeId(player.id) === selectedId
      ) ||
      null
    );
  }, [safePlayers, uniquePlayers, value]);

  const matches = useMemo(() => {
    const excluded = new Set(
      safeExcludeIds.map(normalizeId)
    );

    const pool = uniquePlayers.filter(
      (player) => !excluded.has(normalizeId(player.id))
    );

    const q = normalizeName(query);

    return pool
      .filter((player) =>
        !q || normalizeName(player.name).includes(q)
      )
      .slice(0, 8);
  }, [uniquePlayers, safeExcludeIds, query]);

  const exactMatch = useMemo(() => {
    const q = normalizeName(query);

    if (!q) return null;

    // Prefer an exact match from the requested team.
    return (
      uniquePlayers.find(
        (player) =>
          sameName(player.name, query) &&
          teamId != null &&
          normalizeId(player.team_id) === normalizeId(teamId)
      ) ||
      uniquePlayers.find(
        (player) => sameName(player.name, query)
      ) ||
      null
    );
  }, [uniquePlayers, query, teamId]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        boxRef.current &&
        !boxRef.current.contains(event.target)
      ) {
        setOpen(false);
        setCreateError('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      );
    };
  }, []);

  const selectPlayer = (player) => {
    if (!player || player.id == null) return;

    if (typeof onChange === 'function') {
      onChange(player.id);
    }

    setQuery('');
    setCreateError('');
    setOpen(false);
  };

  const refreshAndFindExisting = async (name) => {
    if (teamId == null) return null;

    const result = await Players.list(teamId);
    const refreshedPlayers = getPlayerList(result);

    return (
      refreshedPlayers.find(
        (player) =>
          player?.id != null &&
          sameName(player.name, name) &&
          (
            player.team_id == null ||
            normalizeId(player.team_id) === normalizeId(teamId)
          )
      ) || null
    );
  };

  const createPlayer = async () => {
    const name = cleanName(query);

    if (!name || teamId == null || createLockRef.current) {
      return;
    }

    setCreateError('');

    // Reuse a player already present in the current list.
    const existing = uniquePlayers.find(
      (player) =>
        player.id != null &&
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

    try {
      let created;

      try {
        const result = await Players.create({
          team_id: teamId,
          name,
        });

        created = getCreatedPlayer(result);
      } catch (error) {
        // A 409 normally means the backend rejected a duplicate.
        // Refresh and select the existing record if it is found.
        if (error?.response?.status === 409) {
          const existingPlayer =
            await refreshAndFindExisting(name);

          if (existingPlayer) {
            if (typeof onCreated === 'function') {
              onCreated(existingPlayer);
            }

            selectPlayer(existingPlayer);
            return;
          }

          throw new Error(
            'This player name already exists, but the existing player could not be found in the refreshed list. Please check the team and try again.'
          );
        }

        throw error;
      }

      if (!created || created.id == null) {
        // Avoid blindly repeating the create request. It may have
        // succeeded on the server even if the response was unusual.
        const existingPlayer =
          await refreshAndFindExisting(name);

        if (existingPlayer) {
          if (typeof onCreated === 'function') {
            onCreated(existingPlayer);
          }

          selectPlayer(existingPlayer);
          return;
        }

        throw new Error(
          'The server did not return a valid player ID.'
        );
      }

      if (typeof onCreated === 'function') {
        onCreated(created);
      }

      selectPlayer(created);
    } catch (error) {
      console.error(
        'Failed to create player:',
        error?.response?.data || error
      );

      setCreateError(getErrorMessage(error));
    } finally {
      createLockRef.current = false;
      setCreating(false);
    }
  };

  if (selectedPlayer) {
    return (
      <div className="flex items-center justify-between bg-slate-900 border border-emerald-600/60 rounded-lg px-3 py-2">
        <span className="font-medium">
          {selectedPlayer.name}
        </span>

        <button
          type="button"
          className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
          onClick={() => {
            if (typeof onChange === 'function') {
              onChange(null);
            }

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
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setCreateError('');
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }

          if (
            event.key === 'Enter' &&
            open &&
            query.trim()
          ) {
            event.preventDefault();

            if (exactMatch) {
              selectPlayer(exactMatch);
            } else {
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

          {matches.map((player) => (
            <button
              type="button"
              key={normalizeId(player.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-600/20 flex justify-between gap-3"
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

          {teamId != null && query.trim() && (
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
                {creating
                  ? 'Adding…'
                  : `+ Add new player "${cleanName(query)}"`}
              </button>
            )
          )}

          {createError && (
            <div
              role="alert"
              className="px-3 py-2 text-sm text-red-300 border-t border-slate-700"
            >
              {createError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
