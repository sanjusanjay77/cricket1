import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Matches',
    shortLabel: 'Home',
    icon: '🏟️',
  },
  {
    path: '/records',
    label: 'Records',
    shortLabel: 'Records',
    icon: '📜',
  },
  {
    path: '/players',
    label: 'Player Stats',
    shortLabel: 'Players',
    icon: '📊',
  },
  {
    path: '/create-match',
    label: 'New Scoreboard',
    shortLabel: 'New',
    icon: '➕',
  },
];

const MORE_ITEM = {
  path: '/teams',
  label: 'Manage Teams',
  icon: '👥',
};

export default function Navbar() {
  const { pathname } = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path) => {
    if (path === '/') {
      return pathname === '/';
    }

    return pathname === path;
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  /*
  ==========================================================
  CLOSE MOBILE MENU WHEN ROUTE CHANGES
  ==========================================================
  */

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  /*
  ==========================================================
  PREVENT BODY SCROLL WHEN MOBILE MENU IS OPEN
  ==========================================================
  */

  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  /*
  ==========================================================
  MOBILE BOTTOM NAV
  ==========================================================
  */

  const mobileItems = NAV_ITEMS;

  return (
    <>
      {/* ====================================================
          TOP NAVBAR
      ===================================================== */}

      <nav
        className="
          sticky
          top-0
          z-50
          w-full
          max-w-full
          overflow-x-hidden
          border-b
          border-yellow-500/20
          bg-slate-950/95
          shadow-lg
          shadow-black/30
        "
      >

        {/* ==================================================
            NAVBAR CONTAINER
        =================================================== */}

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

          {/* =================================================
              MAIN NAVBAR
          ================================================== */}

          <div
            className="
              flex
              min-h-[64px]
              w-full
              min-w-0
              items-center
              justify-between
              gap-2
              py-2
              sm:min-h-[72px]
            "
          >

            {/* =================================================
                LOGO + CLUB NAME
            ================================================== */}

            <Link
              to="/"
              onClick={closeMenu}
              className="
                group
                flex
                min-w-0
                flex-1
                items-center
                gap-2
                sm:gap-3
              "
            >

              {/* LOGO */}

              <div
                className="
                  relative
                  h-10
                  w-10
                  shrink-0
                  overflow-hidden
                  rounded-full
                  border-2
                  border-yellow-400
                  bg-black
                  shadow-md
                  shadow-yellow-500/20
                  transition-transform
                  duration-200
                  group-hover:scale-105
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
                    flex
                    min-w-0
                    items-center
                    gap-1.5
                  "
                >

                  <div
                    className="
                      min-w-0
                      truncate
                      text-[12px]
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

                  {/* LIVE DOT */}

                  {pathname === '/' && (
                    <span
                      className="
                        relative
                        flex
                        h-2
                        w-2
                        shrink-0
                      "
                    >
                      <span
                        className="
                          absolute
                          inline-flex
                          h-full
                          w-full
                          animate-ping
                          rounded-full
                          bg-emerald-400
                          opacity-60
                        "
                      />

                      <span
                        className="
                          relative
                          inline-flex
                          h-2
                          w-2
                          rounded-full
                          bg-emerald-400
                        "
                      />
                    </span>
                  )}

                </div>

                <div
                  className="
                    mt-0.5
                    truncate
                    text-[6px]
                    font-bold
                    uppercase
                    tracking-[0.1em]
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

                const active = isActive(item.path);

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`
                      group
                      relative
                      flex
                      min-h-[44px]
                      items-center
                      gap-1.5
                      rounded-xl
                      px-3
                      py-2
                      text-sm
                      font-semibold
                      transition-all
                      duration-200
                      hover:-translate-y-0.5
                      ${
                        active
                          ? `
                            bg-gradient-to-br
                            from-yellow-400
                            to-amber-600
                            text-slate-950
                            shadow-md
                            shadow-yellow-900/30
                          `
                          : `
                            text-slate-300
                            hover:bg-slate-800
                            hover:text-yellow-300
                          `
                      }
                    `}
                  >

                    <span
                      className="
                        text-base
                        transition-transform
                        duration-200
                        group-hover:scale-110
                      "
                    >
                      {item.icon}
                    </span>

                    <span className="whitespace-nowrap">
                      {item.label}
                    </span>

                    {/* ACTIVE INDICATOR */}

                    {active && (
                      <span
                        className="
                          absolute
                          bottom-1
                          left-1/2
                          h-0.5
                          w-5
                          -translate-x-1/2
                          rounded-full
                          bg-slate-950/60
                        "
                      />
                    )}

                  </Link>
                );
              })}

              {/* =================================================
                  MANAGE TEAMS
              ================================================== */}

              <Link
                to={MORE_ITEM.path}
                className={`
                  ml-1
                  flex
                  min-h-[44px]
                  items-center
                  gap-1.5
                  rounded-xl
                  border
                  px-3
                  py-2
                  text-sm
                  font-semibold
                  transition-all
                  duration-200
                  hover:-translate-y-0.5
                  ${
                    isActive(MORE_ITEM.path)
                      ? `
                        border-yellow-400
                        bg-yellow-400
                        text-slate-950
                        shadow-md
                        shadow-yellow-900/30
                      `
                      : `
                        border-slate-700
                        text-slate-300
                        hover:border-yellow-500/60
                        hover:bg-slate-800
                        hover:text-yellow-300
                      `
                  }
                `}
              >

                <span className="text-base">
                  {MORE_ITEM.icon}
                </span>

                <span className="whitespace-nowrap">
                  {MORE_ITEM.label}
                </span>

              </Link>

            </div>

            {/* =================================================
                MOBILE MENU BUTTON
            ================================================== */}

            <button
              type="button"
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
              className="
                relative
                flex
                h-11
                w-11
                shrink-0
                items-center
                justify-center
                overflow-hidden
                rounded-xl
                border
                border-slate-700
                bg-slate-900
                text-xl
                text-yellow-400
                shadow-md
                transition-all
                duration-200
                active:scale-90
                md:hidden
              "
              aria-label={
                menuOpen
                  ? 'Close navigation menu'
                  : 'Open navigation menu'
              }
              aria-expanded={menuOpen}
            >

              <span
                className={`
                  absolute
                  transition-all
                  duration-200
                  ${
                    menuOpen
                      ? 'rotate-90 scale-100 opacity-100'
                      : 'rotate-0 scale-100 opacity-100'
                  }
                `}
              >
                {menuOpen ? '✕' : '☰'}
              </span>

            </button>

          </div>

          {/* ==================================================
              MOBILE MENU OVERLAY
          =================================================== */}

          {menuOpen && (
            <div
              className="
                fixed
                inset-0
                top-[64px]
                z-40
                bg-black/50
                md:hidden
              "
              onClick={closeMenu}
              aria-hidden="true"
            />
          )}

          {/* ==================================================
              MOBILE MENU
          =================================================== */}

          <div
            className={`
              overflow-hidden
              transition-all
              duration-200
              md:hidden
              ${
                menuOpen
                  ? 'max-h-[520px] opacity-100'
                  : 'max-h-0 opacity-0'
              }
            `}
          >

            <div
              className="
                relative
                border-t
                border-slate-800
                pb-4
                pt-3
              "
            >

              {/* MENU HEADER */}

              <div
                className="
                  mb-3
                  flex
                  items-center
                  justify-between
                  px-1
                "
              >

                <div>

                  <p
                    className="
                      text-[10px]
                      font-black
                      uppercase
                      tracking-[0.2em]
                      text-yellow-400
                    "
                  >
                    Menu
                  </p>

                  <p
                    className="
                      mt-0.5
                      text-[10px]
                      text-slate-500
                    "
                  >
                    Golden Cricket Club
                  </p>

                </div>

                <span
                  className="
                    rounded-full
                    border
                    border-emerald-500/20
                    bg-emerald-500/10
                    px-2
                    py-1
                    text-[9px]
                    font-bold
                    uppercase
                    tracking-wider
                    text-emerald-400
                  "
                >
                  Scoreboard
                </span>

              </div>

              {/* =================================================
                  MOBILE MENU ITEMS
              ================================================== */}

              <div className="grid gap-2">

                {NAV_ITEMS.map((item, index) => {

                  const active = isActive(item.path);

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={closeMenu}
                      style={{
                        animationDelay: `${index * 35}ms`,
                      }}
                      className={`
                        group
                        flex
                        min-h-[52px]
                        w-full
                        min-w-0
                        items-center
                        gap-3
                        rounded-2xl
                        border
                        px-3
                        transition-all
                        duration-200
                        ${
                          menuOpen
                            ? 'animate-[navItemIn_0.22s_ease-out_both]'
                            : ''
                        }
                        ${
                          active
                            ? `
                              border-yellow-400/60
                              bg-gradient-to-r
                              from-yellow-400
                              to-amber-500
                              text-slate-950
                              shadow-md
                              shadow-yellow-900/20
                            `
                            : `
                              border-slate-800
                              bg-slate-900/70
                              text-slate-300
                              hover:border-slate-700
                              hover:bg-slate-800
                              hover:text-yellow-300
                            `
                        }
                      `}
                    >

                      {/* ICON */}

                      <span
                        className={`
                          flex
                          h-10
                          w-10
                          shrink-0
                          items-center
                          justify-center
                          rounded-xl
                          text-lg
                          transition-transform
                          duration-200
                          group-active:scale-90
                          ${
                            active
                              ? 'bg-white/20'
                              : 'bg-slate-800'
                          }
                        `}
                      >
                        {item.icon}
                      </span>

                      {/* TEXT */}

                      <div className="min-w-0 flex-1">

                        <div
                          className="
                            truncate
                            text-sm
                            font-bold
                          "
                        >
                          {item.label}
                        </div>

                        <div
                          className={`
                            mt-0.5
                            text-[9px]
                            ${
                              active
                                ? 'text-slate-800/70'
                                : 'text-slate-500'
                            }
                          `}
                        >
                          {item.path === '/'
                            ? 'View live and upcoming matches'
                            : item.path === '/records'
                              ? 'Explore match records'
                              : item.path === '/players'
                                ? 'View player performance'
                                : 'Create a new scoreboard'}
                        </div>

                      </div>

                      {/* ACTIVE / ARROW */}

                      {active ? (
                        <span
                          className="
                            flex
                            h-7
                            w-7
                            shrink-0
                            items-center
                            justify-center
                            rounded-full
                            bg-slate-950/10
                            text-sm
                            font-black
                          "
                        >
                          ✓
                        </span>
                      ) : (
                        <span
                          className="
                            shrink-0
                            text-xl
                            text-slate-600
                            transition-transform
                            duration-200
                            group-hover:translate-x-1
                            group-hover:text-yellow-400
                          "
                        >
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
                    group
                    flex
                    min-h-[52px]
                    w-full
                    min-w-0
                    items-center
                    gap-3
                    rounded-2xl
                    border
                    px-3
                    transition-all
                    duration-200
                    ${
                      isActive('/teams')
                        ? `
                          border-yellow-400/60
                          bg-gradient-to-r
                          from-yellow-400
                          to-amber-500
                          text-slate-950
                          shadow-md
                          shadow-yellow-900/20
                        `
                        : `
                          border-slate-800
                          bg-slate-900/70
                          text-slate-300
                          hover:border-slate-700
                          hover:bg-slate-800
                          hover:text-yellow-300
                        `
                    }
                  `}
                >

                  <span
                    className={`
                      flex
                      h-10
                      w-10
                      shrink-0
                      items-center
                      justify-center
                      rounded-xl
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

                  <div className="min-w-0 flex-1">

                    <div
                      className="
                        truncate
                        text-sm
                        font-bold
                      "
                    >
                      Manage Teams
                    </div>

                    <div
                      className={`
                        mt-0.5
                        text-[9px]
                        ${
                          isActive('/teams')
                            ? 'text-slate-800/70'
                            : 'text-slate-500'
                        }
                      `}
                    >
                      Manage your cricket teams
                    </div>

                  </div>

                  {isActive('/teams') ? (
                    <span
                      className="
                        flex
                        h-7
                        w-7
                        shrink-0
                        items-center
                        justify-center
                        rounded-full
                        bg-slate-950/10
                        text-sm
                        font-black
                      "
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      className="
                        text-xl
                        text-slate-600
                        transition-transform
                        duration-200
                        group-hover:translate-x-1
                        group-hover:text-yellow-400
                      "
                    >
                      ›
                    </span>
                  )}

                </Link>

              </div>

            </div>

          </div>

        </div>

      </nav>

      {/* ======================================================
          MOBILE BOTTOM NAVIGATION
      ======================================================= */}

      <div
        className="
          fixed
          bottom-0
          left-0
          right-0
          z-50
          border-t
          border-yellow-500/20
          bg-slate-950/98
          shadow-[0_-8px_30px_rgba(0,0,0,0.35)]
          md:hidden
        "
      >

        <div
          className="
            mx-auto
            grid
            max-w-md
            grid-cols-4
            px-1
            pb-[env(safe-area-inset-bottom)]
          "
        >

          {mobileItems.map((item) => {

            const active = isActive(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMenu}
                className={`
                  relative
                  flex
                  min-h-[62px]
                  flex-col
                  items-center
                  justify-center
                  gap-0.5
                  px-1
                  pt-1
                  transition-all
                  duration-200
                  active:scale-90
                  ${
                    active
                      ? 'text-yellow-300'
                      : 'text-slate-500'
                  }
                `}
              >

                {/* ACTIVE TOP LINE */}

                {active && (
                  <span
                    className="
                      absolute
                      left-1/2
                      top-0
                      h-0.5
                      w-9
                      -translate-x-1/2
                      rounded-full
                      bg-yellow-400
                    "
                  />
                )}

                {/* ICON */}

                <span
                  className={`
                    flex
                    h-7
                    w-8
                    items-center
                    justify-center
                    rounded-lg
                    text-lg
                    transition-all
                    duration-200
                    ${
                      active
                        ? 'scale-110 bg-yellow-400/10'
                        : ''
                    }
                  `}
                >
                  {item.icon}
                </span>

                {/* LABEL */}

                <span
                  className={`
                    max-w-full
                    truncate
                    text-[9px]
                    font-bold
                    ${
                      active
                        ? 'text-yellow-300'
                        : 'text-slate-500'
                    }
                  `}
                >
                  {item.shortLabel}
                </span>

              </Link>
            );
          })}

        </div>

      </div>

      {/* ======================================================
          NAVBAR ANIMATIONS
      ======================================================= */}

      <style>
        {`
          @keyframes navItemIn {
            from {
              opacity: 0;
              transform: translateY(-5px);
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            * {
              scroll-behavior: auto !important;
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}
      </style>
    </>
  );
}
