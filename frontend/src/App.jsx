import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

import Navbar from './components/Navbar.jsx';
import NotificationRegistration from './components/NotificationRegistration.jsx';
import ScoreboardGate from './components/ScoreboardGate.jsx';

// Load pages only when they are actually opened
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

export default function App() {
  return (
    <div className="min-h-screen bg-stadium">

      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-6 lg:max-w-7xl">

        <Suspense fallback={<PageLoading />}>
          <Routes>

            <Route
              path="/"
              element={<Home />}
            />

            <Route
              path="/records"
              element={<Records />}
            />

            <Route
              path="/teams"
              element={<TeamManager />}
            />

            <Route
              path="/players"
              element={<PlayerRecords />}
            />

            <Route
              path="/create-match"
              element={
                <ScoreboardGate>
                  <CreateMatch />
                </ScoreboardGate>
              }
            />

            <Route
              path="/match/:matchId/setup"
              element={<MatchSetup />}
            />

            <Route
              path="/match/:matchId/score"
              element={
                <ScoreboardGate>
                  <Scorer />
                </ScoreboardGate>
              }
            />

            <Route
              path="/match/:matchId/live"
              element={<LiveScoreboard />}
            />

          </Routes>
        </Suspense>

      </main>

      <NotificationRegistration />

    </div>
  );
}