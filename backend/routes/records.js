const router = require('express').Router();
const c = require('../controllers/recordsController');

router.get('/', c.getRecords);

module.exports = router;
