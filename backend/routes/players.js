const router = require('express').Router();
const c = require('../controllers/playerController');

/**
 * ============================================================
 * PLAYER ROUTES
 * ============================================================
 */

/**
 * LIST ACTIVE PLAYERS
 */
router.get('/', c.listPlayers);

/**
 * LIST ACTIVE OWN-TEAM PLAYERS WITH TEAM INFORMATION
 */
router.get(
  '/all/with-teams',
  c.listAllWithTeams
);

/**
 * NEW:
 * GET ALL ACTIVE GCC PLAYERS WITH CAREER STATISTICS
 *
 * Returns players + team + batting + bowling
 * statistics in one request.
 */
router.get(
  '/all/career-stats',
  c.getAllPlayerCareerStats
);

/**
 * GET ONE PLAYER CAREER STATISTICS
 *
 * Existing endpoint — keep it.
 */
router.get(
  '/:id/stats',
  c.getPlayerStats
);

/**
 * CREATE PLAYER
 */
router.post(
  '/',
  c.createPlayer
);

/**
 * UPDATE PLAYER
 */
router.put(
  '/:id',
  c.updatePlayer
);

/**
 * SOFT DELETE PLAYER
 */
router.delete(
  '/:id',
  c.deletePlayer
);

module.exports = router;