const router = require('express').Router();
const c = require('../controllers/teamController');

router.get('/', c.listTeams);
router.get('/:id', c.getTeam);
router.post('/', c.createTeam);
router.put('/:id', c.updateTeam);
router.delete('/:id', c.deleteTeam);

module.exports = router;
