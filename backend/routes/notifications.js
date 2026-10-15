
const router = require('express').Router();

const c = require('../controllers/notificationController');
const db = require('../db/database');

// POST /api/notifications/register
router.post('/register', c.registerUser);

// GET /api/notifications/debug/devices
// Keep this route BEFORE GET /:id.
router.get('/debug/devices', async (req, res) => {
  try {
    const devices = await db.prepare(`
      SELECT
        d.id AS device_id,
        d.user_id,
        d.created_at,
        d.last_seen_at,
        substr(d.fcm_token, 1, 8) AS token_preview,
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

// GET /api/notifications/:id
router.get('/:id', c.getUser);

// PUT /api/notifications/:id/preferences
router.put('/:id/preferences', c.updatePreferences);

// PUT /api/notifications/:id/fcm-token
router.put('/:id/fcm-token', c.saveFcmToken);

module.exports = router;
