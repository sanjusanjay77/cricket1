import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import NotificationRegistration from './components/NotificationRegistration.jsx';
import ScoreboardGate from './components/ScoreboardGate.jsx';

const Home = lazy(() => import('./pages/Home.jsx'));
const TeamManager = lazy(() => import('./pages/TeamManager.jsx'));
const PlayerRecords = lazy(() => import('./pages/PlayerRecords.jsx'));
const Records = lazy(() => import('./pages/Records.jsx'));
const CreateMatch = lazy(() => import('./pages/CreateMatch.jsx'));
const MatchSetup = lazy(() => import('./pages/MatchSetup.jsx'));
const Scorer = lazy(() => import('./pages/Scorer.jsx'));
const LiveScoreboard = lazy(() => import('./pages/LiveScoreboard.jsx'));

function PageLoading() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <div className="text-sm text-slate-400">
        Loading...
      </div>
    </div>
  );
}

function PageError({ error }) {
  return (
    <div className="max-w-xl mx-auto mt-10 px-4">
      <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-5">

        <h2 className="text-lg font-bold text-red-300">
          Unable to open this page
        </h2>

        <p className="text-sm text-slate-400 mt-2 break-words">
          {error?.message ||
            'Something went wrong while loading the page.'}
        </p>

        <button
          type="button"
          className="btn btn-primary mt-4"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </button>

      </div>
    </div>
  );
}

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error,
    };
  }

  componentDidCatch(error, info) {
    console.error(
      'Route rendering error:',
      error,
      info
    );
  }

  render() {
    if (this.state.error) {
      return (
        <PageError
          error={this.state.error}
        />
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <div className="min-h-screen bg-stadium">

      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-6 lg:max-w-7xl">

        <RouteErrorBoundary>

          <Suspense fallback={<PageLoading />}>

            <Routes>

              {/* HOME */}
              <Route
                path="/"
                element={<Home />}
              />

              {/* RECORDS */}
              <Route
                path="/records"
                element={<Records />}
              />

              {/* TEAMS */}
              <Route
                path="/teams"
                element={<TeamManager />}
              />

              {/* PLAYERS */}
              <Route
                path="/players"
                element={<PlayerRecords />}
              />

              {/* CREATE MATCH */}
              <Route
                path="/create-match"
                element={
                  <ScoreboardGate>
                    <CreateMatch />
                  </ScoreboardGate>
                }
              />

              {/* MATCH SETUP / TOSS */}
              <Route
                path="/match/:matchId/setup"
                element={<MatchSetup />}
              />

              {/* SCORER */}
              <Route
                path="/match/:matchId/score"
                element={
                  <ScoreboardGate>
                    <Scorer />
                  </ScoreboardGate>
                }
              />

              {/* LIVE SCOREBOARD */}
              <Route
                path="/match/:matchId/live"
                element={<LiveScoreboard />}
              />

            </Routes>

          </Suspense>

        </RouteErrorBoundary>

      </main>

      <NotificationRegistration />

    </div>
  );
}
