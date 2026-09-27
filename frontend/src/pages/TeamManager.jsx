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
     EDIT TEAM MODAL
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
     SQUAD MODAL
  ======================================================= */

  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showSquadModal, setShowSquadModal] = useState(false);

  const [playerSearch, setPlayerSearch] = useState('');
  const [playerRoleFilter, setPlayerRoleFilter] =
    useState('all');

  /* =======================================================
     ADD PLAYER MODAL
  ======================================================= */

  const [showAddPlayerModal, setShowAddPlayerModal] =
    useState(false);

  const [newPlayer, setNewPlayer] = useState({
    name: '',
    role: 'batsman',
  });

  const [addingPlayer, setAddingPlayer] = useState(false);

  /* =======================================================
     DELETE
  ======================================================= */

  const [deletingTeam, setDeletingTeam] = useState(null);
  const [deletingPlayer, setDeletingPlayer] = useState(null);

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

  const refresh = async (showLoader = true) => {

    if (showLoader) {
      setLoadingTeams(true);
    }

    try {

      const data = await Teams.list();

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
     REFRESH
  ======================================================= */

  const handleRefresh = async () => {

    if (refreshing) return;

    setRefreshing(true);

    try {
      await refresh(false);

      if (selectedTeam?.id) {

        const data =
          await Teams.get(
            selectedTeam.id
          );

        setSelectedTeam(data);
      }

    } catch (error) {

      console.error(
        'Refresh error:',
        error
      );

    } finally {

      setRefreshing(false);
    }
  };

  /* =======================================================
     OPEN SQUAD
  ======================================================= */

  const openSquad = async (id) => {

    setLoadingTeam(true);
    setShowSquadModal(true);

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

      setShowSquadModal(false);

      alert(
        getErrorMessage(
          error,
          'Failed to load squad'
        )
      );

    } finally {

      setLoadingTeam(false);
    }
  };

  /* =======================================================
     CLOSE SQUAD
  ======================================================= */

  const closeSquad = () => {

    if (addingPlayer) return;

    setShowSquadModal(false);
    setShowAddPlayerModal(false);
    setSelectedTeam(null);
    setPlayerSearch('');
    setPlayerRoleFilter('all');
  };

  /* =======================================================
     FILTER TEAMS
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
     STATISTICS
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

        await openSquad(
          created.id
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
     OPEN EDIT MODAL
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
     CLOSE EDIT
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

    if (shortName.length > 10) {

      alert(
        'Short code must be 10 characters or less'
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

      const editedId =
        editingTeam.id;

      setEditingTeam(null);

      await refresh(false);

      /*
       * If the squad modal is open
       * for this team, refresh it.
       */

      if (
        selectedTeam?.id ===
        editedId
      ) {

        const updated =
          await Teams.get(
            editedId
          );

        setSelectedTeam(updated);
      }

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
        selectedTeam?.id ===
        team.id
      ) {

        const updated =
          await Teams.get(
            team.id
          );

        setSelectedTeam(updated);
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
     OPEN ADD PLAYER
  ======================================================= */

  const openAddPlayer = () => {

    setNewPlayer({
      name: '',
      role: 'batsman',
    });

    setShowAddPlayerModal(true);
  };

  /* =======================================================
     CLOSE ADD PLAYER
  ======================================================= */

  const closeAddPlayer = () => {

    if (addingPlayer) return;

    setShowAddPlayerModal(false);
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

      /*
       * Jersey number has been
       * completely removed.
       */

      await Players.create({
        name:
          playerName,

        role:
          newPlayer.role,

        team_id:
          selectedTeam.id,
      });

      setNewPlayer({
        name: '',
        role: 'batsman',
      });

      setShowAddPlayerModal(false);

      const updated =
        await Teams.get(
          selectedTeam.id
        );

      setSelectedTeam(updated);

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

      const updated =
        await Teams.get(
          selectedTeam.id
        );

      setSelectedTeam(updated);

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
        setShowSquadModal(false);
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
          }\n\n` +
          `The historical score data is protected.`;
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
            .includes(query);

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
     ROLE BUTTON
  ======================================================= */

  const roleButton = (
    key,
    label
  ) => {

    return (
      <button
        type="button"
        onClick={() =>
          setPlayerRoleFilter(key)
        }
        className={`
          rounded-xl p-2 text-center border
          transition active:scale-95
          ${
            playerRoleFilter === key
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-slate-800 bg-slate-900'
          }
        `}
      >

        <p className="text-sm font-bold text-white">
          {roleCounts[key]}
        </p>

        <p className="text-[9px] text-slate-500">
          {label}
        </p>

      </button>
    );
  };

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
              Create teams and manage your cricket squads easily.
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
            LEFT SIDE
        ================================================== */}

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
                  Add a new team
                </p>

              </div>

              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-lg">
                ➕
              </div>

            </div>

            <div className="space-y-3">

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

              <label className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-3 cursor-pointer">

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
                    Mark this as your team
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

            <div className="p-4 border-b border-slate-700/60">

              <div className="flex items-center justify-between gap-3 mb-3">

                <div>

                  <h2 className="font-bold text-white">
                    Your Teams
                  </h2>

                  <p className="text-xs text-slate-500 mt-0.5">
                    {filteredTeams.length} shown
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

              {teams.length > 0 && (

                <div className="relative">

                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    🔍
                  </span>

                  <input
                    className="input w-full pl-10 pr-10"
                    placeholder="Search team..."
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

                    const playerCount =
                      Number(
                        team.player_count ??
                        team.players?.length ??
                        0
                      );

                    return (

                      <div
                        key={team.id}
                        className="rounded-2xl border border-slate-700/70 bg-slate-900/30 p-3 transition hover:border-slate-600"
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

                        </div>

                        {/* ACTION BUTTONS */}

                        <div className="grid grid-cols-3 gap-2 mt-3">

                          <button
                            type="button"
                            onClick={() =>
                              openSquad(
                                team.id
                              )
                            }
                            className="min-h-[44px] rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold active:scale-95 transition"
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
                            className="min-h-[44px] rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold active:scale-95 transition"
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
                            className="min-h-[44px] rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs font-semibold active:scale-95 transition disabled:opacity-50"
                          >
                            {deletingTeam ===
                            team.id
                              ? '…'
                              : '🗑 Delete'}
                          </button>

                        </div>

                        {/* MY TEAM */}

                        <button
                          type="button"
                          onClick={(e) =>
                            toggleOwn(
                              team,
                              e
                            )
                          }
                          className={`
                            w-full mt-2 min-h-[40px] rounded-xl text-xs font-medium transition
                            ${
                              team.is_own
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-slate-900 border border-slate-800 text-slate-500'
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
                        ? 'Try another search.'
                        : showOwnOnly
                        ? 'No team is marked as yours.'
                        : 'Create your first team above.'}
                    </p>

                  </div>
                )}

            </div>

          </div>

        </div>

        {/* =================================================
            RIGHT SIDE — DESKTOP INFO
        ================================================== */}

        <div className="hidden lg:block">

          <div className="card min-h-[500px] flex flex-col items-center justify-center text-center border border-slate-700/60 p-8">

            <div className="w-24 h-24 rounded-3xl bg-slate-800 border border-slate-700 flex items-center justify-center text-5xl mb-6">
              👥
            </div>

            <h2 className="text-2xl font-bold text-white">
              Manage Your Teams
            </h2>

            <p className="text-sm text-slate-500 max-w-md mt-3 leading-6">
              Use the Squad button to view players or
              Edit to update team details. Everything opens
              in a popup so the main page stays clean.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-7 w-full max-w-md">

              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">

                <div className="text-2xl mb-2">
                  👥
                </div>

                <p className="text-sm font-semibold text-white">
                  Squad
                </p>

                <p className="text-[11px] text-slate-500 mt-1">
                  Manage players
                </p>

              </div>

              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">

                <div className="text-2xl mb-2">
                  ✏️
                </div>

                <p className="text-sm font-semibold text-white">
                  Edit
                </p>

                <p className="text-[11px] text-slate-500 mt-1">
                  Update team
                </p>

              </div>

            </div>

          </div>

        </div>

      </div>

      {/* =====================================================
          EDIT TEAM MODAL
      ====================================================== */}

      {editingTeam && (

        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onMouseDown={(e) => {

            if (
              e.target === e.currentTarget &&
              !savingTeam
            ) {
              cancelEdit();
            }

          }}
        >

          <form
            onSubmit={saveTeam}
            className="w-full sm:max-w-md bg-slate-950 border border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          >

            {/* MODAL HEADER */}

            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">

              <div>

                <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                  Team Settings
                </p>

                <h2 className="text-xl font-bold text-white mt-1">
                  Edit Team
                </h2>

              </div>

              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingTeam}
                className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xl"
              >
                ×
              </button>

            </div>

            {/* MODAL BODY */}

            <div className="p-4 sm:p-5 space-y-4">

              <div>

                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Team name
                </label>

                <input
                  autoFocus
                  className="input w-full"
                  placeholder="Team name"
                  value={editTeam.name}
                  onChange={(e) =>
                    setEditTeam({
                      ...editTeam,
                      name:
                        e.target.value,
                    })
                  }
                />

              </div>

              <div>

                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Short code
                </label>

                <input
                  className="input w-full uppercase"
                  placeholder="GCC"
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

              </div>

              {/* COLOR */}

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">

                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Team color
                </label>

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
                    className="w-12 h-12 rounded-xl bg-transparent border-0 cursor-pointer"
                  />

                  <div
                    className="w-10 h-10 rounded-xl"
                    style={{
                      background:
                        editTeam.logo_color,
                    }}
                  />

                  <span className="text-sm text-slate-400">
                    Team badge color
                  </span>

                </div>

              </div>

              {/* MY TEAM */}

              <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 cursor-pointer">

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

                <div>

                  <p className="text-sm font-semibold text-white">
                    ⭐ My team
                  </p>

                  <p className="text-[11px] text-slate-500">
                    Mark this as your team
                  </p>

                </div>

              </label>

            </div>

            {/* MODAL FOOTER */}

            <div className="p-4 sm:p-5 border-t border-slate-800 grid grid-cols-2 gap-2">

              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingTeam}
                className="min-h-[48px] rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={savingTeam}
                className="btn btn-primary !py-3 font-semibold"
              >
                {savingTeam
                  ? 'Saving…'
                  : 'Save Changes'}
              </button>

            </div>

          </form>

        </div>

      )}

      {/* =====================================================
          SQUAD MODAL
      ====================================================== */}

      {showSquadModal && (

        <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">

          <div className="w-full sm:max-w-2xl max-h-[94vh] bg-slate-950 border border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">

            {/* =================================================
                SQUAD HEADER
            ================================================== */}

            <div className="flex-shrink-0 p-4 sm:p-5 border-b border-slate-800">

              <div className="flex items-center gap-3">

                {selectedTeam && (

                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xs flex-shrink-0"
                    style={{
                      background:
                        selectedTeam.logo_color ||
                        '#1e3a8a',
                    }}
                  >
                    {selectedTeam.short_name}
                  </div>

                )}

                <div className="min-w-0 flex-1">

                  <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                    Team Squad
                  </p>

                  <h2 className="text-xl font-bold text-white truncate">
                    {selectedTeam?.name ||
                      'Loading...'}
                  </h2>

                  {selectedTeam && (

                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedTeam.players?.length || 0}
                      {' '}
                      players
                    </p>

                  )}

                </div>

                <button
                  type="button"
                  onClick={closeSquad}
                  className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xl flex-shrink-0"
                >
                  ×
                </button>

              </div>

              {/* =================================================
                  LOADING
              ================================================== */}

              {loadingTeam ? (

                <div className="py-12 text-center">

                  <div className="text-3xl mb-3">
                    ⏳
                  </div>

                  <p className="text-sm text-slate-500">
                    Loading squad…
                  </p>

                </div>

              ) : selectedTeam ? (

                <>

                  {/* ROLE FILTERS */}

                  <div className="grid grid-cols-4 gap-1.5 mt-4">

                    {roleButton(
                      'all',
                      'All'
                    )}

                    {roleButton(
                      'batsman',
                      'Bat'
                    )}

                    {roleButton(
                      'bowler',
                      'Bowl'
                    )}

                    {roleButton(
                      'all-rounder',
                      'AR'
                    )}

                  </div>

                  {/* SEARCH */}

                  {selectedTeam.players?.length > 0 && (

                    <div className="relative mt-3">

                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                        🔍
                      </span>

                      <input
                        className="input w-full pl-10 pr-10"
                        placeholder="Search player..."
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
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                        >
                          ×
                        </button>

                      )}

                    </div>

                  )}

                </>

              ) : null}

            </div>

            {/* =================================================
                SQUAD CONTENT
            ================================================== */}

            {!loadingTeam &&
              selectedTeam && (

                <div className="flex-1 overflow-y-auto p-3 sm:p-4">

                  {filteredPlayers.length > 0 ? (

                    <div className="space-y-2">

                      {filteredPlayers.map(
                        (player) => (

                          <div
                            key={player.id}
                            className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/70 border border-slate-800"
                          >

                            {/* PLAYER ICON */}

                            <div
                              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{
                                background:
                                  `${selectedTeam.logo_color || '#1e3a8a'}18`,
                              }}
                            >
                              <span className="text-lg">
                                {getRoleIcon(
                                  player.role
                                )}
                              </span>
                            </div>

                            {/* PLAYER INFO */}

                            <div className="min-w-0 flex-1">

                              <p className="font-semibold text-sm text-white truncate">
                                {player.name}
                              </p>

                              <p className="text-xs text-slate-500 mt-0.5">
                                {getRoleLabel(
                                  player.role
                                )}
                              </p>

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
                              className="min-h-[40px] px-3 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-xs font-semibold active:scale-95 transition disabled:opacity-50"
                            >
                              {deletingPlayer ===
                              player.id
                                ? '…'
                                : 'Remove'}
                            </button>

                          </div>

                        )
                      )}

                    </div>

                  ) : (

                    <div className="py-10 text-center">

                      <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-3xl mb-4">
                        👤
                      </div>

                      <p className="text-sm font-semibold text-slate-300">
                        {selectedTeam.players?.length
                          ? 'No matching players'
                          : 'No players yet'}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {selectedTeam.players?.length
                          ? 'Try another search or filter.'
                          : 'Add a player to this squad.'}
                      </p>

                    </div>

                  )}

                </div>

              )}

            {/* =================================================
                SQUAD FOOTER
            ================================================== */}

            {!loadingTeam &&
              selectedTeam && (

                <div className="flex-shrink-0 p-3 sm:p-4 border-t border-slate-800 bg-slate-950">

                  <div className="grid grid-cols-2 gap-2">

                    <button
                      type="button"
                      onClick={closeSquad}
                      className="min-h-[48px] rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm font-semibold"
                    >
                      Close
                    </button>

                    <button
                      type="button"
                      onClick={openAddPlayer}
                      className="btn btn-primary !py-3 font-semibold"
                    >
                      ＋ Add Player
                    </button>

                  </div>

                </div>

              )}

          </div>

        </div>

      )}

      {/* =====================================================
          ADD PLAYER MODAL
      ====================================================== */}

      {showAddPlayerModal &&
        selectedTeam && (

          <div
            className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onMouseDown={(e) => {

              if (
                e.target ===
                  e.currentTarget &&
                !addingPlayer
              ) {
                closeAddPlayer();
              }

            }}
          >

            <form
              onSubmit={addPlayer}
              className="w-full sm:max-w-md bg-slate-950 border border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            >

              {/* HEADER */}

              <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">

                <div>

                  <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                    {selectedTeam.short_name}
                  </p>

                  <h2 className="text-xl font-bold text-white mt-1">
                    Add Player
                  </h2>

                </div>

                <button
                  type="button"
                  onClick={closeAddPlayer}
                  disabled={addingPlayer}
                  className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xl"
                >
                  ×
                </button>

              </div>

              {/* BODY */}

              <div className="p-4 sm:p-5 space-y-4">

                <div>

                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Player name
                  </label>

                  <input
                    autoFocus
                    className="input w-full"
                    placeholder="Enter player name"
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

                </div>

                <div>

                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Player role
                  </label>

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

                </div>

                <div className="rounded-2xl bg-slate-900 border border-slate-800 p-3">

                  <p className="text-xs text-slate-400">
                    Team
                  </p>

                  <div className="flex items-center gap-2 mt-2">

                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-bold text-white"
                      style={{
                        background:
                          selectedTeam.logo_color ||
                          '#1e3a8a',
                      }}
                    >
                      {selectedTeam.short_name}
                    </div>

                    <span className="text-sm font-semibold text-white">
                      {selectedTeam.name}
                    </span>

                  </div>

                </div>

              </div>

              {/* FOOTER */}

              <div className="p-4 sm:p-5 border-t border-slate-800 grid grid-cols-2 gap-2">

                <button
                  type="button"
                  onClick={closeAddPlayer}
                  disabled={addingPlayer}
                  className="min-h-[48px] rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={addingPlayer}
                  className="btn btn-primary !py-3 font-semibold"
                >
                  {addingPlayer
                    ? 'Adding…'
                    : '＋ Add Player'}
                </button>

              </div>

            </form>

          </div>

        )}

    </div>
  );
}
