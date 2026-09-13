const router = require('express').Router();

const c = require('../controllers/notificationController');

router.post('/register', c.registerUser);

router.get('/:id', c.getUser);

router.put('/:id/preferences', c.updatePreferences);

module.exports = router;
