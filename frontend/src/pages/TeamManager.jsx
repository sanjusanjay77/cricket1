import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Teams,
  Players,
} from '../api/api.js';

export default function TeamManager() {

  /* =======================================================
     TEAM STATE
  ======================================================= */

  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const [search, setSearch] = useState('');
  const [showOwnOnly, setShowOwnOnly] = useState(false);

  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  /* =======================================================
     CREATE TEAM
  ======================================================= */

  const [newTeam, setNewTeam] = useState({
    name: '',
    short_name: '',
    logo_color: '#1e3a8a',
    is_own: false,
  });

  const [creatingTeam, setCreatingTeam] = useState(false);

  /* =======================================================
     EDIT TEAM
  ======================================================= */

  const [editingTeam, setEditingTeam] = useState(null);

  const [editTeam, setEditTeam] = useState({
    name: '',
    short_name: '',
    logo_color: '#1e3a8a',
    is_own: false,
  });

  const [savingTeam, setSavingTeam] = useState(false);

  /* =======================================================
     PLAYER
  ======================================================= */

  const [newPlayer, setNewPlayer] = useState({
    name: '',
    role: 'batsman',
    jersey_no: '',
  });

  const [addingPlayer, setAddingPlayer] = useState(false);
  const [deletingPlayer, setDeletingPlayer] = useState(null);

  const [playerSearch, setPlayerSearch] = useState('');
  const [playerRoleFilter, setPlayerRoleFilter] = useState('all');

  /* =======================================================
     DELETE
  ======================================================= */

  const [deletingTeam, setDeletingTeam] = useState(null);

  /* =======================================================
     HELPERS
  ======================================================= */

  const getErrorMessage = (
    error,
    fallback = 'Something went wrong'
  ) => {

    return (
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      fallback
    );
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

  const getRoleIcon = (role) => {

    switch (role) {

      case 'batsman':
        return '🏏';

      case 'bowler':
        return '⚡';

      case 'all-rounder':
        return '⭐';

      case 'wicketkeeper':
        return '🧤';

      default:
        return '👤';
    }
  };

  /* =======================================================
     LOAD TEAMS
  ======================================================= */

  const refresh = async (
    showLoader = true
  ) => {

    if (showLoader) {
      setLoadingTeams(true);
    }

    try {

      const data =
        await Teams.list();

      setTeams(
        Array.isArray(data)
          ? data
          : []
      );

    } catch (error) {

      console.error(
        'Failed to load teams:',
        error
      );

      alert(
        getErrorMessage(
          error,
          'Failed to load teams'
        )
      );

    } finally {

      if (showLoader) {
        setLoadingTeams(false);
      }
    }
  };

  useEffect(() => {

    refresh();

  }, []);

  /* =======================================================
     REFRESH BUTTON
  ======================================================= */

  const handleRefresh = async () => {

    if (refreshing) return;

    setRefreshing(true);

    try {

      await refresh(false);

      if (selectedTeam?.id) {
        await openTeam(
          selectedTeam.id,
          false
        );
      }

    } finally {

      setRefreshing(false);
    }
  };

  /* =======================================================
     OPEN TEAM
  ======================================================= */

  const openTeam = async (
    id,
    showLoading = true
  ) => {

    if (showLoading) {
      setLoadingTeam(true);
    }

    try {

      const data =
        await Teams.get(id);

      setSelectedTeam(data);

      setPlayerSearch('');
      setPlayerRoleFilter('all');

    } catch (error) {

      console.error(
        'Failed to load team:',
        error
      );

      alert(
        getErrorMessage(
          error,
          'Failed to load team'
        )
      );

    } finally {

      if (showLoading) {
        setLoadingTeam(false);
      }
    }
  };

  /* =======================================================
     TEAM FILTER
  ======================================================= */

  const filteredTeams = useMemo(() => {

    const query =
      search
        .trim()
        .toLowerCase();

    return teams.filter((team) => {

      const matchesSearch =
        !query ||
        team.name
          ?.toLowerCase()
          .includes(query) ||
        team.short_name
          ?.toLowerCase()
          .includes(query);

      const matchesOwn =
        !showOwnOnly ||
        Boolean(team.is_own);

      return (
        matchesSearch &&
        matchesOwn
      );
    });

  }, [
    teams,
    search,
    showOwnOnly,
  ]);

  /* =======================================================
     TEAM STATISTICS
  ======================================================= */

  const totalPlayers = useMemo(() => {

    return teams.reduce(
      (total, team) =>
        total +
        Number(
          team.player_count || 0
        ),
      0
    );

  }, [teams]);

  const ownTeamsCount = useMemo(() => {

    return teams.filter(
      (team) =>
        Boolean(team.is_own)
    ).length;

  }, [teams]);

  /* =======================================================
     CREATE TEAM
  ======================================================= */

  const createTeam = async (e) => {

    e.preventDefault();

    const teamName =
      newTeam.name.trim();

    const shortName =
      newTeam.short_name
        .trim()
        .toUpperCase();

    if (!teamName) {

      alert(
        'Enter a team name'
      );

      return;
    }

    if (!shortName) {

      alert(
        'Enter a short team code'
      );

      return;
    }

    if (shortName.length > 10) {

      alert(
        'Short code must be 10 characters or less'
      );

      return;
    }

    setCreatingTeam(true);

    try {

      const created =
        await Teams.create({
          ...newTeam,

          name:
            teamName,

          short_name:
            shortName,
        });

      setNewTeam({
        name: '',
        short_name: '',
        logo_color: '#1e3a8a',
        is_own: false,
      });

      await refresh(false);

      if (created?.id) {
        await openTeam(
          created.id,
          false
        );
      }

    } catch (error) {

      console.error(
        'Create team error:',
        error
      );

      alert(
        getErrorMessage(
          error,
          'Failed to create team'
        )
      );

    } finally {

      setCreatingTeam(false);
    }
  };

  /* =======================================================
     START EDIT
  ======================================================= */

  const startEditTeam = (
    team,
    e
  ) => {

    e?.stopPropagation();

    setEditingTeam(team);

    setEditTeam({
      name:
        team.name || '',

      short_name:
        team.short_name || '',

      logo_color:
        team.logo_color ||
        '#1e3a8a',

      is_own:
        Boolean(team.is_own),
    });
  };

  /* =======================================================
     CANCEL EDIT
  ======================================================= */

  const cancelEdit = () => {

    if (savingTeam) return;

    setEditingTeam(null);

    setEditTeam({
      name: '',
      short_name: '',
      logo_color: '#1e3a8a',
      is_own: false,
    });
  };

  /* =======================================================
     SAVE TEAM
  ======================================================= */

  const saveTeam = async (e) => {

    e.preventDefault();

    if (!editingTeam) return;

    const name =
      editTeam.name.trim();

    const shortName =
      editTeam.short_name
        .trim()
        .toUpperCase();

    if (!name) {

      alert(
        'Enter a team name'
      );

      return;
    }

    if (!shortName) {

      alert(
        'Enter a short team code'
      );

      return;
    }

    setSavingTeam(true);

    try {

      await Teams.update(
        editingTeam.id,
        {
          ...editTeam,

          name,

          short_name:
            shortName,
        }
      );

      setEditingTeam(null);

      await refresh(false);

      await openTeam(
        editingTeam.id,
        false
      );

    } catch (error) {

      console.error(
        'Update team error:',
        error
      );

      alert(
        getErrorMessage(
          error,
          'Failed to update team'
        )
      );

    } finally {

      setSavingTeam(false);
    }
  };

  /* =======================================================
     TOGGLE OWN TEAM
  ======================================================= */

  const toggleOwn = async (
    team,
    e
  ) => {

    e?.stopPropagation();

    try {

      await Teams.update(
        team.id,
        {
          is_own:
            !team.is_own,
        }
      );

      await refresh(false);

      if (
        selectedTeam?.id === team.id
      ) {

        await openTeam(
          team.id,
          false
        );
      }

    } catch (error) {

      console.error(
        'Toggle own team error:',
        error
      );

      alert(
        getErrorMessage(
          error,
          'Failed to update team'
        )
      );
    }
  };

  /* =======================================================
     ADD PLAYER
  ======================================================= */

  const addPlayer = async (e) => {

    e.preventDefault();

    if (!selectedTeam) {

      alert(
        'Select a team first'
      );

      return;
    }

    const playerName =
      newPlayer.name.trim();

    if (!playerName) {

      alert(
        'Enter player name'
      );

      return;
    }

    setAddingPlayer(true);

    try {

      await Players.create({
        ...newPlayer,

        name:
          playerName,

        team_id:
          selectedTeam.id,

        jersey_no:
          newPlayer.jersey_no === ''
            ? null
            : newPlayer.jersey_no,
      });

      setNewPlayer({
        name: '',
        role: 'batsman',
        jersey_no: '',
      });

      await openTeam(
        selectedTeam.id,
        false
      );

      await refresh(false);

    } catch (error) {

      console.error(
        'Add player error:',
        error
      );

      alert(
        getErrorMessage(
          error,
          'Failed to add player'
        )
      );

    } finally {

      setAddingPlayer(false);
    }
  };

  /* =======================================================
     REMOVE PLAYER
  ======================================================= */

  const removePlayer = async (
    id
  ) => {

    if (!selectedTeam) return;

    const player =
      selectedTeam.players?.find(
        (p) =>
          p.id === id
      );

    const confirmed =
      window.confirm(
        `Remove ${
          player?.name ||
          'this player'
        } from ${
          selectedTeam.name
        }?\n\nThis removes the player from the team.`
      );

    if (!confirmed) return;

    setDeletingPlayer(id);

    try {

      await Players.remove(id);

      await openTeam(
        selectedTeam.id,
        false
      );

      await refresh(false);

    } catch (error) {

      console.error(
        'Remove player error:',
        error
      );

      alert(
        getErrorMessage(
          error,
          'Failed to remove player'
        )
      );

    } finally {

      setDeletingPlayer(null);
    }
  };

  /* =======================================================
     DELETE TEAM
  ======================================================= */

  const removeTeam = async (
    id
  ) => {

    const team =
      teams.find(
        (t) =>
          t.id === id
      );

    if (!team) return;

    const playerCount =
      Number(
        team.player_count || 0
      );

    const confirmed =
      window.confirm(
        `Delete "${team.name}"?\n\n` +
        `Players: ${playerCount}\n\n` +
        `The team and its players will be permanently removed if the team has no match history.\n\n` +
        `This action cannot be undone.`
      );

    if (!confirmed) return;

    setDeletingTeam(id);

    try {

      await Teams.remove(id);

      if (
        selectedTeam?.id === id
      ) {

        setSelectedTeam(null);
      }

      await refresh(false);

    } catch (error) {

      console.error(
        'Delete team error:',
        error
      );

      const response =
        error?.response?.data;

      let message =
        getErrorMessage(
          error,
          'Failed to delete team'
        );

      /*
       * More useful message for
       * historical teams.
       */

      if (
        response?.protected &&
        response?.reason ===
          'historical_data'
      ) {

        message =
          `${response.team_name || team.name} cannot be deleted because it has historical match data.\n\n` +
          `Matches: ${
            response.matches_count || 0
          }\n` +
          `Innings: ${
            response.innings_count || 0
          }`;
      }

      alert(message);

    } finally {

      setDeletingTeam(null);
    }
  };

  /* =======================================================
     PLAYER FILTER
  ======================================================= */

  const filteredPlayers = useMemo(() => {

    const players =
      selectedTeam?.players || [];

    const query =
      playerSearch
        .trim()
        .toLowerCase();

    return players.filter(
      (player) => {

        const matchesSearch =
          !query ||
          player.name
            ?.toLowerCase()
            .includes(query) ||
          String(
            player.jersey_no ?? ''
          ).includes(query);

        const matchesRole =
          playerRoleFilter === 'all' ||
          player.role ===
            playerRoleFilter;

        return (
          matchesSearch &&
          matchesRole
        );
      }
    );

  }, [
    selectedTeam,
    playerSearch,
    playerRoleFilter,
  ]);

  /* =======================================================
     ROLE COUNTS
  ======================================================= */

  const roleCounts = useMemo(() => {

    const players =
      selectedTeam?.players || [];

    return {
      all:
        players.length,

      batsman:
        players.filter(
          (p) =>
            p.role === 'batsman'
        ).length,

      bowler:
        players.filter(
          (p) =>
            p.role === 'bowler'
        ).length,

      'all-rounder':
        players.filter(
          (p) =>
            p.role === 'all-rounder'
        ).length,

      wicketkeeper:
        players.filter(
          (p) =>
            p.role === 'wicketkeeper'
        ).length,
    };

  }, [selectedTeam]);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="max-w-7xl mx-auto fade-in pb-10">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <div className="mb-5 sm:mb-6">

        <div className="flex items-start justify-between gap-3">

          <div className="min-w-0">

            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
              Team Management
            </p>

            <h1 className="text-2xl sm:text-4xl font-bold text-white">
              Manage Teams
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl">
              Create teams, manage squads, and organize your
              cricket scoreboard.
            </p>

          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex-shrink-0 w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 text-lg hover:border-emerald-500/40 transition disabled:opacity-50"
            title="Refresh"
          >
            {refreshing ? '⏳' : '🔄'}
          </button>

        </div>

      </div>

      {/* ===================================================
          QUICK STATS
      ==================================================== */}

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-3 sm:p-4">

          <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">
            Teams
          </p>

          <p className="text-xl sm:text-2xl font-bold text-white mt-1">
            {teams.length}
          </p>

        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-3 sm:p-4">

          <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wide">
            Players
          </p>

          <p className="text-xl sm:text-2xl font-bold text-white mt-1">
            {totalPlayers}
          </p>

        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-4">

          <p className="text-[10px] sm:text-xs text-emerald-400 uppercase tracking-wide">
            My Teams
          </p>

          <p className="text-xl sm:text-2xl font-bold text-white mt-1">
            {ownTeamsCount}
          </p>

        </div>

      </div>

      {/* ===================================================
          MAIN
      ==================================================== */}

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5">

        {/* =================================================
            LEFT
        ================================================== */}

        <div className="space-y-4">

          {/* =================================================
              CREATE TEAM
          ================================================== */}

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

              {/* NAME */}

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
                      name:
                        e.target.value,
                    })
                  }
                />

              </div>

              {/* SHORT CODE */}

              <div>

                <div className="flex items-center justify-between">

                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Short code
                  </label>

                  <span className="text-[10px] text-slate-600">
                    {newTeam.short_name.length}/10
                  </span>

                </div>

                <input
                  className="input w-full uppercase"
                  placeholder="GCC"
                  maxLength={10}
                  value={newTeam.short_name}
                  onChange={(e) =>
                    setNewTeam({
                      ...newTeam,
                      short_name:
                        e.target.value
                          .toUpperCase()
                          .replace(
                            /\s/g,
                            ''
                          ),
                    })
                  }
                />

              </div>

              {/* COLOR */}

              <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3">

                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Team color
                </label>

                <div className="flex items-center gap-3">

                  <input
                    type="color"
                    value={
                      newTeam.logo_color
                    }
                    onChange={(e) =>
                      setNewTeam({
                        ...newTeam,
                        logo_color:
                          e.target.value,
                      })
                    }
                    className="w-12 h-12 rounded-xl cursor-pointer bg-transparent border-0"
                  />

                  <div className="flex-1">

                    <div className="flex items-center gap-2">

                      <div
                        className="w-7 h-7 rounded-lg"
                        style={{
                          background:
                            newTeam.logo_color,
                        }}
                      />

                      <span className="text-sm text-white font-medium">
                        Team identity
                      </span>

                    </div>

                    <p className="text-[11px] text-slate-500 mt-1">
                      Used for the team badge
                    </p>

                  </div>

                </div>

              </div>

              {/* MY TEAM */}

              <label className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-3 cursor-pointer hover:border-emerald-500/40 transition">

                <input
                  type="checkbox"
                  checked={
                    newTeam.is_own
                  }
                  onChange={(e) =>
                    setNewTeam({
                      ...newTeam,
                      is_own:
                        e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-emerald-500"
                />

                <div className="flex-1">

                  <p className="text-sm text-white font-medium">
                    ⭐ My team
                  </p>

                  <p className="text-[11px] text-slate-500">
                    Include this team in your personal statistics
                  </p>

                </div>

              </label>

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

          {/* =================================================
              TEAM LIST
          ================================================== */}

          <div className="card !p-0 overflow-hidden border border-slate-700/60">

            {/* HEADER */}

            <div className="p-4 border-b border-slate-700/60">

              <div className="flex items-center justify-between gap-3 mb-3">

                <div>

                  <h2 className="font-bold text-white">
                    Your Teams
                  </h2>

                  <p className="text-xs text-slate-500 mt-0.5">
                    {filteredTeams.length} shown
                    {teams.length !== filteredTeams.length &&
                      ` · ${teams.length} total`}
                  </p>

                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowOwnOnly(
                      !showOwnOnly
                    )
                  }
                  className={`
                    px-3 py-2 rounded-xl text-xs font-semibold border transition
                    ${
                      showOwnOnly
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }
                  `}
                >
                  ⭐ Mine
                </button>

              </div>

              {/* SEARCH */}

              {teams.length > 0 && (

                <div className="relative">

                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    🔍
                  </span>

                  <input
                    className="input w-full pl-10 pr-10"
                    placeholder="Search team name or code..."
                    value={search}
                    onChange={(e) =>
                      setSearch(
                        e.target.value
                      )
                    }
                  />

                  {search && (

                    <button
                      type="button"
                      onClick={() =>
                        setSearch('')
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      ×
                    </button>

                  )}

                </div>

              )}

            </div>

            {/* TEAM LIST */}

            <div className="p-3 space-y-2">

              {loadingTeams ? (

                <div className="py-12 text-center">

                  <div className="text-2xl mb-3">
                    ⏳
                  </div>

                  <p className="text-sm text-slate-500">
                    Loading teams…
                  </p>

                </div>

              ) : (

                filteredTeams.map(
                  (team) => {

                    const isSelected =
                      selectedTeam?.id ===
                      team.id;

                    const playerCount =
                      Number(
                        team.player_count ??
                        team.players?.length ??
                        0
                      );

                    return (

                      <div
                        key={team.id}
                        onClick={() =>
                          openTeam(
                            team.id
                          )
                        }
                        className={`
                          group rounded-2xl border p-3
                          cursor-pointer transition-all
                          active:scale-[0.99]
                          ${
                            isSelected
                              ? 'border-emerald-500/70 bg-emerald-500/5'
                              : 'border-slate-700/70 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-800/40'
                          }
                        `}
                      >

                        <div className="flex items-center gap-3">

                          {/* BADGE */}

                          <div
                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex-shrink-0 flex items-center justify-center text-white font-black text-[10px] sm:text-xs shadow-lg"
                            style={{
                              background:
                                team.logo_color ||
                                '#1e3a8a',
                            }}
                          >
                            {team.short_name ||
                              'TEAM'}
                          </div>

                          {/* INFO */}

                          <div className="min-w-0 flex-1">

                            <div className="flex items-center gap-2 flex-wrap">

                              <h3 className="font-bold text-white truncate">
                                {team.name}
                              </h3>

                              {team.is_own && (

                                <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400">
                                  ⭐ Mine
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
                                👥 {playerCount}
                              </span>

                            </div>

                          </div>

                          <div className="text-slate-600 group-hover:text-emerald-400 transition text-xl">
                            ›
                          </div>

                        </div>

                        {/* ACTIONS */}

                        <div
                          className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800"
                          onClick={(e) =>
                            e.stopPropagation()
                          }
                        >

                          <button
                            type="button"
                            onClick={() =>
                              openTeam(
                                team.id
                              )
                            }
                            className="min-h-[42px] rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold hover:text-white transition"
                          >
                            👥 Squad
                          </button>

                          <button
                            type="button"
                            onClick={(e) =>
                              startEditTeam(
                                team,
                                e
                              )
                            }
                            className="min-h-[42px] rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold hover:text-emerald-400 transition"
                          >
                            ✏️ Edit
                          </button>

                          <button
                            type="button"
                            disabled={
                              deletingTeam ===
                              team.id
                            }
                            onClick={() =>
                              removeTeam(
                                team.id
                              )
                            }
                            className="min-h-[42px] rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition disabled:opacity-50"
                          >
                            {deletingTeam ===
                            team.id
                              ? '…'
                              : '🗑 Delete'}
                          </button>

                        </div>

                        {/* OWN SWITCH */}

                        <button
                          type="button"
                          onClick={(e) =>
                            toggleOwn(
                              team,
                              e
                            )
                          }
                          className={`
                            w-full mt-2 min-h-[38px] rounded-xl text-xs font-medium transition
                            ${
                              team.is_own
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-slate-900 border border-slate-800 text-slate-500 hover:text-emerald-400'
                            }
                          `}
                        >
                          {team.is_own
                            ? '⭐ This is my team'
                            : '☆ Mark as my team'}
                        </button>

                      </div>
                    );
                  }
                )
              )}

              {!loadingTeams &&
                filteredTeams.length === 0 && (

                  <div className="py-10 px-5 text-center">

                    <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800 flex items-center justify-center text-3xl mb-4">
                      🏏
                    </div>

                    <h3 className="font-semibold text-white">
                      {search || showOwnOnly
                        ? 'No teams found'
                        : 'No teams yet'}
                    </h3>

                    <p className="text-xs text-slate-500 mt-1">
                      {search
                        ? 'Try another team name or short code.'
                        : showOwnOnly
                        ? 'No team is marked as your team.'
                        : 'Create your first team above.'}
                    </p>

                  </div>
                )}

            </div>

          </div>

        </div>

        {/* =================================================
            RIGHT — SELECTED TEAM
        ================================================== */}

        <div className="space-y-4">

          {!selectedTeam ? (

            <div className="card min-h-[360px] lg:min-h-[520px] flex flex-col items-center justify-center text-center border border-slate-700/60 p-6">

              <div className="w-20 h-20 rounded-3xl bg-slate-800 border border-slate-700 flex items-center justify-center text-4xl mb-5">
                👥
              </div>

              <h2 className="text-xl font-bold text-white">
                Select a Team
              </h2>

              <p className="text-sm text-slate-500 max-w-sm mt-2">
                Select a team to manage its squad and
                players.
              </p>

            </div>

          ) : (

            <>

              {/* =================================================
                  TEAM PROFILE
              ================================================== */}

              <div
                className="rounded-3xl p-4 sm:p-6 border border-slate-700/60 overflow-hidden relative"
                style={{
                  background:
                    `linear-gradient(135deg, ${
                      selectedTeam.logo_color ||
                      '#1e3a8a'
                    }22, rgba(15,23,42,0.96))`,
                }}
              >

                <div
                  className="absolute right-0 top-0 w-40 h-40 rounded-full blur-3xl opacity-20"
                  style={{
                    background:
                      selectedTeam.logo_color ||
                      '#1e3a8a',
                  }}
                />

                <div className="relative">

                  <div className="flex items-center gap-4">

                    <div
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center text-white font-black text-xs sm:text-base shadow-xl flex-shrink-0"
                      style={{
                        background:
                          selectedTeam.logo_color ||
                          '#1e3a8a',
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
                        {selectedTeam.short_name}
                        {' · '}
                        {selectedTeam.players?.length || 0}
                        {' '}
                        players
                      </p>

                    </div>

                  </div>

                  {/* TEAM ACTIONS */}

                  <div className="grid grid-cols-2 gap-2 mt-4">

                    <button
                      type="button"
                      onClick={() =>
                        startEditTeam(
                          selectedTeam
                        )
                      }
                      className="min-h-[42px] rounded-xl bg-slate-900/70 border border-slate-700 text-slate-300 text-xs font-semibold hover:text-emerald-400 transition"
                    >
                      ✏️ Edit Team
                    </button>

                    <button
                      type="button"
                      disabled={
                        deletingTeam ===
                        selectedTeam.id
                      }
                      onClick={() =>
                        removeTeam(
                          selectedTeam.id
                        )
                      }
                      className="min-h-[42px] rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition disabled:opacity-50"
                    >
                      {deletingTeam ===
                      selectedTeam.id
                        ? 'Deleting…'
                        : '🗑 Delete Team'}
                    </button>

                  </div>

                </div>

              </div>

              {/* =================================================
                  EDIT TEAM
              ================================================== */}

              {editingTeam && (
                <form
                  onSubmit={saveTeam}
                  className="card !p-4 sm:!p-5 border border-emerald-500/20"
                >

                  <div className="flex items-center justify-between gap-3 mb-4">

                    <div>

                      <h2 className="font-bold text-white">
                        Edit Team
                      </h2>

                      <p className="text-xs text-slate-500 mt-1">
                        Update team information
                      </p>

                    </div>

                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                    >
                      ×
                    </button>

                  </div>

                  <div className="space-y-3">

                    <input
                      className="input w-full"
                      placeholder="Team name"
                      value={
                        editTeam.name
                      }
                      onChange={(e) =>
                        setEditTeam({
                          ...editTeam,
                          name:
                            e.target.value,
                        })
                      }
                    />

                    <input
                      className="input w-full uppercase"
                      placeholder="Short code"
                      maxLength={10}
                      value={
                        editTeam.short_name
                      }
                      onChange={(e) =>
                        setEditTeam({
                          ...editTeam,
                          short_name:
                            e.target.value
                              .toUpperCase()
                              .replace(
                                /\s/g,
                                ''
                              ),
                        })
                      }
                    />

                    <div className="flex items-center gap-3">

                      <input
                        type="color"
                        value={
                          editTeam.logo_color
                        }
                        onChange={(e) =>
                          setEditTeam({
                            ...editTeam,
                            logo_color:
                              e.target.value,
                          })
                        }
                        className="w-11 h-11 rounded-xl bg-transparent border-0"
                      />

                      <span className="text-xs text-slate-400">
                        Team color
                      </span>

                    </div>

                    <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">

                      <input
                        type="checkbox"
                        checked={
                          editTeam.is_own
                        }
                        onChange={(e) =>
                          setEditTeam({
                            ...editTeam,
                            is_own:
                              e.target.checked,
                          })
                        }
                        className="w-5 h-5 accent-emerald-500"
                      />

                      <span className="text-sm text-white">
                        ⭐ My team
                      </span>

                    </label>

                    <div className="grid grid-cols-2 gap-2">

                      <button
                        type="button"
                        onClick={
                          cancelEdit
                        }
                        disabled={
                          savingTeam
                        }
                        className="min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        disabled={
                          savingTeam
                        }
                        className="btn btn-primary !py-3"
                      >
                        {savingTeam
                          ? 'Saving…'
                          : 'Save Changes'}
                      </button>

                    </div>

                  </div>

                </form>
              )}

              {/* =================================================
                  SQUAD
              ================================================== */}

              <div className="card !p-0 overflow-hidden border border-slate-700/60">

                <div className="p-4 sm:p-5 border-b border-slate-700/60">

                  <div className="flex items-center justify-between gap-3">

                    <div>

                      <h2 className="font-bold text-white">
                        Squad
                      </h2>

                      <p className="text-xs text-slate-500 mt-1">
                        {selectedTeam.players?.length || 0}
                        {' '}
                        registered
                      </p>

                    </div>

                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg">
                      👥
                    </div>

                  </div>

                  {/* ROLE SUMMARY */}

                  <div className="grid grid-cols-4 gap-1.5 mt-4">

                    <button
                      type="button"
                      onClick={() =>
                        setPlayerRoleFilter(
                          'all'
                        )
                      }
                      className={`
                        rounded-xl p-2 text-center border
                        ${
                          playerRoleFilter ===
                          'all'
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-900'
                        }
                      `}
                    >
                      <p className="text-sm font-bold text-white">
                        {roleCounts.all}
                      </p>
                      <p className="text-[9px] text-slate-500">
                        All
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPlayerRoleFilter(
                          'batsman'
                        )
                      }
                      className={`
                        rounded-xl p-2 text-center border
                        ${
                          playerRoleFilter ===
                          'batsman'
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-900'
                        }
                      `}
                    >
                      <p className="text-sm font-bold text-white">
                        {roleCounts.batsman}
                      </p>
                      <p className="text-[9px] text-slate-500">
                        Bat
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPlayerRoleFilter(
                          'bowler'
                        )
                      }
                      className={`
                        rounded-xl p-2 text-center border
                        ${
                          playerRoleFilter ===
                          'bowler'
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-900'
                        }
                      `}
                    >
                      <p className="text-sm font-bold text-white">
                        {roleCounts.bowler}
                      </p>
                      <p className="text-[9px] text-slate-500">
                        Bowl
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPlayerRoleFilter(
                          'all-rounder'
                        )
                      }
                      className={`
                        rounded-xl p-2 text-center border
                        ${
                          playerRoleFilter ===
                          'all-rounder'
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-900'
                        }
                      `}
                    >
                      <p className="text-sm font-bold text-white">
                        {roleCounts['all-rounder']}
                      </p>
                      <p className="text-[9px] text-slate-500">
                        AR
                      </p>
                    </button>

                  </div>

                  {/* PLAYER SEARCH */}

                  {selectedTeam.players?.length > 0 && (

                    <div className="relative mt-3">

                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        🔍
                      </span>

                      <input
                        className="input w-full pl-10 pr-10"
                        placeholder="Search players..."
                        value={
                          playerSearch
                        }
                        onChange={(e) =>
                          setPlayerSearch(
                            e.target.value
                          )
                        }
                      />

                      {playerSearch && (

                        <button
                          type="button"
                          onClick={() =>
                            setPlayerSearch(
                              ''
                            )
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                        >
                          ×
                        </button>

                      )}

                    </div>

                  )}

                </div>

                {/* PLAYERS */}

                {loadingTeam ? (

                  <div className="p-10 text-center">

                    <div className="text-2xl mb-3">
                      ⏳
                    </div>

                    <p className="text-sm text-slate-500">
                      Loading squad…
                    </p>

                  </div>

                ) : (

                  <div className="p-3 space-y-2">

                    {filteredPlayers.map(
                      (player) => (

                        <div
                          key={player.id}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition"
                        >

                          {/* JERSEY */}

                          <div
                            className="w-11 h-11 rounded-xl border border-slate-700 flex items-center justify-center flex-shrink-0"
                            style={{
                              background:
                                `${selectedTeam.logo_color || '#1e3a8a'}18`,
                            }}
                          >

                            <span className="text-sm font-bold text-white">
                              #
                              {player.jersey_no ??
                                '-'}
                            </span>

                          </div>

                          {/* PLAYER */}

                          <div className="min-w-0 flex-1">

                            <p className="font-semibold text-sm text-white truncate">
                              {player.name}
                            </p>

                            <div className="flex items-center gap-1.5 mt-0.5">

                              <span className="text-xs">
                                {getRoleIcon(
                                  player.role
                                )}
                              </span>

                              <span className="text-xs text-slate-500">
                                {getRoleLabel(
                                  player.role
                                )}
                              </span>

                            </div>

                          </div>

                          {/* REMOVE */}

                          <button
                            type="button"
                            disabled={
                              deletingPlayer ===
                              player.id
                            }
                            onClick={() =>
                              removePlayer(
                                player.id
                              )
                            }
                            className="min-h-[40px] px-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition disabled:opacity-50"
                          >
                            {deletingPlayer ===
                            player.id
                              ? '…'
                              : 'Remove'}
                          </button>

                        </div>

                      )
                    )}

                    {filteredPlayers.length ===
                      0 && (

                      <div className="py-8 text-center">

                        <div className="text-3xl mb-2">
                          👤
                        </div>

                        <p className="text-sm font-medium text-slate-300">
                          {selectedTeam.players?.length
                            ? 'No matching players'
                            : 'No players yet'}
                        </p>

                        <p className="text-xs text-slate-500 mt-1">
                          {selectedTeam.players?.length
                            ? 'Try another search or role.'
                            : 'Add your first player below.'}
                        </p>

                      </div>
                    )}

                  </div>

                )}

              </div>

              {/* =================================================
                  ADD PLAYER
              ================================================== */}

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
                      Add a player to{' '}
                      {selectedTeam.name}
                    </p>

                  </div>

                </div>

                <div className="space-y-3">

                  <input
                    className="input w-full"
                    placeholder="Player name"
                    value={
                      newPlayer.name
                    }
                    onChange={(e) =>
                      setNewPlayer({
                        ...newPlayer,
                        name:
                          e.target.value,
                      })
                    }
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                    <select
                      className="input w-full"
                      value={
                        newPlayer.role
                      }
                      onChange={(e) =>
                        setNewPlayer({
                          ...newPlayer,
                          role:
                            e.target.value,
                        })
                      }
                    >

                      <option value="batsman">
                        🏏 Batsman
                      </option>

                      <option value="bowler">
                        ⚡ Bowler
                      </option>

                      <option value="all-rounder">
                        ⭐ All-rounder
                      </option>

                      <option value="wicketkeeper">
                        🧤 Wicketkeeper
                      </option>

                    </select>

                    <input
                      className="input w-full"
                      type="number"
                      min="0"
                      max="999"
                      placeholder="Jersey number"
                      value={
                        newPlayer.jersey_no
                      }
                      onChange={(e) =>
                        setNewPlayer({
                          ...newPlayer,
                          jersey_no:
                            e.target.value,
                        })
                      }
                    />

                  </div>

                  <button
                    type="submit"
                    disabled={
                      addingPlayer
                    }
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
