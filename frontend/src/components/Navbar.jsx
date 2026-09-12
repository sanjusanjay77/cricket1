
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
        ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-slate-950 shadow-md shadow-yellow-900/40'
        : 'text-slate-300 hover:bg-slate-800 hover:text-yellow-300'
    }`;

  return (
    <nav className="bg-slate-950 border-b-2 border-yellow-500/40 sticky top-0 z-50 shadow-lg shadow-black/30">

      <div className="max-w-7xl mx-auto px-4 py-3">

        <div className="flex items-center justify-between">

          {/* =================================================
              GOLDEN CRICKET CLUB LOGO + NAME
          ================================================= */}

          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-4 group min-w-0"
          >

            {/* =================================================
                LARGE ROUND LOGO
            ================================================= */}

            <div
              className="
                w-20 h-20
                sm:w-24 sm:h-24
                rounded-full
                overflow-hidden
                flex-shrink-0
                bg-black
                border-2 border-yellow-400
                shadow-xl shadow-yellow-500/30
                group-hover:scale-105
                transition-transform duration-200
              "
            >
              <img
                src="/WhatsApp Image 2026-09-12 at 9.19.32 AM.jpeg"
                alt="Golden Cricket Club"
                className="
                  w-full
                  h-full
                  object-cover
                  rounded-full
                "
              />
            </div>

            {/* =================================================
                CLUB NAME
            ================================================= */}

            <div className="min-w-0">

              <div
                className="
                  text-lg
                  sm:text-2xl
                  font-black
                  tracking-wide
                  leading-none
                  bg-gradient-to-r
                  from-yellow-200
                  via-yellow-400
                  to-amber-500
                  bg-clip-text
                  text-transparent
                  truncate
                "
              >
                GOLDEN CRICKET CLUB
              </div>

              <div
                className="
                  mt-2
                  text-[8px]
                  sm:text-[10px]
                  tracking-[0.25em]
                  sm:tracking-[0.3em]
                  font-bold
                  text-slate-400
                  uppercase
                "
              >
                Official Cricket Scoreboard
              </div>

            </div>

          </Link>

          {/* =================================================
              DESKTOP NAVIGATION
          ================================================= */}

          <div className="hidden md:flex items-center gap-1">

            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={linkClass(item.path)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}

            {/* MANAGE TEAMS */}

            <Link
              to="/teams"
              className="
                ml-2
                px-3
                py-2
                rounded-xl
                text-xs
                font-semibold
                text-slate-300
                border
                border-slate-700
                hover:border-yellow-500
                hover:text-yellow-300
                hover:bg-slate-800
                transition-all
              "
            >
              👥 Manage Teams
            </Link>

          </div>

          {/* =================================================
              MOBILE MENU BUTTON
          ================================================= */}

          <button
            type="button"
            className="
              md:hidden
              text-2xl
              text-yellow-400
              px-2
              py-2
              rounded-lg
              hover:bg-slate-800
              transition
            "
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {menuOpen ? '✕' : '☰'}
          </button>

        </div>

        {/* =================================================
            MOBILE NAVIGATION
        ================================================= */}

        {menuOpen && (
          <div
            className="
              md:hidden
              mt-4
              pt-3
              border-t
              border-yellow-500/20
              space-y-1
            "
          >

            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuOpen(false)}
                className={`${linkClass(item.path)} w-full`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}

            {/* MOBILE MANAGE TEAMS */}

            <Link
              to="/teams"
              onClick={() => setMenuOpen(false)}
              className={`${linkClass('/teams')} w-full`}
            >
              <span>👥</span>
              <span>Manage Teams</span>
            </Link>

          </div>
        )}

      </div>

    </nav>
  );
}
