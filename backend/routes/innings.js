const router = require('express').Router();
const c = require('../controllers/scoringController');

router.get('/:id/scoreboard', c.getScoreboard);
router.post('/:id/set-batsmen', c.setBatsmen);
router.post('/:id/swap-batsmen', c.swapBatsmen);
router.post('/:id/swap-strike', c.swapStrike);
router.post('/:id/set-bowler', c.setBowler);
router.post('/:id/ball', c.recordBall);
router.post('/:id/undo', c.undoLastBall);

module.exports = router;
