const router = require('express').Router();
const c = require('../controllers/playerController');

router.get('/', c.listPlayers);
router.get('/all/with-teams', c.listAllWithTeams);
router.get('/:id/stats', c.getPlayerStats);
router.post('/', c.createPlayer);
router.put('/:id', c.updatePlayer);
router.delete('/:id', c.deletePlayer);

module.exports = router;
