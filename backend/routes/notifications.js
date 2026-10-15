
const router = require('express').Router();

const c = require('../controllers/notificationController');
const db = require('../db/database');


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


// =====================================================
// TEMPORARY DEVICE DIAGNOSTIC
// GET /api/notifications/debug/devices
//
// Shows registered devices without exposing the
// complete Firebase FCM token.
// =====================================================

router.get('/debug/devices', async (req, res) => {
  try {
    const devices = await db.prepare(`
      SELECT
        d.id AS device_id,
        d.user_id,
        d.device_name,
        d.created_at,
        d.last_seen_at,
        substr(d.fcm_token, 1, 8) AS token_preview,
        u.name AS user_name,
        u.notifications_enabled
      FROM notification_devices d
      LEFT JOIN notification_users u ON u.id = d.user_id
      WHERE d.fcm_token IS NOT NULL
        AND d.fcm_token != ''
      ORDER BY d.last_seen_at DESC
    `).all();

    return res.json({
      success: true,
      count: devices.length,
      enabled_count: devices.filter(
        d => Number(d.notifications_enabled) === 1
      ).length,
      disabled_count: devices.filter(
        d => Number(d.notifications_enabled) !== 1
      ).length,
      devices
    });
  } catch (error) {
    console.error('Failed to read notification devices:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to read notification devices'
    });
  }
});

    try {
      const devices = await db
        .prepare(`
          SELECT
            id,
            user_id,
            device_name,
            created_at,
            last_seen_at,
            substr(fcm_token, 1, 20) AS token_preview
          FROM notification_devices
          ORDER BY last_seen_at DESC
        `)
        .all();

      res.json({
        success: true,
        count: devices.length,
        devices
      });
    } catch (error) {
      console.error(
        '❌ Failed to read notification devices:',
        error
      );

      res.status(500).json({
        success: false,
        error: 'Failed to read notification devices'
      });
    }
  }
);


module.exports = router;

