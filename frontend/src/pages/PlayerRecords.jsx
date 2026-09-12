import { useEffect, useState } from 'react';
import { Players, Teams } from '../api/api.js';

export default function PlayerRecords() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState('batting');

  const [newPlayer, setNewPlayer] = useState({
    team_id: '',
    name: '',
    role: 'batsman'
  });

  const [deletingId, setDeletingId] = useState(null);

  const loadPlayers = () => {
    Players.listAll()
      .then(setPlayers)
      .catch((err) => {
        console.error('Failed to load players:', err);
      });
  };

  useEffect(() => {
    loadPlayers();

    Teams.list()
      .then(setTeams)
      .catch((err) => {
        console.error('Failed to load teams:', err);
      });
  }, []);

  const openPlayer = async (player) => {
    setSelected(player);
    setStats(null);
    setActiveTab('batting');
    setLoadingStats(true);

    try {
      const data = await Players.stats(player.id);
      setStats(data);
    } catch (err) {
      console.error('Failed to load player stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const addPlayer = async (e) => {
    e.preventDefault();

    if (!newPlayer.team_id || !newPlayer.name.trim()) {
      alert('Select a team and enter player name');
      return;
    }

    try {
      await Players.create(newPlayer);

      setNewPlayer({
        team_id: newPlayer.team_id,
        name: '',
        role: 'batsman'
      });

      setShowAdd(false);
      loadPlayers();
    } catch (err) {
      console.error('Failed to add player:', err);

      alert(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to add player'
      );
    }
  };

  const removePlayer = async (player, e) => {
    e.stopPropagation();

    const confirmed = window.confirm(
      `Remove ${player.name}? Their past match stats stay on record, but they won't be selectable in new matches.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(player.id);

    try {
      await Players.remove(player.id);

      if (selected?.id === player.id) {
        setSelected(null);
        setStats(null);
      }

      loadPlayers();
    } catch (err) {
      console.error('Failed to remove player:', err);

      alert(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to remove player'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = players.filter((player) =>
    String(player.name || '')
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const grouped = filtered.reduce((acc, player) => {
    const teamName = player.team_name || 'Team';

    if (!acc[teamName]) {
      acc[teamName] = [];
    }

    acc[teamName].push(player);

    return acc;
  }, {});

  return (
    <div className="grid md:grid-cols-2 gap-4 md:gap-6 fade-in">

      {/* =====================================================
          LEFT - PLAYERS
      ===================================================== */}
      <div className="min-w-0">

        {/* HEADER */}
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold">
            Player Stats
          </h1>

          <button
            type="button"
            className="btn btn-primary text-sm whitespace-nowrap min-h-[44px]"
            onClick={() => setShowAdd((value) => !value)}
          >
            {showAdd ? 'Cancel' : '+ Add Player'}
          </button>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          Career records for players on your own teams only.
        </p>

        {/* =====================================================
            ADD PLAYER
        ===================================================== */}
        {showAdd && (
          <form
            onSubmit={addPlayer}
            className="card space-y-3 mb-4"
          >
            <select
              className="input min-h-[46px]"
              value={newPlayer.team_id}
              onChange={(e) =>
                setNewPlayer({
                  ...newPlayer,
                  team_id: e.target.value
                })
              }
            >
              <option value="">
                Select team
              </option>

              {teams.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                >
                  {team.name}
                </option>
              ))}
            </select>

            <input
              className="input min-h-[46px]"
              placeholder="Player name"
              value={newPlayer.name}
              onChange={(e) =>
                setNewPlayer({
                  ...newPlayer,
                  name: e.target.value
                })
              }
            />

            <select
              className="input min-h-[46px]"
              value={newPlayer.role}
              onChange={(e) =>
                setNewPlayer({
                  ...newPlayer,
                  role: e.target.value
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

            <button
              type="submit"
              className="btn btn-primary w-full min-h-[46px]"
            >
              Add Player
            </button>
          </form>
        )}

        {/* =====================================================
            SEARCH
        ===================================================== */}
        <input
          className="input mb-4 min-h-[46px]"
          placeholder="Search player..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* =====================================================
            NO PLAYERS
        ===================================================== */}
        {Object.keys(grouped).length === 0 && (
          <div className="card text-slate-400">
            No players found. Add one above.
          </div>
        )}

        {/* =====================================================
            PLAYER LIST
        ===================================================== */}
        {Object.entries(grouped).map(
          ([teamName, teamPlayers]) => (
            <div
              key={teamName}
              className="mb-4"
            >
              <h2 className="text-sm font-semibold text-slate-400 mb-2">
                {teamName}
              </h2>

              <div className="space-y-2">
                {teamPlayers.map((player) => (
                  <div
                    key={player.id}
                    onClick={() => openPlayer(player)}
                    className={`
                      card
                      flex
                      items-center
                      justify-between
                      gap-3
                      py-3
                      px-3
                      cursor-pointer
                      transition
                      hover:border-emerald-500
                      active:scale-[0.99]
                      ${
                        selected?.id === player.id
                          ? 'border-emerald-500 bg-slate-800/60'
                          : ''
                      }
                    `}
                  >
                    {/* PLAYER NAME */}
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {player.name}
                      </div>
                    </div>

                    {/* PLAYER ROLE + DELETE */}
                    <div className="flex items-center gap-2 shrink-0">

                      <span className="text-xs text-slate-400 hidden sm:block">
                        {player.role || 'Player'}
                      </span>

                      <button
                        type="button"
                        onClick={(e) =>
                          removePlayer(player, e)
                        }
                        disabled={
                          deletingId === player.id
                        }
                        className="
                          min-w-[36px]
                          min-h-[36px]
                          flex
                          items-center
                          justify-center
                          rounded-lg
                          text-red-400
                          hover:text-red-300
                          hover:bg-red-500/10
                        "
                      >
                        {deletingId === player.id
                          ? '...'
                          : '🗑'}
                      </button>

                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

      </div>

      {/* =====================================================
          RIGHT - CAREER RECORD
      ===================================================== */}
      <div className="min-w-0">

        <h1 className="text-2xl font-bold mb-4">
          Career Record
        </h1>

        {/* NOTHING SELECTED */}
        {!selected && (
          <div className="card text-slate-400">
            Select a player to see their full batting and bowling
            record.
          </div>
        )}

        {/* LOADING */}
        {selected && loadingStats && (
          <div className="card text-slate-400">
            Loading...
          </div>
        )}

        {/* STATS */}
        {selected && !loadingStats && stats && (
          <div className="space-y-4">

            {/* =================================================
                PLAYER INFO
            ================================================= */}
            <div className="card">

              <h2 className="text-xl font-bold">
                {stats.player?.name ||
                  selected.name}
              </h2>

              <p className="text-sm text-slate-400 mt-1">
                {stats.player?.team_name ||
                  selected.team_name ||
                  'Team'}
                {' · '}
                {stats.player?.role ||
                  selected.role ||
                  'Player'}
              </p>

            </div>

            {/* =================================================
                BATTING / BOWLING BUTTONS
            ================================================= */}
            <div
              className="
                grid
                grid-cols-2
                gap-2
                p-1
                bg-slate-900
                rounded-xl
                sticky
                top-2
                z-10
              "
            >

              {/* BATTING */}
              <button
                type="button"
                onClick={() => setActiveTab('batting')}
                className={`
                  min-h-[48px]
                  rounded-lg
                  font-semibold
                  text-sm
                  transition
                  flex
                  items-center
                  justify-center
                  gap-2
                  ${
                    activeTab === 'batting'
                      ? 'bg-emerald-500 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }
                `}
              >
                <span>🏏</span>
                <span>Batting</span>
              </button>

              {/* BOWLING */}
              <button
                type="button"
                onClick={() => setActiveTab('bowling')}
                className={`
                  min-h-[48px]
                  rounded-lg
                  font-semibold
                  text-sm
                  transition
                  flex
                  items-center
                  justify-center
                  gap-2
                  ${
                    activeTab === 'bowling'
                      ? 'bg-orange-500 text-white shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }
                `}
              >
                <span>🎯</span>
                <span>Bowling</span>
              </button>

            </div>

            {/* =================================================
                BATTING DETAILS
            ================================================= */}
            {activeTab === 'batting' && (
              <div className="card">

                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-emerald-400">
                    🏏 Batting Details
                  </h3>

                  <span className="text-xs text-slate-500">
                    Career
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">

                  <Stat
                    label="Innings Batted"
                    value={
                      stats.batting?.innings_batted
                    }
                  />

                  <Stat
                    label="Runs Scored"
                    value={
                      stats.batting?.runs
                    }
                  />

                  <Stat
                    label="Highest Score"
                    value={
                      stats.batting?.highest_score
                    }
                  />

                  <Stat
                    label="Balls Faced"
                    value={
                      stats.batting?.balls_faced
                    }
                  />

                  <Stat
                    label="Fours"
                    value={
                      stats.batting?.fours
                    }
                  />

                  <Stat
                    label="Sixes"
                    value={
                      stats.batting?.sixes
                    }
                  />

                  <Stat
                    label="Strike Rate"
                    value={
                      stats.batting?.strike_rate
                    }
                  />

                  <Stat
                    label="Average"
                    value={
                      stats.batting?.average
                    }
                  />

                  <Stat
                    label="Times Out"
                    value={
                      stats.batting?.times_out
                    }
                  />

                  <Stat
                    label="Not Outs"
                    value={
                      stats.batting?.not_outs
                    }
                  />

                </div>

              </div>
            )}

            {/* =================================================
                BOWLING DETAILS
            ================================================= */}
            {activeTab === 'bowling' && (
              <div className="card">

                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-orange-400">
                    🎯 Bowling Details
                  </h3>

                  <span className="text-xs text-slate-500">
                    Career
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">

                  <Stat
                    label="Innings Bowled"
                    value={
                      stats.bowling?.innings_bowled
                    }
                  />

                  <Stat
                    label="Overs Bowled"
                    value={
                      stats.bowling?.overs
                    }
                  />

                  <Stat
                    label="Balls Bowled"
                    value={
                      stats.bowling?.balls_bowled
                    }
                  />

                  <Stat
                    label="Runs Given"
                    value={
                      stats.bowling?.runs_given
                    }
                  />

                  <Stat
                    label="Wickets"
                    value={
                      stats.bowling?.wickets
                    }
                  />

                  <Stat
                    label="Economy"
                    value={
                      stats.bowling?.economy
                    }
                  />

                  <Stat
                    label="Fours Given"
                    value={
                      stats.bowling?.fours_given
                    }
                  />

                  <Stat
                    label="Sixes Given"
                    value={
                      stats.bowling?.sixes_given
                    }
                  />

                </div>

              </div>
            )}

          </div>
        )}

        {/* FAILED */}
        {selected && !loadingStats && !stats && (
          <div className="card text-red-400">
            Unable to load this player's statistics.
          </div>
        )}

      </div>

    </div>
  );
}


/* ============================================================
   STAT COMPONENT
============================================================ */

function Stat({ label, value }) {
  return (
    <div
      className="
        bg-slate-900
        rounded-xl
        p-3
        min-h-[72px]
        flex
        flex-col
        justify-center
      "
    >
      <div className="text-slate-400 text-xs leading-tight">
        {label}
      </div>

      <div className="text-lg sm:text-xl font-bold mt-1">
        {value ?? 0}
      </div>
    </div>
  );
}
