
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

function cleanText(value, maxLength = 100) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().slice(0, maxLength);
}

function cleanEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function cleanPhone(value) {
  return cleanText(value, 20).replace(/[^\d+]/g, '');
}

function cleanFcmToken(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().slice(0, 4096);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '');

  return digits.length >= 10 && digits.length <= 15;
}


// =====================================================
// REGISTER USER
// POST /api/notifications/register
// =====================================================
exports.registerUser = async (req, res) => {
  try {
    const name = cleanText(req.body.name, 100);
    const email = cleanEmail(req.body.email);
    const phone = cleanPhone(req.body.phone);

    if (!name) {
      return res.status(400).json({
        error: 'Please enter your name.'
      });
    }

    if (!email && !phone) {
      return res.status(400).json({
        error: 'Please enter an email address or phone number.'
      });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.'
      });
    }

    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({
        error: 'Please enter a valid phone number.'
      });
    }


    // ---------------------------------------------
    // Check existing email
    // ---------------------------------------------
    if (email) {
      const existingEmail = await db.prepare(`
        SELECT *
        FROM notification_users
        WHERE email = ?
        LIMIT 1
      `).get(email);

      if (existingEmail) {
        return res.json({
          existing: true,
          user: existingEmail
        });
      }
    }


    // ---------------------------------------------
    // Check existing phone
    // ---------------------------------------------
    if (phone) {
      const existingPhone = await db.prepare(`
        SELECT *
        FROM notification_users
        WHERE phone = ?
        LIMIT 1
      `).get(phone);

      if (existingPhone) {
        return res.json({
          existing: true,
          user: existingPhone
        });
      }
    }


    // ---------------------------------------------
    // Create new user
    // ---------------------------------------------
    const id = uuidv4();

    await db.prepare(`
      INSERT INTO notification_users (
        id,
        name,
        email,
        phone,
        notifications_enabled
      )
      VALUES (?, ?, ?, ?, 1)
    `).run(
      id,
      name,
      email || null,
      phone || null
    );


    // ---------------------------------------------
    // Get created user
    // ---------------------------------------------
    const user = await db.prepare(`
      SELECT
        id,
        name,
        email,
        phone,
        notifications_enabled,
        fcm_token,
        created_at
      FROM notification_users
      WHERE id = ?
    `).get(id);


    return res.status(201).json({
      existing: false,
      user
    });

  } catch (error) {
    console.error(
      'Notification registration error:',
      error
    );

    return res.status(500).json({
      error: 'Unable to register. Please try again.'
    });
  }
};


// =====================================================
// GET USER
// GET /api/notifications/:id
// =====================================================
exports.getUser = async (req, res) => {
  try {
    const user = await db.prepare(`
      SELECT
        id,
        name,
        email,
        phone,
        notifications_enabled,
        fcm_token,
        created_at
      FROM notification_users
      WHERE id = ?
    `).get(req.params.id);


    if (!user) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }


    return res.json(user);

  } catch (error) {
    console.error(
      'Get notification user error:',
      error
    );

    return res.status(500).json({
      error: 'Unable to load user.'
    });
  }
};


// =====================================================
// UPDATE NOTIFICATION PREFERENCES
// PUT /api/notifications/:id/preferences
// =====================================================
exports.updatePreferences = async (req, res) => {
  try {
    const enabled = req.body.notifications_enabled ? 1 : 0;


    const existing = await db.prepare(`
      SELECT id
      FROM notification_users
      WHERE id = ?
    `).get(req.params.id);


    if (!existing) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }


    await db.prepare(`
      UPDATE notification_users
      SET notifications_enabled = ?
      WHERE id = ?
    `).run(
      enabled,
      req.params.id
    );


    const user = await db.prepare(`
      SELECT
        id,
        name,
        email,
        phone,
        notifications_enabled,
        fcm_token,
        created_at
      FROM notification_users
      WHERE id = ?
    `).get(req.params.id);


    return res.json(user);

  } catch (error) {
    console.error(
      'Update notification preference error:',
      error
    );

    return res.status(500).json({
      error: 'Unable to update notification settings.'
    });
  }
};


