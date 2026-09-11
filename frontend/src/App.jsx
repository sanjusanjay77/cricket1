import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import TeamManager from './pages/TeamManager.jsx';
import PlayerRecords from './pages/PlayerRecords.jsx';
import Records from './pages/Records.jsx';
import CreateMatch from './pages/CreateMatch.jsx';
import ScoreboardGate from './components/ScoreboardGate.jsx';
import MatchSetup from './pages/MatchSetup.jsx';
import Scorer from './pages/Scorer.jsx';
import LiveScoreboard from './pages/LiveScoreboard.jsx';

export default function App() {
  return (
    <div className="min-h-screen bg-stadium">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-6 lg:max-w-7xl">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/records" element={<Records />} />
          <Route path="/teams" element={<TeamManager />} />
          <Route path="/players" element={<PlayerRecords />} />
          <Route path="/create-match" element={<ScoreboardGate><CreateMatch /></ScoreboardGate>} />
          <Route path="/match/:matchId/setup" element={<MatchSetup />} />
         <Route path="/match/:matchId/score" element={<ScoreboardGate> <Scorer /></ScoreboardGate>}/>
          <Route path="/match/:matchId/live" element={<LiveScoreboard />} />
        </Routes>
      </main>
    </div>
  );
}
