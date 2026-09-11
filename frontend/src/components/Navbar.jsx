import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Matches', icon: '🏟️' },
  { path: '/records', label: 'Records', icon: '📜' },
  { path: '/players', label: 'Player Stats', icon: '📊' },
  { path: '/create-match', label: 'New Scoreboard', icon: '➕' },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = (path) =>
    `px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center gap-1.5 ${
      pathname === path
        ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-900/40'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <nav className="bg-slate-900/95 border-b border-slate-700/60 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">

        {/* Golden Cricket Club Branding */}
        <Link
          to="/"
          className="flex items-center gap-3"
          onClick={() => setMenuOpen(false)}
        >
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-700 flex items-center justify-center shadow-lg shadow-yellow-900/30">
            <span className="text-2xl">🏏</span>
          </div>

          <div className="leading-tight">
            <div className="text-lg sm:text-xl font-black tracking-tight bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
              GOLDEN CRICKET CLUB
            </div>

            <div className="text-[10px] sm:text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
              Cricket Scoreboard
            </div>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex gap-1 items-center">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={linkClass(item.path)}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          <Link
            to="/teams"
            className="ml-2 text-xs text-slate-400 hover:text-yellow-400 border border-slate-700 rounded-lg px-2 py-1.5 transition-colors"
          >
            Manage Teams
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-2xl text-white"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-700/60 bg-slate-900/95 px-4 py-3 space-y-1 fade-in">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMenuOpen(false)}
              className={`${linkClass(item.path)} w-full`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          <Link
            to="/teams"
            onClick={() => setMenuOpen(false)}
            className={`${linkClass('/teams')} w-full`}
          >
            <span>👥</span>
            Manage Teams
          </Link>
        </div>
      )}
    </nav>
  );
}import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Matches', icon: '🏟️' },
  { path: '/records', label: 'Records', icon: '📜' },
  { path: '/players', label: 'Player Stats', icon: '📊' },
  { path: '/create-match', label: 'New Scoreboard', icon: '➕' },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = (path) =>
    `px-3 py-2 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center gap-1.5 ${
      pathname === path
        ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-900/40'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <nav className="bg-slate-900/95 border-b border-slate-700/60 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-xl font-extrabold flex items-center gap-2 tracking-tight" onClick={() => setMenuOpen(false)}>
          <span className="text-2xl">🏏</span>
          <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">CricScore</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex gap-1 items-center">
          {NAV_ITEMS.map(item => (
            <Link key={item.path} to={item.path} className={linkClass(item.path)}>
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
          <Link to="/teams" className="ml-2 text-xs text-slate-400 hover:text-emerald-400 border border-slate-700 rounded-lg px-2 py-1.5">
            Manage Teams
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden text-2xl" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-700/60 bg-slate-900/95 px-4 py-3 space-y-1 fade-in">
          {NAV_ITEMS.map(item => (
            <Link key={item.path} to={item.path} onClick={() => setMenuOpen(false)}
              className={`${linkClass(item.path)} w-full`}>
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
          <Link to="/teams" onClick={() => setMenuOpen(false)} className={`${linkClass('/teams')} w-full`}>
            <span>👥</span>Manage Teams
          </Link>
        </div>
      )}
    </nav>
  );
}
