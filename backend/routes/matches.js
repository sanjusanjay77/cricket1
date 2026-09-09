const router = require('express').Router();
const c = require('../controllers/matchController');

router.get('/', c.listMatches);
router.post('/', c.createMatch);
router.get('/:id', c.getMatchDetail);
router.post('/:id/toss', c.setToss);
router.post('/:id/second-innings', c.startSecondInnings);
router.delete('/:id', c.deleteMatch);

module.exports = router;
