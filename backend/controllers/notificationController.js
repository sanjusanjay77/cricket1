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
