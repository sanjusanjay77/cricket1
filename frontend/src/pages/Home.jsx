
import {
  useEffect,
  useState,
  useCallback,
  memo,
} from 'react';

import { Link } from 'react-router-dom';

import {
  Matches,
  getApiErrorMessage,
} from '../api/api.js';

import socket from '../socket.js';

import {
  exportMatchPdf,
} from '../utils/exportPdf.js';

const MATCHES_CACHE_KEY = 'gcc_matches_cache_v1';
const HOME_INTRO_KEY = 'gcc_home_intro_seen_v1';

const statusBadge = {
  upcoming: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  live: 'border-red-400/20 bg-red-400/10 text-red-300',
  'innings-break': 'border-orange-400/20 bg-orange-400/10 text-orange-300',
  completed: 'border-slate-700 bg-slate-800/70 text-slate-400',
};

function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function showDeleteError(error) {
  console.error('Delete match failed:', error);

  const message =
    getApiErrorMessage?.(error) ||
    error?.response?.data?.error ||
    error?.message ||
    'Unable to delete this match.';

  window.alert(`Delete failed:\n\n${message}`);
}

function readMatchesCache() {
  try {
    const cached = localStorage.getItem(MATCHES_CACHE_KEY);
    if (!cached) return [];

    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to read matches cache:', error);
    return [];
  }
}

function writeMatchesCache(matches) {
  try {
    localStorage.setItem(
      MATCHES_CACHE_KEY,
      JSON.stringify(matches)
    );
  } catch (error) {
    console.warn('Failed to save matches cache:', error);
  }
}

function getMatchInnings(match) {
  return Array.isArray(match?.innings) ? match.innings : [];
}

function getCurrentInnings(match) {
  const innings = getMatchInnings(match);
  return innings[innings.length - 1] || null;
}

function getMatchTitle(match) {
  return `${match?.team1_name || match?.team1_short || 'Team 1'} vs ${
    match?.team2_name || match?.team2_short || 'Team 2'
  }`;
}

/* =========================================================
   STADIUM INTRO
========================================================= */

function HomeIntro({ onFinished }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(HOME_INTRO_KEY, '1');
      } catch (error) {
        console.warn('Unable to save intro state:', error);
      }

      onFinished();
    }, 1450);

    return () => window.clearTimeout(timer);
  }, [onFinished]);

  return (
    <div className="stadium-intro">
      <div className="intro-light intro-light-left" />
      <div className="intro-light intro-light-right" />
      <div className="intro-particles" />

      <div className="intro-content">
        <div className="intro-cricket-ball">🏏</div>

        <p className="intro-eyebrow">GCC PRESENTS</p>

        <h1>CRICKET</h1>
        <h2>LIVE SCOREBOARD</h2>

        <div className="intro-progress">
          <span />
        </div>

        <p className="intro-caption">
          Every ball. Every run. Every moment.
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   LOADING
========================================================= */

function MatchSkeleton({ index = 0 }) {
  return (
    <div
      className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/80 p-4"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex justify-between gap-4">
        <div className="h-4 w-32 rounded bg-slate-800" />
        <div className="h-5 w-16 rounded-full bg-slate-800" />
      </div>
      <div className="mt-5 h-7 w-28 rounded bg-slate-800" />
      <div className="mt-3 h-3 w-40 rounded bg-slate-800" />
      <div className="mt-4 h-8 rounded-lg bg-slate-800" />
    </div>
  );
}

function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 px-1 pb-8">
      <div className="h-52 animate-pulse rounded-3xl bg-slate-900" />
      <div className="h-5 w-36 animate-pulse rounded bg-slate-800" />
      {[0, 1, 2].map(index => (
        <MatchSkeleton key={index} index={index} />
      ))}
    </div>
  );
}

/* =========================================================
   SCORE FLASH
========================================================= */

function useScoreFlash(innings) {
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!innings) return undefined;

    setFlash(true);

    const timer = window.setTimeout(() => {
      setFlash(false);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    innings?.innings?.total_runs,
    innings?.innings?.total_wickets,
    innings?.overs,
  ]);

  return flash;
}

/* =========================================================
   STADIUM HERO
========================================================= */

function StadiumHero({
  totalMatches,
  liveCount,
  completedCount,
}) {
  return (
    <section className="stadium-hero">
      <div className="stadium-sky" />
      <div className="stadium-lights stadium-lights-left" />
      <div className="stadium-lights stadium-lights-right" />
      <div className="stadium-stands" />
      <div className="stadium-crowd" />

      <div className="stadium-pitch">
        <div className="pitch-line pitch-line-top" />
        <div className="pitch-stumps pitch-stumps-top">
          <i />
          <i />
          <i />
        </div>
        <div className="pitch-center-line" />
        <div className="pitch-line pitch-line-bottom" />
        <div className="pitch-stumps pitch-stumps-bottom">
          <i />
          <i />
          <i />
        </div>
      </div>

      <div className="stadium-hero-shade" />

      <div className="stadium-hero-content">
        <div className="stadium-brand">
          <span className="brand-ball">🏏</span>
          <span>GCC CRICKET</span>
          <span className="brand-divider">/</span>
          <span className="brand-season">MATCH CENTRE</span>
        </div>

        <div className="stadium-heading">
          <p className="stadium-kicker">
            THE GAME IS ON
          </p>

          <h1>
            OWN THE
            <br />
            <span>GAME.</span>
          </h1>

          <p className="stadium-description">
            Your cricket. Your scoreboard.
            <br />
            Every moment, captured live.
          </p>

          <Link to="/create-match" className="stadium-cta">
            <span className="cta-plus">＋</span>
            <span>CREATE NEW MATCH</span>
            <span className="cta-arrow">↗</span>
          </Link>
        </div>

        <div className="stadium-stats">
          <div className="stadium-stat">
            <span className="stat-number">{totalMatches}</span>
            <span className="stat-label">TOTAL MATCHES</span>
          </div>

          <div className="stat-divider" />

          <div className="stadium-stat">
            <span className="stat-number stat-live">
              <span className="live-dot" />
              {liveCount}
            </span>
            <span className="stat-label">LIVE NOW</span>
          </div>

          <div className="stat-divider" />

          <div className="stadium-stat">
            <span className="stat-number">{completedCount}</span>
            <span className="stat-label">COMPLETED</span>
          </div>
        </div>
      </div>

      <div className="stadium-bottom-label">
        <span>PLAY WITH PASSION</span>
        <span className="bottom-label-line" />
        <span>🏆</span>
      </div>
    </section>
  );
}

