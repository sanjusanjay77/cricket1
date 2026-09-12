import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Matches } from '../api/api.js';
import socket from '../socket.js';
import { exportMatchPdf } from '../utils/exportPdf.js';

function playerName(players, id) {
  return players.find((p) => p.id === id)?.name || '—';
}

function shortPlayerName(name) {
  if (!name) return '—';

  const parts = name.trim().split(/\s+/);

  if (parts.length <= 2) return name;

  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function formatDismissal(b, players) {
  if (!b.is_out) return 'Not out';

  const type = b.how_out || 'out';

  if (b.fielder_id) {
    return `${type} (${playerName(
      players,
      b.fielder_id
    )})`;
  }

  return type;
}

/* =========================================================
   BATTER CARD
========================================================= */

function BatterCard({
  batter,
  innings,
  players,
}) {
  const active =
    !batter.is_out &&
    (
      batter.player_id === innings.striker_id ||
      batter.player_id === innings.non_striker_id
    );

  const striker =
    batter.player_id === innings.striker_id;

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        active
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-slate-800 bg-slate-900/40'
      }`}
    >
      <div className="flex items-center justify-between gap-3">

        {/* PLAYER */}
        <div className="min-w-0 flex-1">

          <div className="flex items-center gap-1.5">

            <span
              className={`truncate text-sm font-semibold ${
                active
                  ? 'text-emerald-400'
                  : 'text-slate-200'
              }`}
            >
              {shortPlayerName(
                playerName(
                  players,
                  batter.player_id
                )
              )}
            </span>

            {striker && (
              <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">
                *
              </span>
            )}

          </div>

          <div className="mt-0.5 truncate text-[9px] text-slate-600">
            {formatDismissal(
              batter,
              players
            )}
          </div>

        </div>

        {/* RUNS */}
        <div className="shrink-0 text-right">

          <div className="text-lg font-black leading-none text-white">
            {batter.runs}
          </div>

          <div className="mt-0.5 text-[9px] text-slate-600">
            {batter.balls} balls
          </div>

        </div>

        {/* BOUNDARIES */}
        <div className="flex shrink-0 gap-2 text-center">

          <div>
            <div className="text-[11px] font-bold text-slate-300">
              {batter.fours}
            </div>

            <div className="text-[8px] text-slate-600">
              4s
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold text-slate-300">
              {batter.sixes}
            </div>

            <div className="text-[8px] text-slate-600">
              6s
            </div>
          </div>

          <div className="hidden sm:block">
            <div className="text-[11px] font-bold text-slate-300">
              {batter.strike_rate}
            </div>

            <div className="text-[8px] text-slate-600">
              SR
            </div>
          </div>

        </div>

      </div>

      {/* MOBILE STRIKE RATE */}
      <div className="mt-2 flex items-center justify-between border-t border-slate-800/70 pt-1.5 sm:hidden">

        <span className="text-[9px] text-slate-600">
          Strike Rate
        </span>

        <span className="text-[10px] font-semibold text-slate-400">
          {batter.strike_rate}
        </span>

      </div>

    </div>
  );
}

/* =========================================================
   FALL OF WICKET
========================================================= */

function FallOfWicketCard({
  wicket,
  index,
  players,
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5">

      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-[10px] font-black text-red-400">
        {wicket.wicket_no || index + 1}
      </div>

      <div className="min-w-0 flex-1">

        <div className="truncate text-xs font-semibold text-slate-200">
          {shortPlayerName(
            playerName(
              players,
              wicket.player_id
            )
          )}
        </div>

        <div className="mt-0.5 truncate text-[9px] text-slate-600">
          {wicket.how_out || 'out'}

          {wicket.fielder_id
            ? ` • ${playerName(
                players,
                wicket.fielder_id
              )}`
            : ''}
        </div>

      </div>

      <div className="shrink-0 text-right">

        <div className="text-sm font-bold text-white">
          {wicket.score}
        </div>

        <div className="text-[9px] text-slate-600">
          {wicket.overs} ov
        </div>

      </div>

    </div>
  );
}

/* =========================================================
   PARTNERSHIP CARD
========================================================= */

function PartnershipCard({
  partnership,
  index,
  players,
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        partnership.is_current
          ? 'border-emerald-500/25 bg-emerald-500/5'
          : 'border-slate-800 bg-slate-900/40'
      }`}
    >

      <div className="flex items-center justify-between gap-3">

        <div className="min-w-0">

          <div className="flex items-center gap-2">

            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[9px] font-bold text-slate-400">
              {partnership.partnership_no ||
                index + 1}
            </span>

            <span className="truncate text-xs font-semibold text-slate-200">
              {shortPlayerName(
                playerName(
                  players,
                  partnership.batsman1_id
                )
              )}

              <span className="mx-1 text-slate-700">
                &
              </span>

              {shortPlayerName(
                playerName(
                  players,
                  partnership.batsman2_id
                )
              )}
            </span>

          </div>

        </div>

        <div className="shrink-0 text-right">

          <div className="text-base font-black text-white">
            {partnership.runs}
          </div>

          <div className="text-[8px] text-slate-600">
            runs • {partnership.balls} balls
          </div>

        </div>

      </div>

      {partnership.is_current && (
        <div className="mt-2 border-t border-emerald-500/10 pt-1.5">

          <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-400">
            Current partnership
          </span>

        </div>
      )}

    </div>
  );
}

