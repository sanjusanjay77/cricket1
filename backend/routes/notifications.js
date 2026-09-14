
const router = require('express').Router();

const c = require('../controllers/notificationController');


// =====================================================
// REGISTER NOTIFICATION USER
// POST /api/notifications/register
// =====================================================
router.post(
  '/register',
  c.registerUser
);


// =====================================================
// GET NOTIFICATION USER
// GET /api/notifications/:id
// =====================================================
router.get(
  '/:id',
  c.getUser
);


// =====================================================
// UPDATE NOTIFICATION PREFERENCES
// PUT /api/notifications/:id/preferences
// =====================================================
router.put(
  '/:id/preferences',
  c.updatePreferences
);


// =====================================================
// SAVE FIREBASE FCM TOKEN
// PUT /api/notifications/:id/fcm-token
// =====================================================
router.put(
  '/:id/fcm-token',
  c.saveFcmToken
);


module.exports = router;

