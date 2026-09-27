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

  return (
    <nav
      className="
        sticky
        top-0
        z-50
        w-full
        max-w-full
        overflow-x-hidden
        bg-slate-950/95
        border-b
        border-yellow-500/30
        shadow-lg
        shadow-black/30
      "
    >
      {/* =====================================================
          NAVBAR CONTAINER
      ====================================================== */}

      <div
        className="
          mx-auto
          w-full
          max-w-7xl
          min-w-0
          px-3
          sm:px-4
          lg:px-6
        "
      >

        {/* ===================================================
            MAIN NAVBAR
        ==================================================== */}

        <div
          className="
            flex
            w-full
            min-w-0
            items-center
            justify-between
            gap-2
            py-2.5
            sm:py-3
          "
        >

          {/* =================================================
              LOGO + CLUB NAME
          ================================================== */}

          <Link
            to="/"
            onClick={closeMenu}
            className="
              flex
              min-w-0
              flex-1
              items-center
              gap-2
              sm:gap-3
              group
            "
          >

            {/* LOGO */}

            <div
              className="
                h-11
                w-11
                shrink-0
                overflow-hidden
                rounded-full
                border-2
                border-yellow-400
                bg-black
                shadow-lg
                shadow-yellow-500/20
                sm:h-14
                sm:w-14
              "
            >
              <img
                src="/WhatsApp Image 2026-09-12 at 9.19.32 AM.jpeg"
                alt="Golden Cricket Club"
                className="
                  h-full
                  w-full
                  object-cover
                "
              />
            </div>

            {/* CLUB NAME */}

            <div className="min-w-0 flex-1">

              <div
                className="
                  max-w-full
                  truncate
                  text-[13px]
                  font-black
                  leading-tight
                  tracking-wide
                  text-yellow-300
                  sm:text-lg
                  md:text-xl
                  lg:text-2xl
                "
              >
                GOLDEN CRICKET CLUB
              </div>

              <div
                className="
                  mt-0.5
                  max-w-full
                  truncate
                  text-[7px]
                  font-bold
                  uppercase
                  tracking-[0.12em]
                  text-slate-500
                  sm:text-[9px]
                  sm:tracking-[0.2em]
                "
              >
                Official Cricket Scoreboard
              </div>

            </div>

          </Link>

          {/* =================================================
              DESKTOP NAVIGATION
          ================================================== */}

          <div
            className="
              hidden
              shrink-0
              items-center
              gap-1
              md:flex
            "
          >

            {NAV_ITEMS.map((item) => {

              const active =
                isActive(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex
                    min-h-[42px]
                    items-center
                    gap-1.5
                    rounded-xl
                    px-2.5
                    py-2
                    text-sm
                    font-semibold
                    transition-colors
                    duration-150
                    ${
                      active
                        ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-slate-950 shadow-md shadow-yellow-900/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-yellow-300'
                    }
                  `}
                >
                  <span className="text-base">
                    {item.icon}
                  </span>

                  <span className="whitespace-nowrap">
                    {item.label}
                  </span>
                </Link>
              );
            })}

            {/* MANAGE TEAMS */}

            <Link
              to="/teams"
              className={`
                ml-1
                flex
                min-h-[42px]
                items-center
                gap-1.5
                rounded-xl
                border
                px-2.5
                py-2
                text-sm
                font-semibold
                transition-colors
                duration-150
                ${
                  isActive('/teams')
                    ? 'border-yellow-400 bg-yellow-400 text-slate-950 shadow-md shadow-yellow-900/30'
                    : 'border-slate-700 text-slate-300 hover:border-yellow-500/60 hover:bg-slate-800 hover:text-yellow-300'
                }
              `}
            >
              <span>👥</span>

              <span className="whitespace-nowrap">
                Manage Teams
              </span>
            </Link>

          </div>

          {/* =================================================
              MOBILE MENU BUTTON
          ================================================== */}

          <button
            type="button"
            onClick={() =>
              setMenuOpen(
                (open) => !open
              )
            }
            className="
              flex
              h-11
              w-11
              shrink-0
              items-center
              justify-center
              rounded-xl
              border
              border-slate-700
              bg-slate-900
              text-xl
              text-yellow-400
              shadow-md
              transition-colors
              active:scale-95
              md:hidden
            "
            aria-label={
              menuOpen
                ? 'Close navigation menu'
                : 'Open navigation menu'
            }
            aria-expanded={menuOpen}
          >
            {menuOpen ? '✕' : '☰'}
          </button>

        </div>

        {/* =====================================================
            MOBILE MENU
        ====================================================== */}

        {menuOpen && (
          <div
            className="
              w-full
              border-t
              border-slate-800
              pb-3
              pt-3
              md:hidden
            "
          >

            <div
              className="
                mb-2
                flex
                min-w-0
                items-center
                justify-between
                gap-2
                px-1
              "
            >
              <p
                className="
                  text-xs
                  font-bold
                  uppercase
                  tracking-wider
                  text-slate-500
                "
              >
                Navigation
              </p>

              <span
                className="
                  truncate
                  text-[10px]
                  text-slate-600
                "
              >
                Golden Cricket Club
              </span>
            </div>

            {/* NAV ITEMS */}

            <div className="grid w-full gap-1">

              {NAV_ITEMS.map((item) => {

                const active =
                  isActive(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={closeMenu}
                    className={`
                      flex
                      min-h-[48px]
                      w-full
                      min-w-0
                      items-center
                      gap-3
                      rounded-xl
                      px-3
                      transition-colors
                      duration-150
                      ${
                        active
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 shadow-md shadow-yellow-900/20'
                          : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-yellow-300'
                      }
                    `}
                  >

                    <span
                      className={`
                        flex
                        h-9
                        w-9
                        shrink-0
                        items-center
                        justify-center
                        rounded-lg
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

                    <span
                      className="
                        min-w-0
                        flex-1
                        truncate
                        text-sm
                        font-semibold
                      "
                    >
                      {item.label}
                    </span>

                    {active ? (
                      <span className="shrink-0 text-sm font-bold">
                        ✓
                      </span>
                    ) : (
                      <span className="shrink-0 text-lg text-slate-600">
                        ›
                      </span>
                    )}

                  </Link>
                );
              })}

              {/* MANAGE TEAMS */}

              <Link
                to="/teams"
                onClick={closeMenu}
                className={`
                  flex
                  min-h-[48px]
                  w-full
                  min-w-0
                  items-center
                  gap-3
                  rounded-xl
                  px-3
                  transition-colors
                  duration-150
                  ${
                    isActive('/teams')
                      ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 shadow-md shadow-yellow-900/20'
                      : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-yellow-300'
                  }
                `}
              >

                <span
                  className={`
                    flex
                    h-9
                    w-9
                    shrink-0
                    items-center
                    justify-center
                    rounded-lg
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

                <span
                  className="
                    min-w-0
                    flex-1
                    truncate
                    text-sm
                    font-semibold
                  "
                >
                  Manage Teams
                </span>

                {isActive('/teams') ? (
                  <span className="shrink-0 text-sm font-bold">
                    ✓
                  </span>
                ) : (
                  <span className="shrink-0 text-lg text-slate-600">
                    ›
                  </span>
                )}

              </Link>

            </div>

          </div>
        )}

      </div>
    </nav>
  );
}