/* =========================================================
   BOWLER ROW
========================================================= */

function BowlerRow({
  bowler,
  innings,
  players,
}) {
  const current =
    bowler.player_id ===
    innings.current_bowler_id;

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_42px_42px_42px_42px_48px] items-center gap-1 border-t border-slate-800/80 px-2.5 py-2 ${
        current
          ? 'bg-emerald-500/5'
          : ''
      }`}
    >

      <div className="min-w-0">

        <div
          className={`truncate text-xs font-medium ${
            current
              ? 'text-emerald-400'
              : 'text-slate-300'
          }`}
        >
          {shortPlayerName(
            playerName(
              players,
              bowler.player_id
            )
          )}
        </div>

        {current && (
          <div className="text-[8px] font-bold uppercase text-emerald-500">
            bowling
          </div>
        )}

      </div>

      <div className="text-center text-[10px] text-slate-400">
        {bowler.overs}
      </div>

      <div className="text-center text-[10px] text-slate-400">
        {bowler.maidens}
      </div>

      <div className="text-center text-[10px] text-slate-300">
        {bowler.runs}
      </div>

      <div className="text-center text-[10px] font-bold text-white">
        {bowler.wickets}
      </div>

      <div className="text-center text-[10px] text-slate-400">
        {bowler.economy}
      </div>

    </div>
  );
}

/* =========================================================
   MAIN PAGE
========================================================= */

export default function LiveScoreboard() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState(0);
  const [boundary, setBoundary] = useState(null);
  const [flashWicket, setFlashWicket] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const lastBallId = useRef(null);
  const boundaryTimer = useRef(null);

  /* =======================================================
     LOAD MATCH
  ======================================================= */

  const load = useCallback(() => {
    Matches.get(matchId)
      .then((data) => {
        setDetail(data);

        setTab(
          Math.max(
            0,
            (data.innings || []).length - 1
          )
        );
      })
      .catch((error) => {
        console.error(
          'Failed to load match:',
          error
        );
      });
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  /* =======================================================
     EFFECTS
  ======================================================= */

  const detectEffects = useCallback(
    (inningsList, activeTab) => {
      const current =
        inningsList[activeTab];

      if (
        !current ||
        !current.recentBalls?.length
      ) {
        return;
      }

      const newest =
        current.recentBalls[
          current.recentBalls.length - 1
        ];

      if (
        lastBallId.current &&
        newest.id !== lastBallId.current
      ) {
        if (newest.is_wicket) {
          setFlashWicket(true);

          setTimeout(() => {
            setFlashWicket(false);
          }, 600);
        } else if (
          !newest.extra_type &&
          newest.runs_batsman === 4
        ) {
          clearTimeout(
            boundaryTimer.current
          );

          setBoundary('four');

          boundaryTimer.current =
            setTimeout(() => {
              setBoundary(null);
            }, 1100);
        } else if (
          !newest.extra_type &&
          newest.runs_batsman === 6
        ) {
          clearTimeout(
            boundaryTimer.current
          );

          setBoundary('six');

          boundaryTimer.current =
            setTimeout(() => {
              setBoundary(null);
            }, 1100);
        }
      }

      lastBallId.current = newest.id;
    },
    []
  );

  /* =======================================================
     SOCKET
  ======================================================= */

  useEffect(() => {
    socket.emit(
      'join-match',
      matchId
    );

    const onUpdate = ({
      match,
      innings,
    }) => {
      setDetail((current) => {
        if (!current) return current;

        const nextTab = Math.max(
          0,
          innings.length - 1
        );

        detectEffects(
          innings,
          nextTab
        );

        return {
          ...current,
          match,
          innings,
        };
      });

      setTab(
        Math.max(
          0,
          innings.length - 1
        )
      );
    };

    socket.on(
      'score-update',
      onUpdate
    );

    return () => {
      socket.emit(
        'leave-match',
        matchId
      );

      socket.off(
        'score-update',
        onUpdate
      );
    };
  }, [
    matchId,
    detectEffects,
  ]);

  /* =======================================================
     LOADING
  ======================================================= */

  if (!detail) {
    return (
      <div className="flex min-h-[35vh] items-center justify-center">

        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs text-slate-500">
          Loading scoreboard…
        </div>

      </div>
    );
  }

  const {
    match,
    players = [],
  } = detail;

  const inningsList =
    detail.innings || [];

  const current =
    inningsList[tab];

  if (!current) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-5 text-center text-xs text-slate-500">
        Match not started yet.
      </div>
    );
  }

  const {
    innings,
    battingCard = [],
    bowlingCard = [],
    partnerships = [],
    fallOfWickets = [],
    overs,
    runRate,
  } = current;

  /* =======================================================
     DELETE
  ======================================================= */

  const deleteMatch = async () => {
    const ok = window.confirm(
      'Delete this match permanently? This removes its full scorecard and cannot be undone.'
    );

    if (!ok) return;

    setDeleting(true);

    try {
      await Matches.remove(matchId);
      navigate('/');
    } catch (error) {
      console.error(
        'Delete match failed:',
        error
      );

      alert(
        'Unable to delete match.'
      );
    } finally {
      setDeleting(false);
    }
  };

  const exportPdf = () => {
    try {
      exportMatchPdf({
        match,
        innings: inningsList,
        players,
      });
    } catch (error) {
      console.error(
        'PDF export failed:',
        error
      );

      alert(
        'Unable to create PDF. Please try again.'
      );
    }
  };

  /* =======================================================
     TEAM INFO
  ======================================================= */

  const battingTeam =
    innings.batting_team_id ===
    match.team1_id
      ? match.team1_name
      : match.team2_name;

  const battingShort =
    innings.batting_team_id ===
    match.team1_id
      ? match.team1_short
      : match.team2_short;

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="relative mx-auto w-full max-w-3xl space-y-3 pb-6 fade-in">

      {/* =================================================
          BOUNDARY
      ================================================= */}

      {boundary && (
        <div className="boundary-overlay">

          <div
            className={`boundary-text boundary-${boundary}`}
          >
            {boundary === 'six'
              ? 'SIX! 🚀'
              : 'FOUR! 🔥'}
          </div>

        </div>
      )}

      {/* =================================================
          TOP NAV
      ================================================= */}

      <div className="flex items-center justify-between gap-2">

        <Link
          to="/"
          className="flex h-8 items-center rounded-lg border border-slate-800 bg-slate-900 px-3 text-[10px] font-semibold text-slate-400 hover:text-white"
        >
          ← Matches
        </Link>

        <div className="flex items-center gap-1.5">

          {match.status === 'live' && (
            <Link
              to={`/match/${matchId}/score`}
              className="flex h-8 items-center rounded-lg bg-white px-3 text-[10px] font-bold text-slate-950"
            >
              Scorer
            </Link>
          )}

          {match.status === 'completed' && (
            <>
              <button
                type="button"
                onClick={exportPdf}
                className="flex h-8 items-center rounded-lg border border-slate-800 bg-slate-900 px-2.5 text-[10px] font-semibold text-slate-300"
              >
                PDF
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={deleteMatch}
                className="flex h-8 items-center rounded-lg bg-red-500/10 px-2.5 text-[10px] font-semibold text-red-400"
              >
                {deleting
                  ? '...'
                  : 'Delete'}
              </button>
            </>
          )}

        </div>

      </div>

      {/* =================================================
          MATCH HEADER + SCORE
      ================================================= */}

      <div
        className={`overflow-hidden rounded-2xl border bg-slate-950 shadow-lg ${
          flashWicket
            ? 'border-red-500/60 wicket-flash'
            : 'border-slate-800'
        }`}
      >

        {/* MATCH TITLE */}
        <div className="border-b border-slate-800 px-3 py-2.5">

          <div className="flex items-center justify-between gap-3">

            <div className="min-w-0">

              <h1 className="truncate text-sm font-bold text-white">
                {match.team1_name}
                <span className="mx-1.5 text-slate-600">
                  vs
                </span>
                {match.team2_name}
              </h1>

              <div className="mt-0.5 text-[9px] text-slate-600">
                {match.overs_limit}-over match
              </div>

            </div>

            {match.status === 'live' && (
              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-1">

                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
                </span>

                <span className="text-[8px] font-bold uppercase tracking-widest text-red-400">
                  Live
                </span>

              </div>
            )}

          </div>

        </div>

        {/* SCORE */}
        <div className="px-4 py-5 text-center">

          <div className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-slate-600">
            {battingShort} batting
          </div>

          <div className="text-[48px] font-black leading-none tracking-tight text-white sm:text-6xl">
            {innings.total_runs}
            <span className="text-slate-600">
              /{innings.total_wickets}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-500">

            <span>
              {overs} overs
            </span>

            <span className="text-slate-700">
              •
            </span>

            <span>
              RR {runRate}
            </span>

          </div>

          {innings.target && (
            <div className="mt-2">

              <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-1 text-[9px] font-semibold text-blue-400">
                Target {innings.target}
              </span>

            </div>
          )}

          {match.result_text && (
            <div className="mt-3 rounded-lg bg-emerald-500/5 px-3 py-2">

              <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                Match Result
              </div>

              <div className="mt-0.5 text-xs font-semibold text-emerald-400">
                🏆 {match.result_text}
              </div>

            </div>
          )}

        </div>

      </div>

      {/* =================================================
          INNINGS SELECTOR
      ================================================= */}

      {inningsList.length > 1 && (
        <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">

          {inningsList.map(
            (item, index) => (
              <button
                key={index}
                type="button"
                onClick={() =>
                  setTab(index)
                }
                className={`flex min-h-[34px] flex-1 items-center justify-center rounded-lg text-[10px] font-bold transition ${
                  tab === index
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Innings {index + 1}
              </button>
            )
          )}

        </div>
      )}

      {/* =================================================
          BATTING
      ================================================= */}

      <section className="rounded-xl border border-slate-800 bg-slate-950/60">

        <div className="flex items-center justify-between px-3 py-2.5">

          <div>

            <h2 className="text-xs font-bold text-white">
              Batting
            </h2>

            <p className="text-[8px] text-slate-600">
              Runs • Balls • Boundaries
            </p>

          </div>

          <span className="rounded-full bg-slate-900 px-2 py-1 text-[8px] text-slate-500">
            {battingCard.length} players
          </span>

        </div>

        <div className="space-y-1.5 px-2.5 pb-2.5">

          {battingCard.map(
            (batter) => (
              <BatterCard
                key={batter.player_id}
                batter={batter}
                innings={innings}
                players={players}
              />
            )
          )}

        </div>

        {/* EXTRAS */}
        <div className="border-t border-slate-800 px-3 py-2.5">

          <div className="flex items-center justify-between">

            <span className="text-[10px] font-semibold text-slate-500">
              Extras
            </span>

            <span className="text-xs font-bold text-slate-300">
              {(innings.extras_wide || 0) +
                (innings.extras_noball || 0) +
                (innings.extras_bye || 0) +
                (innings.extras_legbye || 0) +
                (innings.extras_penalty || 0)}
            </span>

          </div>

          <div className="mt-1 text-[9px] text-slate-600">

            WD {innings.extras_wide || 0}

            <span className="mx-2">
              •
            </span>

            NB {innings.extras_noball || 0}

            <span className="mx-2">
              •
            </span>

            B {innings.extras_bye || 0}

            <span className="mx-2">
              •
            </span>

            LB {innings.extras_legbye || 0}

          </div>

        </div>

      </section>

      {/* =================================================
          FALL OF WICKETS
      ================================================= */}

      <section className="rounded-xl border border-slate-800 bg-slate-950/60">

        <div className="flex items-center justify-between px-3 py-2.5">

          <div>

            <h2 className="text-xs font-bold text-white">
              Fall of Wickets
            </h2>

            <p className="text-[8px] text-slate-600">
              Wicket timeline
            </p>

          </div>

          <span className="rounded-full bg-slate-900 px-2 py-1 text-[8px] text-slate-500">
            {fallOfWickets.length}
          </span>

        </div>

        {fallOfWickets.length === 0 ? (

          <div className="px-3 pb-3">

            <div className="rounded-lg border border-dashed border-slate-800 px-3 py-3 text-center">

              <div className="text-lg opacity-50">
                🏏
              </div>

              <div className="mt-1 text-[10px] text-slate-600">
                No wickets yet
              </div>

            </div>

          </div>

        ) : (

          <div className="space-y-1.5 px-2.5 pb-2.5">

            {fallOfWickets.map(
              (wicket, index) => (
                <FallOfWicketCard
                  key={`${wicket.player_id}-${index}`}
                  wicket={wicket}
                  index={index}
                  players={players}
                />
              )
            )}

          </div>

        )}

      </section>

      {/* =================================================
          PARTNERSHIPS
      ================================================= */}

      <section className="rounded-xl border border-slate-800 bg-slate-950/60">

        <div className="flex items-center justify-between px-3 py-2.5">

          <div>

            <h2 className="text-xs font-bold text-white">
              Partnerships
            </h2>

            <p className="text-[8px] text-slate-600">
              Batting partnerships
            </p>

          </div>

          <span className="rounded-full bg-slate-900 px-2 py-1 text-[8px] text-slate-500">
            {partnerships.length}
          </span>

        </div>

        {partnerships.length === 0 ? (

          <div className="px-3 pb-3">

            <div className="rounded-lg border border-dashed border-slate-800 px-3 py-3 text-center">

              <div className="text-lg opacity-50">
                🤝
              </div>

              <div className="mt-1 text-[10px] text-slate-600">
                No partnership data yet
              </div>

            </div>

          </div>

        ) : (

          <div className="space-y-1.5 px-2.5 pb-2.5">

            {partnerships.map(
              (partnership, index) => (
                <PartnershipCard
                  key={`partnership-${index}`}
                  partnership={partnership}
                  index={index}
                  players={players}
                />
              )
            )}

          </div>

        )}

      </section>

      {/* =================================================
          BOWLING
      ================================================= */}

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">

        <div className="px-3 py-2.5">

          <h2 className="text-xs font-bold text-white">
            Bowling
          </h2>

          <p className="text-[8px] text-slate-600">
            Overs • Maidens • Runs • Wickets • Economy
          </p>

        </div>

        <div className="overflow-x-auto">

          <div className="min-w-[330px]">

            {/* TABLE HEADER */}
            <div className="grid grid-cols-[minmax(0,1fr)_42px_42px_42px_42px_48px] gap-1 border-y border-slate-800 bg-slate-900/70 px-2.5 py-1.5">

              <div className="text-[8px] font-bold uppercase tracking-wider text-slate-600">
                Bowler
              </div>

              <div className="text-center text-[8px] font-bold text-slate-600">
                O
              </div>

              <div className="text-center text-[8px] font-bold text-slate-600">
                M
              </div>

              <div className="text-center text-[8px] font-bold text-slate-600">
                R
              </div>

              <div className="text-center text-[8px] font-bold text-slate-600">
                W
              </div>

              <div className="text-center text-[8px] font-bold text-slate-600">
                ECO
              </div>

            </div>

            {bowlingCard.length === 0 ? (

              <div className="px-3 py-4 text-center text-[10px] text-slate-600">
                No bowling data yet.
              </div>

            ) : (

              bowlingCard.map(
                (bowler) => (
                  <BowlerRow
                    key={bowler.player_id}
                    bowler={bowler}
                    innings={innings}
                    players={players}
                  />
                )
              )

            )}

          </div>

        </div>

      </section>

      {/* =================================================
          BOTTOM ACTIONS
      ================================================= */}

      <div className="grid grid-cols-2 gap-2 pt-1">

        {match.status === 'live' && (
          <Link
            to={`/match/${matchId}/score`}
            className="flex min-h-[40px] items-center justify-center rounded-xl bg-white text-xs font-bold text-slate-950"
          >
            🏏 Open Scorer
          </Link>
        )}

        <button
          type="button"
          onClick={exportPdf}
          className="flex min-h-[40px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-xs font-semibold text-slate-300"
        >
          ⬇ Download PDF
        </button>

      </div>

    </div>
  );
}
