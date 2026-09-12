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

  const isActive = (path) => pathname === path;

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const desktopLinkClass = (path) =>
    `px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 ${
      isActive(path)
        ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-slate-950 shadow-md shadow-yellow-900/40'
        : 'text-slate-300 hover:bg-slate-800 hover:text-yellow-300'
    }`;

  return (
    <nav className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-yellow-500/30 shadow-lg shadow-black/30">

      <div className="max-w-7xl mx-auto px-3 sm:px-4">

        {/* =====================================================
            MAIN NAVBAR
        ====================================================== */}

        <div className="h-[72px] sm:h-[82px] flex items-center justify-between gap-3">

          {/* ===================================================
              LOGO + CLUB NAME
          ==================================================== */}

          <Link
            to="/"
            onClick={closeMenu}
            className="flex items-center gap-2.5 sm:gap-4 min-w-0 group"
          >

            {/* LOGO */}

            <div
              className="
                w-12 h-12
                sm:w-16 sm:h-16
                rounded-full
                overflow-hidden
                flex-shrink-0
                bg-black
                border-2 border-yellow-400
                shadow-lg shadow-yellow-500/20
                group-hover:scale-105
                transition-transform duration-200
              "
            >
              <img
                src="/WhatsApp Image 2026-09-12 at 9.19.32 AM.jpeg"
                alt="Golden Cricket Club"
                className="w-full h-full object-cover"
              />
            </div>

            {/* CLUB NAME */}

            <div className="min-w-0">

              <div
                className="
                  text-[14px]
                  xs:text-base
                  sm:text-xl
                  lg:text-2xl
                  font-black
                  tracking-wide
                  leading-tight
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
                  mt-0.5
                  sm:mt-1.5
                  text-[6px]
                  sm:text-[9px]
                  tracking-[0.16em]
                  sm:tracking-[0.28em]
                  font-bold
                  text-slate-500
                  uppercase
                  truncate
                "
              >
                Official Cricket Scoreboard
              </div>

            </div>

          </Link>

          {/* ===================================================
              DESKTOP NAVIGATION
          ==================================================== */}

          <div className="hidden md:flex items-center gap-1">

            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={desktopLinkClass(item.path)}
              >
                <span className="text-base">
                  {item.icon}
                </span>

                <span>
                  {item.label}
                </span>
              </Link>
            ))}

            {/* MANAGE TEAMS */}

            <Link
              to="/teams"
              className={`
                ml-2
                px-3
                py-2.5
                rounded-xl
                text-sm
                font-semibold
                flex
                items-center
                gap-1.5
                border
                transition-all
                duration-200
                ${
                  isActive('/teams')
                    ? 'bg-yellow-400 text-slate-950 border-yellow-400 shadow-md shadow-yellow-900/30'
                    : 'text-slate-300 border-slate-700 hover:border-yellow-500/60 hover:text-yellow-300 hover:bg-slate-800'
                }
              `}
            >
              <span>👥</span>
              <span>Manage Teams</span>
            </Link>

          </div>

          {/* ===================================================
              MOBILE MENU BUTTON
          ==================================================== */}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="
              md:hidden
              flex-shrink-0
              w-11
              h-11
              rounded-xl
              border
              border-slate-700
              bg-slate-900
              text-yellow-400
              flex
              items-center
              justify-center
              text-xl
              shadow-md
              hover:border-yellow-500/60
              hover:bg-slate-800
              active:scale-95
              transition-all
            "
            aria-label={
              menuOpen
                ? 'Close navigation menu'
                : 'Open navigation menu'
            }
            aria-expanded={menuOpen}
          >
            <span className="leading-none">
              {menuOpen ? '✕' : '☰'}
            </span>
          </button>

        </div>

        {/* =====================================================
            MOBILE MENU
        ====================================================== */}

        <div
          className={`
            md:hidden
            overflow-hidden
            transition-all
            duration-300
            ${
              menuOpen
                ? 'max-h-[500px] opacity-100 pb-4'
                : 'max-h-0 opacity-0'
            }
          `}
        >

          <div className="border-t border-slate-800 pt-3">

            {/* MENU TITLE */}

            <div className="flex items-center justify-between px-1 mb-2">

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Navigation
                </p>
              </div>

              <span className="text-[10px] text-slate-600">
                Golden Cricket Club
              </span>

            </div>

            {/* NAV ITEMS */}

            <div className="grid grid-cols-1 gap-1">

              {NAV_ITEMS.map((item) => {
                const active = isActive(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={closeMenu}
                    className={`
                      min-h-[50px]
                      rounded-xl
                      px-3
                      flex
                      items-center
                      gap-3
                      transition-all
                      duration-200
                      ${
                        active
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 shadow-md shadow-yellow-900/20'
                          : 'bg-slate-900/60 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-yellow-300'
                      }
                    `}
                  >

                    {/* ICON */}

                    <span
                      className={`
                        w-9
                        h-9
                        rounded-lg
                        flex
                        items-center
                        justify-center
                        text-lg
                        ${
                          active
                            ? 'bg-white/20'
                            : 'bg-slate-800'
                        }
                      `}
                    >
                      {item.icon}
                    </span>

                    {/* LABEL */}

                    <span className="font-semibold text-sm flex-1">
                      {item.label}
                    </span>

                    {/* ACTIVE INDICATOR */}

                    {active ? (
                      <span className="text-sm font-bold">
                        ✓
                      </span>
                    ) : (
                      <span className="text-slate-600 text-lg">
                        ›
                      </span>
                    )}

                  </Link>
                );
              })}

              {/* =================================================
                  MANAGE TEAMS
              ================================================== */}

              <Link
                to="/teams"
                onClick={closeMenu}
                className={`
                  min-h-[50px]
                  rounded-xl
                  px-3
                  flex
                  items-center
                  gap-3
                  transition-all
                  duration-200
                  ${
                    isActive('/teams')
                      ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 shadow-md shadow-yellow-900/20'
                      : 'bg-slate-900/60 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-yellow-300'
                  }
                `}
              >

                <span
                  className={`
                    w-9
                    h-9
                    rounded-lg
                    flex
                    items-center
                    justify-center
                    text-lg
                    ${
                      isActive('/teams')
                        ? 'bg-white/20'
                        : 'bg-slate-800'
                    }
                  `}
                >
                  👥
                </span>

                <span className="font-semibold text-sm flex-1">
                  Manage Teams
                </span>

                {isActive('/teams') ? (
                  <span className="text-sm font-bold">
                    ✓
                  </span>
                ) : (
                  <span className="text-slate-600 text-lg">
                    ›
                  </span>
                )}

              </Link>

            </div>

          </div>

        </div>

      </div>
    </nav>
  );
}