/* =========================================================
   LIVE MATCH CARD
========================================================= */

const LiveHero = memo(function LiveHero({ match, onDeleted }) {
  const [data, setData] = useState(() => ({
    match,
    innings: getMatchInnings(match),
    players: Array.isArray(match?.players) ? match.players : [],
  }));

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setData({
      match,
      innings: getMatchInnings(match),
      players: Array.isArray(match?.players) ? match.players : [],
    });
  }, [match]);

  useEffect(() => {
    if (!match?.id) return undefined;

    socket.emit('join-match', match.id);

    const onUpdate = ({ match: updatedMatch, innings }) => {
      if (
        updatedMatch?.id &&
        !sameId(updatedMatch.id, match.id)
      ) {
        return;
      }

      setData(current => ({
        ...current,
        match: updatedMatch || current.match,
        innings: Array.isArray(innings)
          ? innings
          : current.innings,
      }));
    };

    socket.on('score-update', onUpdate);

    return () => {
      socket.emit('leave-match', match.id);
      socket.off('score-update', onUpdate);
    };
  }, [match?.id]);

  const currentMatch = data.match;
  const inningsList = data.innings;
  const innings = inningsList[inningsList.length - 1] || null;
  const scoreFlash = useScoreFlash(innings);

  const battingTeamId = innings?.innings?.batting_team_id;

  const battingTeam = sameId(battingTeamId, currentMatch.team1_id)
    ? currentMatch.team1_name
    : sameId(battingTeamId, currentMatch.team2_id)
      ? currentMatch.team2_name
      : null;

  const battingShort = sameId(battingTeamId, currentMatch.team1_id)
    ? innings?.innings?.batting_team_short ||
      currentMatch.team1_short ||
      currentMatch.team1_name
    : sameId(battingTeamId, currentMatch.team2_id)
      ? innings?.innings?.batting_team_short ||
        currentMatch.team2_short ||
        currentMatch.team2_name
      : null;

  const downloadPdf = async () => {
    try {
      const detail = await Matches.get(currentMatch.id);

      await exportMatchPdf({
        match: detail.match || detail,
        innings: detail.innings || [],
        players: detail.players || [],
      });
    } catch (error) {
      console.error('PDF export failed:', error);
      window.alert('Unable to create PDF. Please try again.');
    }
  };

  const deleteMatch = async () => {
    if (deleting) return;

    const ok = window.confirm(
      'Delete this match permanently?\n\n' +
      'This will delete the match, innings, balls and full scorecard.\n\n' +
      'This action cannot be undone.'
    );

    if (!ok) return;

    setDeleting(true);

    try {
      await Matches.remove(currentMatch.id);
      onDeleted?.(currentMatch.id);
    } catch (error) {
      showDeleteError(error);
      setDeleting(false);
    }
  };

  return (
    <article className="live-match-card">
      <div className="live-card-topline">
        <div className="live-label">
          <span className="live-dot live-dot-pulse" />
          LIVE MATCH
        </div>

        <span className="overs-pill">
          {currentMatch.overs_limit} OVERS
        </span>
      </div>

      <Link
        to={`/match/${currentMatch.id}/live`}
        state={{ match: currentMatch }}
        className="live-score-link"
      >
        <div className="live-team-row">
          <div className="live-team">
            <span className="live-team-name">
              {currentMatch.team1_short || currentMatch.team1_name}
            </span>
            <span className="live-team-full">
              {currentMatch.team1_name}
            </span>
          </div>

          <span className="live-versus">VS</span>

          <div className="live-team live-team-right">
            <span className="live-team-name">
              {currentMatch.team2_short || currentMatch.team2_name}
            </span>
            <span className="live-team-full">
              {currentMatch.team2_name}
            </span>
          </div>
        </div>

        {innings ? (
          <div className="live-score-panel">
            <div className="live-batting-team">
              {battingShort || 'CURRENT INNINGS'} BATTING
            </div>

            <div className={`live-score ${scoreFlash ? 'score-pop' : ''}`}>
              <span>{innings.innings?.total_runs ?? 0}</span>
              <span className="live-score-slash">/</span>
              <span className="live-wickets">
                {innings.innings?.total_wickets ?? 0}
              </span>
            </div>

            <div className="live-over-info">
              <span>OVERS {innings.overs || '0.0'}</span>
              <span className="score-info-divider" />
              <span>RR {innings.runRate ?? '0.00'}</span>
              {innings.innings?.target != null && (
                <>
                  <span className="score-info-divider" />
                  <span>TARGET {innings.innings.target}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="live-score-panel">
            <div className="live-score-no-data">Live match in progress</div>
          </div>
        )}

        {battingTeam && (
          <div className="live-batting-pill">
            <span className="live-dot" />
            {battingTeam}
          </div>
        )}

        <div className="view-live-hint">
          VIEW LIVE SCORE <span>↗</span>
        </div>
      </Link>

      <div className="match-actions match-actions-three">
        <Link
          to={`/match/${currentMatch.id}/live`}
          state={{ match: currentMatch }}
          className="match-action"
        >
          <span>◉</span> View
        </Link>

        <button
          type="button"
          className="match-action"
          onClick={downloadPdf}
          disabled={deleting}
        >
          <span>▤</span> PDF
        </button>

        <button
          type="button"
          className="match-action delete-action"
          onClick={deleteMatch}
          disabled={deleting}
        >
          <span>⌫</span> {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </article>
  );
});

/* =========================================================
   NORMAL MATCH CARD
========================================================= */

const MatchCard = memo(function MatchCard({
  match,
  onDelete,
  onDownload,
  deletingId,
  index = 0,
}) {
  const isDeleting = sameId(deletingId, match.id);

  const statusText = match.status === 'innings-break'
    ? 'Innings Break'
    : match.status || 'Completed';

  return (
    <article
      className="normal-match-card"
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <div className="normal-card-content">
        <div className="normal-card-top">
          <div className="normal-match-number">
            MATCH <span>#{match.id}</span>
          </div>

          <span className={`match-status ${statusBadge[match.status] || statusBadge.completed}`}>
            {statusText}
          </span>
        </div>

        <div className="normal-team-row">
          <div className="normal-team">
            <span className="normal-team-badge">
              {(match.team1_short || match.team1_name || 'T1')
                .slice(0, 3)
                .toUpperCase()}
            </span>
            <span>{match.team1_name || match.team1_short || 'Team 1'}</span>
          </div>

          <span className="normal-vs">VS</span>

          <div className="normal-team normal-team-right">
            <span>{match.team2_name || match.team2_short || 'Team 2'}</span>
            <span className="normal-team-badge">
              {(match.team2_short || match.team2_name || 'T2')
                .slice(0, 3)
                .toUpperCase()}
            </span>
          </div>
        </div>

        <div className="normal-card-meta">
          <span>◷ {match.overs_limit || '—'} overs</span>
          <span className="meta-dot">•</span>
          <span>{match.status === 'upcoming' ? 'Ready to play' : 'Scorecard available'}</span>
        </div>

        {match.result_text && (
          <div className="match-result">
            <span>🏆</span>
            <span>{match.result_text}</span>
          </div>
        )}
      </div>

      <div className="match-actions">
        {match.status === 'upcoming' && (
          <Link
            to={`/match/${match.id}/setup`}
            className="match-action primary-action"
          >
            🏏 Start Toss
          </Link>
        )}

        {match.status === 'innings-break' && (
          <Link
            to={`/match/${match.id}/score`}
            className="match-action primary-action"
          >
            ▶ Continue
          </Link>
        )}

        <Link
          to={`/match/${match.id}/live`}
          state={{ match }}
          className="match-action"
        >
          ◉ View
        </Link>

        <button
          type="button"
          className="match-action"
          onClick={() => onDownload(match.id)}
          disabled={isDeleting}
        >
          ▤ PDF
        </button>

        <button
          type="button"
          className="match-action delete-action"
          onClick={() => onDelete(match.id)}
          disabled={isDeleting}
        >
          ⌫ {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </article>
  );
});

/* =========================================================
   HOME
========================================================= */

export default function Home() {
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem(HOME_INTRO_KEY) !== '1';
    } catch {
      return false;
    }
  });

  const finishIntro = useCallback(() => {
    setShowIntro(false);
  }, []);

  const [matches, setMatches] = useState(() => readMatchesCache());

  const [loading, setLoading] = useState(() => {
    return readMatchesCache().length === 0;
  });

  const [deletingId, setDeletingId] = useState(null);

  /* =======================================================
     LOAD MATCHES
  ======================================================= */

  const loadMatches = useCallback(async () => {
    try {
      const data = await Matches.list();
      const matchList = Array.isArray(data) ? data : [];

      const liveMatches = matchList.filter(
        match => match?.status === 'live'
      );

      if (liveMatches.length === 0) {
        setMatches(matchList);
        writeMatchesCache(matchList);
        return;
      }

      const liveDetails = await Promise.all(
        liveMatches.map(async match => {
          try {
            const detail = await Matches.get(match.id);
            const detailedMatch = detail?.match || detail || {};

            return {
              ...match,
              ...detailedMatch,
              id: match.id,
              status: match.status,
              innings: Array.isArray(detail?.innings)
                ? detail.innings
                : Array.isArray(detailedMatch?.innings)
                  ? detailedMatch.innings
                  : [],
              players: Array.isArray(detail?.players)
                ? detail.players
                : Array.isArray(detailedMatch?.players)
                  ? detailedMatch.players
                  : [],
            };
          } catch (error) {
            console.error(
              `Failed to load live match details for ${match.id}:`,
              error
            );
            return match;
          }
        })
      );

      const liveDetailMap = new Map(
        liveDetails.map(match => [String(match.id), match])
      );

      const enrichedMatches = matchList.map(match => {
        if (match?.status !== 'live') return match;
        return liveDetailMap.get(String(match.id)) || match;
      });

      setMatches(enrichedMatches);
      writeMatchesCache(enrichedMatches);
    } catch (error) {
      console.error('Failed to load matches:', error);

      // Keep cached matches visible when the network is unavailable.
      setMatches(current => current.length > 0 ? current : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  /* =======================================================
     DELETE
  ======================================================= */

  const deleteMatch = useCallback(async matchId => {
    if (matchId == null) {
      window.alert('Invalid match ID.');
      return;
    }

    if (deletingId != null) return;

    const ok = window.confirm(
      'Delete this match permanently?\n\n' +
      'This will delete the match, innings, balls and full scorecard.\n\n' +
      'This action cannot be undone.'
    );

    if (!ok) return;

    setDeletingId(matchId);

    try {
      await Matches.remove(matchId);

      setMatches(current => {
        const next = current.filter(
          match => !sameId(match.id, matchId)
        );
        writeMatchesCache(next);
        return next;
      });

      // Refresh in the background; don't undo a successful deletion
      // if the follow-up refresh encounters a network error.
      try {
        const latest = await Matches.list();
        const latestMatches = Array.isArray(latest) ? latest : [];

        setMatches(latestMatches);
        writeMatchesCache(latestMatches);
      } catch (reloadError) {
        console.warn('Match deleted but refresh failed:', reloadError);
      }
    } catch (error) {
      showDeleteError(error);
    } finally {
      setDeletingId(null);
    }
  }, [deletingId]);

  /* =======================================================
     PDF
  ======================================================= */

  const downloadPdf = useCallback(async matchId => {
    try {
      const detail = await Matches.get(matchId);

      await exportMatchPdf({
        match: detail.match || detail,
        innings: detail.innings || [],
        players: detail.players || [],
      });
    } catch (error) {
      console.error('PDF export failed:', error);
      window.alert('Unable to create PDF. Please try again.');
    }
  }, []);

  /* =======================================================
     LOADING
  ======================================================= */

  if (loading && matches.length === 0) {
    return (
      <>
        {showIntro && <HomeIntro onFinished={finishIntro} />}
        <HomeLoading />
        <HomeStyles />
      </>
    );
  }

  /* =======================================================
     MATCH GROUPS
  ======================================================= */

  const liveMatches = matches.filter(
    match => match?.status === 'live'
  );

  const others = matches.filter(
    match => match?.status !== 'live'
  );

  const totalMatches = matches.length;

  const completedCount = matches.filter(
    match => match?.status === 'completed'
  ).length;

  return (
    <>
      {showIntro && <HomeIntro onFinished={finishIntro} />}

      <main className="home-page stadium-home mx-auto w-full max-w-4xl min-w-0 px-3 pb-10 sm:px-5">
        <StadiumHero
          totalMatches={totalMatches}
          liveCount={liveMatches.length}
          completedCount={completedCount}
        />

        {liveMatches.length > 0 && (
          <section className="home-section">
            <div className="section-heading">
              <div className="section-title-group">
                <span className="section-icon section-icon-live">●</span>
                <div>
                  <h2>LIVE ARENA</h2>
                  <p>Follow the action as it happens</p>
                </div>
              </div>

              <span className="section-count section-count-live">
                {liveMatches.length} LIVE
              </span>
            </div>

            <div className="live-match-list">
              {liveMatches.map(match => (
                <LiveHero
                  key={match.id}
                  match={match}
                  onDeleted={id => {
                    setMatches(current => {
                      const next = current.filter(
                        item => !sameId(item.id, id)
                      );
                      writeMatchesCache(next);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {matches.length === 0 && (
          <section className="stadium-empty">
            <div className="empty-stadium-glow" />
            <div className="empty-cricket-icon">🏏</div>
            <p className="empty-kicker">THE GROUND IS YOURS</p>
            <h2>Ready for the first ball?</h2>
            <p className="empty-description">
              Create your first match and start building your cricket history.
            </p>
            <Link to="/create-match" className="stadium-cta empty-cta">
              <span className="cta-plus">＋</span>
              <span>CREATE YOUR FIRST MATCH</span>
              <span className="cta-arrow">↗</span>
            </Link>
          </section>
        )}

        {others.length > 0 && (
          <section className="home-section other-matches-section">
            <div className="section-heading">
              <div className="section-title-group">
                <span className="section-icon section-icon-all">▦</span>
                <div>
                  <h2>MATCH ARCHIVE</h2>
                  <p>Upcoming fixtures and previous results</p>
                </div>
              </div>

              <span className="section-count">
                {others.length} MATCH{others.length === 1 ? '' : 'ES'}
              </span>
            </div>

            <div className="normal-match-list">
              {others.map((match, index) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  index={index}
                  onDelete={deleteMatch}
                  onDownload={downloadPdf}
                  deletingId={deletingId}
                />
              ))}
            </div>
          </section>
        )}

        <footer className="stadium-footer">
          <span className="footer-emblem">🏏</span>
          <span>GCC CRICKET</span>
          <span className="footer-separator">•</span>
          <span>BUILT FOR THE GAME</span>
        </footer>
      </main>

      <HomeStyles />
    </>
  );
}

/* =========================================================
   STADIUM DESIGN STYLES
========================================================= */

function HomeStyles() {
  return (
    <style>{`
      .stadium-home {
        position: relative;
        color: #f8fafc;
        isolation: isolate;
      }

      .stadium-home::before {
        content: "";
        position: fixed;
        z-index: -1;
        pointer-events: none;
        inset: 0;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(16,185,129,.075), transparent 42%),
          radial-gradient(ellipse at 100% 50%, rgba(14,165,233,.025), transparent 45%);
      }

      /* INTRO */

      .stadium-intro {
        position: fixed;
        z-index: 9999;
        inset: 0;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: #020805;
        animation: intro-exit .35s ease 1.12s forwards;
      }

      .intro-light {
        position: absolute;
        top: -12%;
        width: 45vw;
        height: 80vh;
        opacity: .18;
        filter: blur(28px);
        background: linear-gradient(180deg, rgba(255,255,220,.45), transparent 75%);
        clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%);
      }

      .intro-light-left { left: -12%; transform: rotate(12deg); }
      .intro-light-right { right: -12%; transform: rotate(-12deg); }

      .intro-particles {
        position: absolute;
        inset: 0;
        opacity: .25;
        background-image:
          radial-gradient(circle, #bbf7d0 1px, transparent 1.5px),
          radial-gradient(circle, #ffffff 1px, transparent 1.5px);
        background-size: 53px 61px, 89px 97px;
        background-position: 0 0, 30px 40px;
        animation: particles-drift 10s linear infinite;
      }

      .intro-content {
        position: relative;
        text-align: center;
        animation: intro-content-in .65s cubic-bezier(.2,.8,.2,1) both;
      }

      .intro-cricket-ball {
        display: grid;
        place-items: center;
        width: 76px;
        height: 76px;
        margin: 0 auto 22px;
        border: 1px solid rgba(52,211,153,.3);
        border-radius: 24px;
        background: linear-gradient(145deg, rgba(16,185,129,.22), rgba(15,23,42,.65));
        box-shadow: 0 0 55px rgba(16,185,129,.12);
        font-size: 36px;
      }

      .intro-eyebrow {
        color: #6ee7b7;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .4em;
      }

      .intro-content h1 {
        margin-top: 8px;
        font-size: clamp(42px, 10vw, 66px);
        font-weight: 1000;
        font-style: italic;
        letter-spacing: -.07em;
        line-height: .98;
      }

      .intro-content h2 {
        margin-top: 9px;
        color: #a7f3d0;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .3em;
      }

      .intro-progress {
        width: 135px;
        height: 3px;
        margin: 25px auto 15px;
        overflow: hidden;
        border-radius: 99px;
        background: #1e293b;
      }

      .intro-progress span {
        display: block;
        width: 40%;
        height: 100%;
        border-radius: inherit;
        background: #34d399;
        animation: intro-progress 1s ease-in-out infinite;
      }

      .intro-caption {
        color: #64748b;
        font-size: 10px;
        letter-spacing: .04em;
      }

      /* HERO */

      .stadium-hero {
        position: relative;
        min-height: 425px;
        margin: 8px 0 30px;
        overflow: hidden;
        isolation: isolate;
        border: 1px solid rgba(148,163,184,.18);
        border-radius: 27px;
        background: #06130f;
        box-shadow: 0 24px 65px rgba(0,0,0,.28);
        animation: section-enter .55s ease-out both;
      }

      .stadium-sky {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse at 50% 48%, rgba(34,197,94,.19), transparent 38%),
          linear-gradient(180deg, #071b22 0%, #0a2922 46%, #07140e 100%);
      }

      .stadium-lights {
        position: absolute;
        z-index: 1;
        top: -15px;
        width: 52%;
        height: 240px;
        pointer-events: none;
        opacity: .8;
        background: linear-gradient(180deg, rgba(255,255,235,.18), rgba(255,255,235,.04) 40%, transparent 100%);
        clip-path: polygon(0 0, 100% 0, 72% 100%, 30% 100%);
        filter: blur(10px);
        animation: lights-breathe 5s ease-in-out infinite;
      }

      .stadium-lights::before {
        content: "";
        position: absolute;
        top: 12px;
        left: 8%;
        width: 84%;
        height: 18px;
        background: repeating-linear-gradient(90deg, #fffde7 0 4px, transparent 4px 13px);
        filter: drop-shadow(0 0 6px rgba(255,255,220,.9));
      }

      .stadium-lights-left { left: -7%; transform: rotate(8deg); }
      .stadium-lights-right { right: -7%; transform: rotate(-8deg); animation-delay: -2.5s; }

      .stadium-stands {
        position: absolute;
        left: -10%;
        right: -10%;
        bottom: 0;
        height: 54%;
        opacity: .68;
        background:
          repeating-linear-gradient(0deg, transparent 0 12px, rgba(255,255,255,.045) 13px 14px),
          repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 2px, transparent 2px 17px),
          linear-gradient(180deg, transparent, rgba(0,0,0,.8));
        transform: perspective(240px) rotateX(-5deg);
        transform-origin: bottom;
      }

      .stadium-crowd {
        position: absolute;
        right: 0;
        bottom: 24%;
        left: 0;
        height: 90px;
        opacity: .36;
        background-image:
          radial-gradient(circle, rgba(167,243,208,.85) 1px, transparent 1.6px),
          radial-gradient(circle, rgba(255,255,255,.7) 1px, transparent 1.5px),
          radial-gradient(circle, rgba(251,191,36,.7) 1px, transparent 1.5px);
        background-size: 13px 15px, 19px 17px, 29px 23px;
        background-position: 0 0, 8px 5px, 15px 2px;
        mask-image: linear-gradient(180deg, transparent, black 25%, black 80%, transparent);
      }

      .stadium-pitch {
        position: absolute;
        right: 6%;
        bottom: -95px;
        width: 47%;
        height: 280px;
        opacity: .42;
        overflow: hidden;
        transform: perspective(230px) rotateX(37deg);
        border: 1px solid rgba(134,239,172,.3);
        border-radius: 50% 50% 0 0;
        background:
          repeating-linear-gradient(90deg, rgba(34,197,94,.05) 0 15px, rgba(34,197,94,.12) 15px 30px),
          linear-gradient(180deg, rgba(21,128,61,.3), rgba(2,44,22,.8));
      }

      .pitch-line {
        position: absolute;
        left: 8%;
        right: 8%;
        height: 2px;
        background: rgba(220,252,231,.6);
      }

      .pitch-line-top { top: 25%; }
      .pitch-line-bottom { bottom: 22%; }
      .pitch-center-line {
        position: absolute;
        top: 25%;
        bottom: 22%;
        left: 50%;
        border-left: 1px solid rgba(220,252,231,.4);
      }

      .pitch-stumps {
        position: absolute;
        left: calc(50% - 9px);
        display: flex;
        gap: 3px;
      }

      .pitch-stumps-top { top: 18%; }
      .pitch-stumps-bottom { bottom: 15%; }

      .pitch-stumps i {
        width: 2px;
        height: 12px;
        background: #ecfccb;
      }

      .stadium-hero-shade {
        position: absolute;
        z-index: 2;
        inset: 0;
        background:
          linear-gradient(90deg, rgba(2,10,7,.88) 0%, rgba(2,10,7,.66) 53%, rgba(2,10,7,.16) 100%),
          linear-gradient(0deg, rgba(2,10,7,.84), transparent 42%);
      }

      .stadium-hero-content {
        position: relative;
        z-index: 3;
        display: flex;
        min-height: 425px;
        flex-direction: column;
        padding: 24px 24px 18px;
      }

      .stadium-brand {
        display: flex;
        align-items: center;
        gap: 9px;
        color: #d1fae5;
        font-size: 10px;
        font-weight: 950;
        letter-spacing: .13em;
      }

      .brand-ball { font-size: 18px; }
      .brand-divider { color: #475569; }
      .brand-season { color: #94a3b8; font-size: 9px; letter-spacing: .16em; }

      .stadium-heading {
        margin-top: 31px;
      }

      .stadium-kicker {
        margin-bottom: 8px;
        color: #6ee7b7;
        font-size: 9px;
        font-weight: 950;
        letter-spacing: .3em;
      }

      .stadium-heading h1 {
        font-size: clamp(40px, 8vw, 65px);
        font-weight: 1000;
        font-style: italic;
        line-height: .89;
        letter-spacing: -.075em;
        text-shadow: 0 5px 28px rgba(0,0,0,.22);
      }

      .stadium-heading h1 span {
        color: #a7f3d0;
        text-shadow: 0 0 34px rgba(52,211,153,.15);
      }

      .stadium-description {
        margin-top: 17px;
        color: #b6c7bf;
        font-size: 12px;
        line-height: 1.7;
      }

      .stadium-cta {
        position: relative;
        display: inline-flex;
        min-height: 46px;
        width: fit-content;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 20px;
        overflow: hidden;
        border: 1px solid rgba(167,243,208,.65);
        border-radius: 12px;
        padding: 0 15px;
        background: linear-gradient(115deg, #a7f3d0, #34d399);
        color: #042516;
        box-shadow: 0 8px 28px rgba(16,185,129,.18);
        font-size: 10px;
        font-weight: 1000;
        letter-spacing: .055em;
        transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
      }

      .stadium-cta::before {
        content: "";
        position: absolute;
        top: -50%;
        bottom: -50%;
        left: -55%;
        width: 25%;
        transform: rotate(20deg);
        background: rgba(255,255,255,.65);
        filter: blur(5px);
        transition: left .5s ease;
      }

      .stadium-cta:hover::before { left: 130%; }
      .stadium-cta:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 35px rgba(16,185,129,.3);
        filter: saturate(1.08);
      }

      .stadium-cta:active { transform: scale(.97); }
      .cta-plus { font-size: 17px; line-height: 1; }
      .cta-arrow { margin-left: 5px; font-size: 15px; }

      .stadium-stats {
        display: flex;
        align-items: center;
        gap: 18px;
        margin-top: auto;
        padding-top: 28px;
      }

      .stadium-stat { display: flex; flex-direction: column; gap: 4px; }
      .stat-number { display: flex; align-items: center; gap: 7px; font-size: 21px; font-weight: 950; line-height: 1; }
      .stat-live { color: #fca5a5; }
      .stat-label { color: #94a3a0; font-size: 8px; font-weight: 900; letter-spacing: .12em; }
      .stat-divider { width: 1px; height: 29px; background: rgba(148,163,184,.23); }

      .live-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #f87171;
      }

      .live-dot-pulse {
        animation: live-pulse 1.5s ease-in-out infinite;
      }

      .stadium-bottom-label {
        position: absolute;
        z-index: 3;
        right: 23px;
        bottom: 22px;
        display: flex;
        align-items: center;
        gap: 9px;
        color: rgba(209,250,229,.65);
        font-size: 8px;
        font-weight: 900;
        letter-spacing: .15em;
      }

      .bottom-label-line { width: 26px; height: 1px; background: rgba(167,243,208,.45); }

      /* SECTION HEADINGS */

      .home-section { margin-bottom: 30px; }
      .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 13px;
      }

      .section-title-group { display: flex; align-items: center; gap: 11px; min-width: 0; }
      .section-icon {
        display: grid;
        width: 37px;
        height: 37px;
        flex: 0 0 auto;
        place-items: center;
        border: 1px solid rgba(148,163,184,.14);
        border-radius: 12px;
        background: rgba(15,23,42,.8);
        font-size: 13px;
      }

      .section-icon-live { border-color: rgba(248,113,113,.18); color: #f87171; }
      .section-icon-all { color: #6ee7b7; }

      .section-heading h2 {
        color: #f1f5f9;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: .12em;
      }

      .section-heading p { margin-top: 3px; color: #64748b; font-size: 10px; }
      .section-count {
        flex: 0 0 auto;
        border: 1px solid #273449;
        border-radius: 999px;
        padding: 6px 9px;
        background: rgba(15,23,42,.7);
        color: #94a3b8;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: .07em;
      }

      .section-count-live {
        border-color: rgba(248,113,113,.22);
        background: rgba(127,29,29,.12);
        color: #fca5a5;
      }

      .live-match-list, .normal-match-list { display: grid; gap: 13px; }

      /* LIVE MATCH CARD */

      .live-match-card {
        overflow: hidden;
        border: 1px solid rgba(248,113,113,.2);
        border-radius: 21px;
        background:
          radial-gradient(ellipse at 50% 15%, rgba(127,29,29,.14), transparent 60%),
          linear-gradient(145deg, rgba(15,23,42,.98), rgba(5,12,21,.98));
        box-shadow: 0 12px 35px rgba(0,0,0,.16);
        animation: card-enter .45s ease-out both;
        transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease;
      }

      .live-match-card:hover {
        transform: translateY(-3px);
        border-color: rgba(248,113,113,.42);
        box-shadow: 0 17px 40px rgba(127,29,29,.12);
      }

      .live-card-topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(148,163,184,.1);
      }

      .live-label { display: flex; align-items: center; gap: 8px; color: #fca5a5; font-size: 9px; font-weight: 1000; letter-spacing: .18em; }
      .overs-pill { border: 1px solid rgba(148,163,184,.12); border-radius: 999px; padding: 5px 8px; background: rgba(15,23,42,.8); color: #94a3b8; font-size: 8px; font-weight: 900; letter-spacing: .08em; }

      .live-score-link { display: block; padding: 17px 16px 14px; }
      .live-team-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 13px; }
      .live-team { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
      .live-team-right { align-items: flex-end; text-align: right; }
      .live-team-name { color: #f8fafc; font-size: clamp(18px, 4vw, 25px); font-weight: 1000; letter-spacing: -.04em; overflow-wrap: anywhere; }
      .live-team-full { max-width: 100%; overflow: hidden; color: #64748b; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
      .live-versus { display: grid; width: 32px; height: 32px; place-items: center; border: 1px solid rgba(148,163,184,.14); border-radius: 50%; background: #0b1220; color: #64748b; font-size: 8px; font-weight: 1000; }

      .live-score-panel {
        margin-top: 18px;
        border: 1px solid rgba(148,163,184,.08);
        border-radius: 17px;
        padding: 18px 12px 15px;
        background: linear-gradient(135deg, rgba(2,6,23,.55), rgba(15,23,42,.52));
        text-align: center;
      }

      .live-batting-team { color: #94a3b8; font-size: 8px; font-weight: 950; letter-spacing: .18em; }
      .live-score { display: flex; align-items: baseline; justify-content: center; margin-top: 7px; color: #f8fafc; font-size: clamp(48px, 11vw, 65px); font-weight: 1000; letter-spacing: -.075em; line-height: 1; }
      .live-score-slash { margin: 0 3px; color: #64748b; font-size: .7em; }
      .live-wickets { color: #cbd5e1; }
      .live-over-info { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 9px; margin-top: 11px; color: #94a3b8; font-size: 9px; font-weight: 800; letter-spacing: .05em; }
      .score-info-divider { width: 3px; height: 3px; border-radius: 50%; background: #475569; }
      .live-score-no-data { color: #94a3b8; font-size: 12px; }
      .score-pop { animation: score-pop .42s cubic-bezier(.2,.8,.2,1); }

      .live-batting-pill { display: flex; width: fit-content; align-items: center; gap: 8px; margin: 12px auto 0; border: 1px solid rgba(148,163,184,.12); border-radius: 999px; padding: 7px 11px; background: rgba(2,6,23,.45); color: #cbd5e1; font-size: 9px; font-weight: 800; }
      .live-batting-pill .live-dot { width: 5px; height: 5px; background: #34d399; }
      .view-live-hint { display: flex; justify-content: center; gap: 7px; margin-top: 14px; color: #fca5a5; font-size: 8px; font-weight: 950; letter-spacing: .16em; }
      .view-live-hint span { font-size: 12px; line-height: 8px; transition: transform .2s ease; }
      .live-score-link:hover .view-live-hint span { transform: translate(2px,-2px); }

      /* MATCH ACTIONS */

      .match-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        border-top: 1px solid rgba(148,163,184,.1);
        padding: 9px;
        background: rgba(2,6,23,.38);
      }

      .match-actions-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }

      .match-action {
        display: flex;
        min-width: 0;
        min-height: 39px;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 1px solid transparent;
        border-radius: 10px;
        padding: 7px 5px;
        background: rgba(30,41,59,.65);
        color: #cbd5e1;
        font-size: 10px;
        font-weight: 850;
        text-align: center;
        transition: transform .16s ease, background .16s ease, border-color .16s ease, color .16s ease;
      }

      .match-action:hover { transform: translateY(-1px); border-color: rgba(148,163,184,.12); background: #263449; color: white; }
      .match-action:active { transform: scale(.96); }
      .match-action:disabled { cursor: not-allowed; opacity: .45; }
      .match-action span { font-size: 13px; }
      .primary-action { border-color: rgba(52,211,153,.12); background: rgba(16,185,129,.1); color: #6ee7b7; }
      .primary-action:hover { background: rgba(16,185,129,.18); color: #a7f3d0; }
      .delete-action { background: rgba(127,29,29,.13); color: #fca5a5; }
      .delete-action:hover { border-color: rgba(248,113,113,.15); background: rgba(127,29,29,.27); color: #fecaca; }

      /* NORMAL MATCH CARDS */

      .normal-match-card {
        overflow: hidden;
        border: 1px solid rgba(148,163,184,.13);
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(15,23,42,.88), rgba(8,14,25,.95));
        box-shadow: 0 8px 24px rgba(0,0,0,.1);
        animation: card-enter .42s ease-out both;
        transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
      }

      .normal-match-card:hover {
        transform: translateY(-2px);
        border-color: rgba(110,231,183,.23);
        box-shadow: 0 12px 28px rgba(0,0,0,.17);
      }

      .normal-card-content { padding: 15px; }
      .normal-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .normal-match-number { color: #64748b; font-size: 8px; font-weight: 950; letter-spacing: .14em; }
      .normal-match-number span { color: #cbd5e1; }
      .match-status { flex: 0 0 auto; border-width: 1px; border-radius: 999px; padding: 5px 8px; font-size: 8px; font-weight: 950; text-transform: uppercase; letter-spacing: .05em; }

      .normal-team-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; margin-top: 19px; }
      .normal-team { display: flex; min-width: 0; align-items: center; gap: 9px; color: #f1f5f9; font-size: 12px; font-weight: 850; }
      .normal-team > span:not(.normal-team-badge) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .normal-team-right { justify-content: flex-end; text-align: right; }
      .normal-team-badge { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border: 1px solid rgba(110,231,183,.15); border-radius: 11px; background: rgba(16,185,129,.08); color: #a7f3d0; font-size: 9px; font-weight: 1000; }
      .normal-vs { color: #475569; font-size: 8px; font-weight: 1000; }
      .normal-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; color: #64748b; font-size: 9px; font-weight: 750; }
      .meta-dot { color: #334155; }

      .match-result { display: flex; align-items: center; gap: 9px; margin-top: 13px; border: 1px solid rgba(52,211,153,.12); border-radius: 11px; padding: 10px; background: rgba(16,185,129,.055); color: #6ee7b7; font-size: 10px; font-weight: 800; }
      .match-result > span:last-child { min-width: 0; overflow-wrap: anywhere; }

      /* EMPTY STATE */

      .stadium-empty {
        position: relative;
        overflow: hidden;
        margin: 18px 0 30px;
        border: 1px dashed rgba(110,231,183,.22);
        border-radius: 23px;
        padding: 42px 20px;
        background: radial-gradient(ellipse at 50% 0%, rgba(16,185,129,.1), transparent 65%), rgba(15,23,42,.48);
        text-align: center;
        animation: section-enter .45s ease-out both;
      }

      .empty-stadium-glow { position: absolute; top: 0; left: 50%; width: 180px; height: 110px; transform: translateX(-50%); border-radius: 50%; background: rgba(16,185,129,.12); filter: blur(45px); pointer-events: none; }
      .empty-cricket-icon { position: relative; display: grid; width: 65px; height: 65px; place-items: center; margin: 0 auto; border: 1px solid rgba(110,231,183,.18); border-radius: 20px; background: rgba(16,185,129,.08); font-size: 31px; animation: cricket-float 2.8s ease-in-out infinite; }
      .empty-kicker { position: relative; margin-top: 20px; color: #6ee7b7; font-size: 8px; font-weight: 950; letter-spacing: .24em; }
      .stadium-empty h2 { position: relative; margin-top: 8px; color: #f8fafc; font-size: 20px; font-weight: 950; letter-spacing: -.04em; }
      .empty-description { position: relative; max-width: 300px; margin: 8px auto 0; color: #94a3b8; font-size: 11px; line-height: 1.7; }
      .empty-cta { margin-top: 21px; }

      /* FOOTER */

      .stadium-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 9px; margin-top: 32px; color: #475569; font-size: 8px; font-weight: 950; letter-spacing: .16em; }
      .footer-emblem { font-size: 14px; }
      .footer-separator { color: #334155; }

      /* MOTION */

      @keyframes intro-content-in {
        from { opacity: 0; transform: translateY(15px) scale(.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes intro-exit {
        to { opacity: 0; visibility: hidden; pointer-events: none; }
      }

      @keyframes intro-progress {
        0% { transform: translateX(-130%); }
        100% { transform: translateX(280%); }
      }

      @keyframes particles-drift {
        from { background-position: 0 0, 30px 40px; }
        to { background-position: 53px 61px, 119px 137px; }
      }

      @keyframes lights-breathe {
        0%, 100% { opacity: .65; }
        50% { opacity: .95; }
      }

      @keyframes live-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(248,113,113,.42); }
        50% { box-shadow: 0 0 0 5px rgba(248,113,113,0); }
      }

      @keyframes score-pop {
        0% { transform: scale(1); }
        45% { transform: scale(1.045); }
        100% { transform: scale(1); }
      }

      @keyframes section-enter {
        from { opacity: 0; transform: translateY(9px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes card-enter {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes cricket-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }

      @media (max-width: 520px) {
        .stadium-hero { min-height: 405px; border-radius: 22px; }
        .stadium-hero-content { min-height: 405px; padding: 20px 17px 17px; }
        .stadium-heading { margin-top: 33px; }
        .stadium-stats { gap: 13px; }
        .stat-number { font-size: 19px; }
        .stat-label { font-size: 7px; letter-spacing: .08em; }
        .stadium-pitch { right: -15%; width: 67%; opacity: .3; }
        .stadium-bottom-label { right: 17px; bottom: 17px; font-size: 7px; }
        .live-card-topline { padding: 12px; }
        .live-score-link { padding: 14px 12px 12px; }
        .normal-card-content { padding: 12px; }
        .match-actions { gap: 4px; padding: 7px; }
        .match-action { gap: 4px; font-size: 9px; }
      }

      @media (max-width: 360px) {
        .stadium-brand { gap: 6px; font-size: 8px; }
        .brand-season { font-size: 7px; }
        .stadium-hero { min-height: 390px; }
        .stadium-hero-content { min-height: 390px; padding: 17px 13px; }
        .stadium-heading h1 { font-size: 40px; }
        .stadium-stats { gap: 9px; }
        .stat-number { font-size: 17px; }
        .normal-team { gap: 5px; font-size: 10px; }
        .normal-team-badge { width: 28px; height: 28px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .stadium-home *,
        .stadium-intro *,
        .stadium-intro,
        .stadium-home::before {
          animation: none !important;
          transition: none !important;
          scroll-behavior: auto !important;
        }
      }
    `}</style>
  );
}
