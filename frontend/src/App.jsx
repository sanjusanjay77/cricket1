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

/*
=========================================================
1ST INNINGS TARGET PAGE
=========================================================
*/

const InningsTarget = lazy(
  () => import('./pages/InningsTarget.jsx')
);

/*
=========================================================
PAGE LOADING
=========================================================
*/

function PageLoading() {
  return (
    <div
      className="
        flex
        min-h-[300px]
        w-full
        items-center
        justify-center
        px-4
      "
    >
      <div className="text-sm text-slate-400">
        Loading...
      </div>
    </div>
  );
}

/*
=========================================================
PAGE ERROR
=========================================================
*/

function PageError({ error }) {
  return (
    <div className="mx-auto mt-6 w-full max-w-xl px-3 sm:mt-10 sm:px-4">

      <div className="
        rounded-2xl
        border
        border-red-500/30
        bg-red-950/40
        p-4
        sm:p-5
      ">

        <h2 className="
          text-base
          font-bold
          text-red-300
          sm:text-lg
        ">
          Unable to open this page
        </h2>

        <p className="
          mt-2
          break-words
          text-sm
          leading-6
          text-slate-400
        ">
          {error?.message ||
            'Something went wrong while loading the page.'}
        </p>

        <button
          type="button"
          className="
            btn
            btn-primary
            mt-4
            min-h-[44px]
            w-full
            sm:w-auto
          "
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload Page
        </button>

      </div>

    </div>
  );
}

/*
=========================================================
ROUTE ERROR BOUNDARY
=========================================================
*/

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

/*
=========================================================
APP
=========================================================
*/

export default function App() {
  return (
    <div
      className="
        min-h-screen
        w-full
        overflow-x-hidden
        bg-stadium
      "
    >

      {/* =================================================
          NAVBAR
      ================================================= */}

      <Navbar />

      {/* =================================================
          MAIN CONTENT
      ================================================= */}

      <main
        className="
          mx-auto
          w-full
          max-w-7xl
          overflow-x-hidden
          px-3
          py-4
          sm:px-4
          sm:py-5
          md:px-6
          md:py-6
          lg:px-8
          lg:py-8
        "
      >

        <RouteErrorBoundary>

          <Suspense fallback={<PageLoading />}>

            <Routes>

              {/* =================================================
                  HOME
              ================================================= */}

              <Route
                path="/"
                element={<Home />}
              />

              {/* =================================================
                  RECORDS
              ================================================= */}

              <Route
                path="/records"
                element={<Records />}
              />

              {/* =================================================
                  TEAMS
              ================================================= */}

              <Route
                path="/teams"
                element={<TeamManager />}
              />

              {/* =================================================
                  PLAYERS
              ================================================= */}

              <Route
                path="/players"
                element={<PlayerRecords />}
              />

              {/* =================================================
                  CREATE MATCH
              ================================================= */}

              <Route
                path="/create-match"
                element={
                  <ScoreboardGate>
                    <CreateMatch />
                  </ScoreboardGate>
                }
              />

              {/* =================================================
                  MATCH SETUP
              ================================================= */}

              <Route
                path="/match/:matchId/setup"
                element={<MatchSetup />}
              />

              {/* =================================================
                  SCORER
              ================================================= */}

              <Route
                path="/match/:matchId/score"
                element={
                  <ScoreboardGate>
                    <Scorer />
                  </ScoreboardGate>
                }
              />

              {/* =================================================
                  1ST INNINGS TARGET

                  IMPORTANT:
                  NO ScoreboardGate HERE.

                  This prevents ScoreboardGate from redirecting
                  or blocking the target screen.
              ================================================= */}

              <Route
                path="/match/:matchId/target"
                element={<InningsTarget />}
              />

              {/* =================================================
                  LIVE SCOREBOARD
              ================================================= */}

              <Route
                path="/match/:matchId/live"
                element={<LiveScoreboard />}
              />

              {/* =================================================
                  FALLBACK
              ================================================= */}

              <Route
                path="*"
                element={
                  <div className="
                    mx-auto
                    flex
                    min-h-[300px]
                    max-w-xl
                    items-center
                    justify-center
                    px-4
                    text-center
                  ">
                    <div>

                      <div className="
                        text-xl
                        font-bold
                        text-white
                      ">
                        Page not found
                      </div>

                      <div className="
                        mt-2
                        text-sm
                        text-slate-400
                      ">
                        The requested page does not exist.
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = '/';
                        }}
                        className="
                          mt-5
                          rounded-xl
                          bg-emerald-500
                          px-5
                          py-3
                          font-bold
                          text-slate-950
                        "
                      >
                        Go Home
                      </button>

                    </div>
                  </div>
                }
              />

            </Routes>

          </Suspense>

        </RouteErrorBoundary>

      </main>

      {/* =================================================
          NOTIFICATIONS
      ================================================= */}

      <NotificationRegistration />

    </div>
  );
}
