import { useEffect, useMemo, useState } from 'react';
import { Teams, Players } from '../api/api.js';

export default function TeamManager() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const [search, setSearch] = useState('');

  const [newTeam, setNewTeam] = useState({
    name: '',
    short_name: '',
    logo_color: '#1e3a8a',
    is_own: false,
  });

  const [newPlayer, setNewPlayer] = useState({
    name: '',
    role: 'batsman',
    jersey_no: '',
  });

  const [creatingTeam, setCreatingTeam] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState(null);
  const [deletingPlayer, setDeletingPlayer] = useState(null);

  const refresh = async () => {
    try {
      const data = await Teams.list();
      setTeams(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load teams:', error);
      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to load teams'
      );
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openTeam = async (id) => {
    setLoadingTeam(true);

    try {
      const data = await Teams.get(id);
      setSelectedTeam(data);
    } catch (error) {
      console.error('Failed to load team:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to load team'
      );
    } finally {
      setLoadingTeam(false);
    }
  };

  const filteredTeams = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return teams;

    return teams.filter((team) =>
      team.name?.toLowerCase().includes(query) ||
      team.short_name?.toLowerCase().includes(query)
    );
  }, [teams, search]);

  const createTeam = async (e) => {
    e.preventDefault();

    const teamName = newTeam.name.trim();
    const shortName = newTeam.short_name.trim().toUpperCase();

    if (!teamName) {
      alert('Enter a team name');
      return;
    }

    if (!shortName) {
      alert('Enter a short team code');
      return;
    }

    setCreatingTeam(true);

    try {
      await Teams.create({
        ...newTeam,
        name: teamName,
        short_name: shortName,
      });

      setNewTeam({
        name: '',
        short_name: '',
        logo_color: '#1e3a8a',
        is_own: false,
      });

      await refresh();
    } catch (error) {
      console.error('Create team error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to create team'
      );
    } finally {
      setCreatingTeam(false);
    }
  };

  const toggleOwn = async (team, e) => {
    e.stopPropagation();

    try {
      await Teams.update(team.id, {
        is_own: !team.is_own,
      });

      await refresh();

      if (selectedTeam?.id === team.id) {
        await openTeam(team.id);
      }
    } catch (error) {
      console.error('Toggle own team error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to update team'
      );
    }
  };

  const addPlayer = async (e) => {
    e.preventDefault();

    if (!selectedTeam) {
      alert('Select a team first');
      return;
    }

    const playerName = newPlayer.name.trim();

    if (!playerName) {
      alert('Enter player name');
      return;
    }

    setAddingPlayer(true);

    try {
      await Players.create({
        ...newPlayer,
        name: playerName,
        team_id: selectedTeam.id,
        jersey_no: newPlayer.jersey_no || null,
      });

      setNewPlayer({
        name: '',
        role: 'batsman',
        jersey_no: '',
      });

      await openTeam(selectedTeam.id);
      await refresh();
    } catch (error) {
      console.error('Add player error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to add player'
      );
    } finally {
      setAddingPlayer(false);
    }
  };

  const removePlayer = async (id) => {
    if (!selectedTeam) return;

    const player = selectedTeam.players?.find(
      (p) => p.id === id
    );

    const confirmed = window.confirm(
      `Remove ${player?.name || 'this player'} from ${selectedTeam.name}?`
    );

    if (!confirmed) return;

    setDeletingPlayer(id);

    try {
      await Players.remove(id);
      await openTeam(selectedTeam.id);
      await refresh();
    } catch (error) {
      console.error('Remove player error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to remove player'
      );
    } finally {
      setDeletingPlayer(null);
    }
  };

  const removeTeam = async (id) => {
    const team = teams.find((t) => t.id === id);

    const confirmed = window.confirm(
      `Delete ${team?.name || 'this team'} and all its players?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingTeam(id);

    try {
      await Teams.remove(id);

      if (selectedTeam?.id === id) {
        setSelectedTeam(null);
      }

      await refresh();
    } catch (error) {
      console.error('Delete team error:', error);

      alert(
        error?.response?.data?.error ||
        error?.message ||
        'Failed to delete team'
      );
    } finally {
      setDeletingTeam(null);
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'batsman':
        return 'Batsman';
      case 'bowler':
        return 'Bowler';
      case 'all-rounder':
        return 'All-rounder';
      case 'wicketkeeper':
        return 'Wicketkeeper';
      default:
        return role || 'Player';
    }
  };

  return (
    <div className="max-w-7xl mx-auto fade-in pb-8">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
              Team Management
            </p>

            <h1 className="text-3xl sm:text-4xl font-bold text-white">
              Manage Teams
            </h1>

            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Create teams, manage squads, and mark your own teams
              for player statistics.
            </p>
          </div>

          <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center text-2xl">
            🏏
          </div>
        </div>
      </div>

      {/* =====================================================
          MAIN GRID
      ====================================================== */}

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5">

        {/* ===================================================
            LEFT — TEAMS
        ==================================================== */}

        <div className="space-y-4">

          {/* CREATE TEAM */}

          <form
            onSubmit={createTeam}
            className="card !p-4 sm:!p-5 border border-slate-700/60"
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Create Team
                </h2>

                <p className="text-xs text-slate-500 mt-1">
                  Add a new team to your scoreboard
                </p>
              </div>

              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg">
                ➕
              </div>
            </div>

            <div className="space-y-3">

              {/* TEAM NAME */}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Team name
                </label>

                <input
                  className="input w-full"
                  placeholder="e.g. Golden Cricket Club"
                  value={newTeam.name}
                  onChange={(e) =>
                    setNewTeam({
                      ...newTeam,
                      name: e.target.value,
                    })
                  }
                />
              </div>

              {/* SHORT CODE */}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Short code
                </label>

                <input
                  className="input w-full"
                  placeholder="e.g. GCC"
                  maxLength={5}
                  value={newTeam.short_name}
                  onChange={(e) =>
                    setNewTeam({
                      ...newTeam,
                      short_name: e.target.value
                        .toUpperCase()
                        .replace(/\s/g, ''),
                    })
                  }
                />

                <p className="text-[11px] text-slate-500 mt-1">
                  Maximum 5 characters. This appears on scorecards.
                </p>
              </div>

              {/* COLOR + OWN TEAM */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
                  <label className="block text-xs font-medium text-slate-400 mb-2">
                    Team color
                  </label>

                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={newTeam.logo_color}
                      onChange={(e) =>
                        setNewTeam({
                          ...newTeam,
                          logo_color: e.target.value,
                        })
                      }
                      className="w-11 h-11 rounded-lg cursor-pointer bg-transparent border-0"
                    />

                    <div>
                      <p className="text-sm text-white font-medium">
                        Team identity
                      </p>

                      <p className="text-[11px] text-slate-500">
                        Used for the team badge
                      </p>
                    </div>
                  </div>
                </div>

                <label className="rounded-xl border border-slate-700 bg-slate-900/50 p-3 cursor-pointer hover:border-emerald-500/50 transition">
                  <div className="flex items-center gap-3">

                    <input
                      type="checkbox"
                      checked={newTeam.is_own}
                      onChange={(e) =>
                        setNewTeam({
                          ...newTeam,
                          is_own: e.target.checked,
                        })
                      }
                      className="w-5 h-5 accent-emerald-500"
                    />

                    <div>
                      <p className="text-sm text-white font-medium">
                        ⭐ My team
                      </p>

                      <p className="text-[11px] text-slate-500">
                        Include in Player Stats
                      </p>
                    </div>

                  </div>
                </label>

              </div>

              {/* CREATE BUTTON */}

              <button
                type="submit"
                disabled={creatingTeam}
                className="btn btn-primary w-full !py-3.5 text-sm font-semibold"
              >
                {creatingTeam
                  ? 'Creating team…'
                  : '＋ Create Team'}
              </button>
            </div>
          </form>

          {/* TEAM LIST */}

          <div className="card !p-0 overflow-hidden border border-slate-700/60">

            <div className="p-4 border-b border-slate-700/60">

              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-bold text-white">
                    Your Teams
                  </h2>

                  <p className="text-xs text-slate-500 mt-0.5">
                    {teams.length}{' '}
                    {teams.length === 1 ? 'team' : 'teams'}
                  </p>
                </div>

                <span className="px-2.5 py-1 rounded-full bg-slate-800 text-xs text-slate-400">
                  {filteredTeams.length}
                </span>
              </div>

              {/* SEARCH */}

              {teams.length > 0 && (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    🔍
                  </span>

                  <input
                    className="input w-full pl-10"
                    placeholder="Search teams..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* TEAM CARDS */}

            <div className="p-3 space-y-2">

              {filteredTeams.map((team) => {
                const isSelected =
                  selectedTeam?.id === team.id;

                const playerCount =
                  team.player_count ??
                  team.players?.length ??
                  0;

                return (
                  <div
                    key={team.id}
                    onClick={() => openTeam(team.id)}
                    className={`
                      group rounded-2xl border p-3 sm:p-4
                      cursor-pointer transition-all
                      ${
                        isSelected
                          ? 'border-emerald-500/70 bg-emerald-500/5'
                          : 'border-slate-700/70 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/40'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">

                      {/* TEAM BADGE */}

                      <div
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-white font-black text-xs sm:text-sm shadow-lg"
                        style={{
                          background:
                            team.logo_color || '#1e3a8a',
                        }}
                      >
                        {team.short_name || 'TEAM'}
                      </div>

                      {/* TEAM INFO */}

                      <div className="min-w-0 flex-1">

                        <div className="flex items-center gap-2 flex-wrap">

                          <h3 className="font-bold text-white truncate">
                            {team.name}
                          </h3>

                          {team.is_own && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
                              ⭐ My Team
                            </span>
                          )}

                        </div>

                        <div className="flex items-center gap-2 mt-1">

                          <span className="text-xs text-slate-500 font-medium">
                            {team.short_name}
                          </span>

                          <span className="text-slate-700">
                            •
                          </span>

                          <span className="text-xs text-slate-500">
                            👥 {playerCount}{' '}
                            {playerCount === 1
                              ? 'player'
                              : 'players'}
                          </span>

                        </div>
                      </div>

                      {/* ARROW */}

                      <div className="text-slate-600 group-hover:text-emerald-400 transition text-xl">
                        ›
                      </div>
                    </div>

                    {/* ACTIONS */}

                    <div
                      className="flex gap-2 mt-3 pt-3 border-t border-slate-800"
                      onClick={(e) => e.stopPropagation()}
                    >

                      <button
                        type="button"
                        onClick={(e) => toggleOwn(team, e)}
                        className={`
                          flex-1 min-h-[40px] rounded-xl text-xs font-medium transition
                          ${
                            team.is_own
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-emerald-400'
                          }
                        `}
                      >
                        {team.is_own
                          ? '⭐ My Team'
                          : '☆ Mark as Mine'}
                      </button>

                      <button
                        type="button"
                        disabled={deletingTeam === team.id}
                        onClick={() => removeTeam(team.id)}
                        className="px-4 min-h-[40px] rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/10 transition disabled:opacity-50"
                      >
                        {deletingTeam === team.id
                          ? 'Deleting…'
                          : 'Delete'}
                      </button>

                    </div>
                  </div>
                );
              })}

              {/* EMPTY */}

              {filteredTeams.length === 0 && (
                <div className="py-10 px-5 text-center">

                  <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-3xl mb-4">
                    🏏
                  </div>

                  <h3 className="font-semibold text-white">
                    {search
                      ? 'No teams found'
                      : 'No teams yet'}
                  </h3>

                  <p className="text-xs text-slate-500 mt-1">
                    {search
                      ? 'Try another team name or short code.'
                      : 'Create your first team above to get started.'}
                  </p>

                </div>
              )}

            </div>
          </div>
        </div>

        {/* ===================================================
            RIGHT — SQUAD
        ==================================================== */}

        <div className="space-y-4">

          {!selectedTeam && (
            <div className="card min-h-[420px] flex flex-col items-center justify-center text-center border border-slate-700/60">

              <div className="w-20 h-20 rounded-3xl bg-slate-800 border border-slate-700 flex items-center justify-center text-4xl mb-5">
                👥
              </div>

              <h2 className="text-xl font-bold text-white">
                Select a Team
              </h2>

              <p className="text-sm text-slate-500 max-w-sm mt-2">
                Choose a team from the list to view its squad,
                add players, or manage existing players.
              </p>

            </div>
          )}

          {selectedTeam && (
            <>
              {/* TEAM PROFILE */}

              <div
                className="rounded-3xl p-5 sm:p-6 border border-slate-700/60 overflow-hidden relative"
                style={{
                  background: `linear-gradient(135deg, ${
                    selectedTeam.logo_color || '#1e3a8a'
                  }22, rgba(15,23,42,0.95))`,
                }}
              >

                <div className="absolute right-0 top-0 w-32 h-32 rounded-full blur-3xl opacity-20"
                  style={{
                    background:
                      selectedTeam.logo_color || '#1e3a8a',
                  }}
                />

                <div className="relative flex items-center gap-4">

                  <div
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center text-white font-black text-sm sm:text-base shadow-xl"
                    style={{
                      background:
                        selectedTeam.logo_color || '#1e3a8a',
                    }}
                  >
                    {selectedTeam.short_name}
                  </div>

                  <div className="min-w-0 flex-1">

                    <div className="flex items-center gap-2 flex-wrap">

                      <h2 className="text-xl sm:text-2xl font-bold text-white truncate">
                        {selectedTeam.name}
                      </h2>

                      {selectedTeam.is_own && (
                        <span className="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-semibold">
                          ⭐ MY TEAM
                        </span>
                      )}

                    </div>

                    <p className="text-sm text-slate-400 mt-1">
                      {selectedTeam.short_name} ·{' '}
                      {selectedTeam.players?.length || 0}{' '}
                      players
                    </p>

                  </div>

                </div>

              </div>

              {/* SQUAD */}

              <div className="card !p-0 overflow-hidden border border-slate-700/60">

                <div className="p-4 sm:p-5 border-b border-slate-700/60 flex items-center justify-between gap-3">

                  <div>
                    <h2 className="font-bold text-white">
                      Squad
                    </h2>

                    <p className="text-xs text-slate-500 mt-1">
                      {selectedTeam.players?.length || 0}{' '}
                      players registered
                    </p>
                  </div>

                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg">
                    👥
                  </div>

                </div>

                {loadingTeam ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    Loading squad…
                  </div>
                ) : (
                  <div className="p-3 sm:p-4 space-y-2">

                    {selectedTeam.players?.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition"
                      >

                        {/* JERSEY */}

                        <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-bold text-white">
                            #{player.jersey_no ?? '-'}
                          </span>
                        </div>

                        {/* PLAYER */}

                        <div className="min-w-0 flex-1">

                          <p className="font-semibold text-sm text-white truncate">
                            {player.name}
                          </p>

                          <p className="text-xs text-slate-500 mt-0.5">
                            {getRoleLabel(player.role)}
                          </p>

                        </div>

                        {/* REMOVE */}

                        <button
                          type="button"
                          disabled={deletingPlayer === player.id}
                          onClick={() =>
                            removePlayer(player.id)
                          }
                          className="min-h-[38px] px-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          {deletingPlayer === player.id
                            ? '…'
                            : 'Remove'}
                        </button>

                      </div>
                    ))}

                    {(!selectedTeam.players ||
                      selectedTeam.players.length === 0) && (
                      <div className="py-8 text-center">

                        <div className="text-3xl mb-2">
                          👤
                        </div>

                        <p className="text-sm font-medium text-slate-300">
                          No players yet
                        </p>

                        <p className="text-xs text-slate-500 mt-1">
                          Add your first player below.
                        </p>

                      </div>
                    )}

                  </div>
                )}

              </div>

              {/* ADD PLAYER */}

              <form
                onSubmit={addPlayer}
                className="card !p-4 sm:!p-5 border border-slate-700/60"
              >

                <div className="flex items-center gap-3 mb-4">

                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    👤
                  </div>

                  <div>
                    <h2 className="font-bold text-white">
                      Add Player
                    </h2>

                    <p className="text-xs text-slate-500 mt-0.5">
                      Add a player to {selectedTeam.name}
                    </p>
                  </div>

                </div>

                <div className="space-y-3">

                  {/* NAME */}

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Player name
                    </label>

                    <input
                      className="input w-full"
                      placeholder="Enter player name"
                      value={newPlayer.name}
                      onChange={(e) =>
                        setNewPlayer({
                          ...newPlayer,
                          name: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* ROLE + JERSEY */}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Playing role
                      </label>

                      <select
                        className="input w-full"
                        value={newPlayer.role}
                        onChange={(e) =>
                          setNewPlayer({
                            ...newPlayer,
                            role: e.target.value,
                          })
                        }
                      >
                        <option value="batsman">
                          Batsman
                        </option>

                        <option value="bowler">
                          Bowler
                        </option>

                        <option value="all-rounder">
                          All-rounder
                        </option>

                        <option value="wicketkeeper">
                          Wicketkeeper
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">
                        Jersey number
                      </label>

                      <input
                        className="input w-full"
                        type="number"
                        min="0"
                        max="999"
                        placeholder="Optional"
                        value={newPlayer.jersey_no}
                        onChange={(e) =>
                          setNewPlayer({
                            ...newPlayer,
                            jersey_no: e.target.value,
                          })
                        }
                      />
                    </div>

                  </div>

                  <button
                    type="submit"
                    disabled={addingPlayer}
                    className="btn btn-primary w-full !py-3.5 font-semibold"
                  >
                    {addingPlayer
                      ? 'Adding player…'
                      : '＋ Add Player'}
                  </button>

                </div>

              </form>

            </>
          )}

        </div>
      </div>
    </div>
  );
}