// =====================================================
// SAVE FCM TOKEN
// PUT /api/notifications/:id/fcm-token
// =====================================================
//
// IMPORTANT:
//
// Old system:
// notification_users
// └── fcm_token  ← one device only
//
// New system:
// notification_users
// └── user
//
// notification_devices
// ├── laptop token
// ├── phone token
// └── other device tokens
//
// This allows the same notification user to receive
// notifications on multiple devices.
// =====================================================
exports.saveFcmToken = async (req, res) => {
  try {
    const userId = cleanText(req.params.id, 100);
    const fcmToken = cleanFcmToken(req.body.fcm_token);

    // Optional device name sent by frontend.
    const deviceName = cleanText(
      req.body.device_name,
      100
    );


    // ---------------------------------------------
    // Validate user ID
    // ---------------------------------------------
    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required.'
      });
    }


    // ---------------------------------------------
    // Validate FCM token
    // ---------------------------------------------
    if (!fcmToken) {
      return res.status(400).json({
        error: 'FCM token is required.'
      });
    }


    // ---------------------------------------------
    // Check user
    // ---------------------------------------------
    const existing = await db.prepare(`
      SELECT id
      FROM notification_users
      WHERE id = ?
      LIMIT 1
    `).get(userId);


    if (!existing) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }


    // ---------------------------------------------
    // Check whether this token already exists
    // ---------------------------------------------
    const existingDevice = await db.prepare(`
      SELECT
        id,
        user_id,
        fcm_token
      FROM notification_devices
      WHERE fcm_token = ?
      LIMIT 1
    `).get(fcmToken);


    if (existingDevice) {

      // -------------------------------------------
      // Token already exists for this user
      // -------------------------------------------
      if (existingDevice.user_id === userId) {

        await db.prepare(`
          UPDATE notification_devices
          SET
            device_name = ?,
            last_seen_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          deviceName || null,
          existingDevice.id
        );

      } else {

        // -------------------------------------------
        // FCM token moved to another user
        // -------------------------------------------
        await db.prepare(`
          UPDATE notification_devices
          SET
            user_id = ?,
            device_name = ?,
            last_seen_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          userId,
          deviceName || null,
          existingDevice.id
        );
      }

    } else {

      // ---------------------------------------------
      // New device token
      // ---------------------------------------------
      const deviceId = uuidv4();

      await db.prepare(`
        INSERT INTO notification_devices (
          id,
          user_id,
          fcm_token,
          device_name,
          created_at,
          last_seen_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `).run(
        deviceId,
        userId,
        fcmToken,
        deviceName || null
      );
    }


    // ---------------------------------------------
    // Keep legacy token updated
    // ---------------------------------------------
    await db.prepare(`
      UPDATE notification_users
      SET fcm_token = ?
      WHERE id = ?
    `).run(
      fcmToken,
      userId
    );


    // ---------------------------------------------
    // Get device count
    // ---------------------------------------------
    const deviceCount = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM notification_devices
      WHERE user_id = ?
    `).get(userId);


    // ---------------------------------------------
    // Return updated user
    // ---------------------------------------------
    const user = await db.prepare(`
      SELECT
        id,
        name,
        email,
        phone,
        notifications_enabled,
        fcm_token,
        created_at
      FROM notification_users
      WHERE id = ?
    `).get(userId);


    console.log(
      `🔔 FCM device token saved for notification user: ${userId}`
    );

    console.log(
      `📱 Registered notification devices: ${deviceCount?.count || 0}`
    );


    return res.json({
      success: true,
      user,
      device_count: Number(deviceCount?.count || 0)
    });

  } catch (error) {
    console.error(
      'Save FCM token error:',
      error
    );

    return res.status(500).json({
      error: 'Unable to save FCM token.'
    });
  }
};

