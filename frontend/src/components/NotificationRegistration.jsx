
import { useEffect, useState } from 'react';
import { Notifications } from '../api/api.js';
import socket, {
  registerNotificationUser
} from '../socket.js';
import { requestPushPermission } from '../notifications.js';

const STORAGE_KEY = 'gccNotificationUserId';

export default function NotificationRegistration() {
  const [checking, setChecking] = useState(true);
  const [show, setShow] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [notificationUserId, setNotificationUserId] =
    useState(null);

  const [testStatus, setTestStatus] = useState('');
  const [testing, setTesting] = useState(false);

  /* =======================================================
     CHECK EXISTING USER
  ======================================================= */

  useEffect(() => {
    checkExistingUser();
  }, []);

  /* =======================================================
     LISTEN FOR SOCKET.IO LIVE MATCH NOTIFICATIONS
  ======================================================= */

  useEffect(() => {
    const handleMatchStarted = (notification) => {
      console.log(
        '🔔 Live match notification received:',
        notification
      );

      if (
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const notificationOptions = {
          body:
            notification?.message ||
            'A match is now live!',

          icon: '/favicon.ico',

          badge: '/favicon.ico',

          tag:
            `gcc-match-${notification?.matchId}`,

          requireInteraction: true,

          data: {
            matchId:
              notification?.matchId,

            url:
              notification?.url ||
              (
                notification?.matchId
                  ? `/match/${notification.matchId}/live`
                  : '/'
              )
          }
        };

        navigator.serviceWorker.ready
          .then((registration) => {
            return registration.showNotification(
              notification?.title ||
                '🏏 GCC Cricket - Live Match',
              notificationOptions
            );
          })
          .catch((error) => {
            console.error(
              '❌ Failed to show notification:',
              error
            );
          });
      } else {
        console.log(
          '🔔 Match is live:',
          notification
        );
      }
    };

    socket.on(
      'match-started',
      handleMatchStarted
    );

    return () => {
      socket.off(
        'match-started',
        handleMatchStarted
      );
    };
  }, []);

  /* =======================================================
     SET UP FCM PUSH NOTIFICATIONS
  ======================================================= */

  const setupPushNotifications = async (userId) => {
    if (!userId) {
      console.warn(
        '⚠️ Cannot setup push notifications: user ID missing.'
      );

      return null;
    }

    try {
      console.log(
        '🔔 Setting up Firebase push notifications...'
      );

      const token =
        await requestPushPermission(userId);

      if (token) {
        console.log(
          '🎉 Firebase push notifications enabled.'
        );

        return token;
      }

      console.warn(
        '⚠️ Firebase push notification setup was not completed.'
      );

      return null;

    } catch (error) {
      console.error(
        '❌ Firebase push setup error:',
        error
      );

      return null;
    }
  };

  /* =======================================================
     TEST MOBILE NOTIFICATION
  ======================================================= */

  const testMobileNotification = async () => {
    setTesting(true);
    setTestStatus('🔄 Starting test...');

    try {
      /*
       * STEP 1
       * Check browser notification support.
       */
      if (!('Notification' in window)) {
        throw new Error(
          'This browser does not support notifications.'
        );
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error(
          'This browser does not support Service Workers.'
        );
      }

      setTestStatus(
        `1/4 ✅ Browser supported. Permission: ${Notification.permission}`
      );

      /*
       * STEP 2
       * Check/request notification permission.
       */
      let permission =
        Notification.permission;

      if (permission !== 'granted') {
        permission =
          await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        throw new Error(
          `Notification permission is "${permission}".`
        );
      }

      setTestStatus(
        '2/4 ✅ Notification permission granted.'
      );

      /*
       * STEP 3
       * Check Firebase Service Worker.
       */
      const registration =
        await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js'
        );

      await navigator.serviceWorker.ready;

      setTestStatus(
        '3/4 ✅ Firebase Service Worker is ready.'
      );

      /*
       * Show a direct browser notification.
       *
       * This does NOT depend on Firebase.
       * If this appears on mobile, browser
       * notifications themselves are working.
       */
      await registration.showNotification(
        '🏏 GCC Cricket Mobile Test',
        {
          body:
            'Mobile browser notifications are working.',

          icon: '/favicon.ico',

          badge: '/favicon.ico',

          tag: 'gcc-mobile-test',

          requireInteraction: true,

          data: {
            url: '/'
          }
        }
      );

      /*
       * STEP 4
       * Run your existing Firebase registration.
       *
       * This calls the same requestPushPermission()
       * already used by the real application.
       */
      setTestStatus(
        '4/4 🔄 Testing Firebase FCM token...'
      );

      const userId =
        notificationUserId ||
        localStorage.getItem(
          STORAGE_KEY
        );

      if (!userId) {
        throw new Error(
          'No notification user ID found on this device.'
        );
      }

      const token =
        await setupPushNotifications(
          userId
        );

      if (!token) {
        throw new Error(
          'Firebase did not return an FCM token. Check the browser console.'
        );
      }

      setTestStatus(
        '🎉 SUCCESS — Mobile notification + Firebase FCM are working.'
      );

    } catch (err) {
      console.error(
        '❌ Mobile notification test failed:',
        err
      );

      setTestStatus(
        `❌ FAILED: ${err?.message || 'Unknown error'}`
      );

    } finally {
      setTesting(false);
    }
  };

  /* =======================================================
     CHECK EXISTING USER
  ======================================================= */

  const checkExistingUser = async () => {
    const savedUserId =
      localStorage.getItem(STORAGE_KEY);

    if (!savedUserId) {
      setShow(true);
      setChecking(false);
      return;
    }

    try {
      const result =
        await Notifications.getUser(
          savedUserId
        );

      setNotificationUserId(
        savedUserId
      );

      /*
       * Connect this browser to the user's
       * Socket.IO notification room.
       */
      registerNotificationUser(
        savedUserId
      );

      /*
       * Setup Firebase push notifications again.
       */
      setupPushNotifications(
        savedUserId
      );

      setShow(false);

      console.log(
        '✅ Existing notification user loaded:',
        result
      );

    } catch (err) {
      console.error(
        'Existing notification user check failed:',
        err
      );

      localStorage.removeItem(
        STORAGE_KEY
      );

      setShow(true);

    } finally {
      setChecking(false);
    }
  };

  /* =======================================================
     REGISTER USER
  ======================================================= */

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');

    if (!name.trim()) {
      setError(
        'Please enter your name.'
      );
      return;
    }

    if (
      !email.trim() &&
      !phone.trim()
    ) {
      setError(
        'Enter your email or phone number.'
      );
      return;
    }

    setSaving(true);

    try {
      /*
       * Register user in database FIRST.
       */
      const result =
        await Notifications.register({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim()
        });

      if (!result?.user?.id) {
        throw new Error(
          'Registration failed. Please try again.'
        );
      }

      const userId =
        result.user.id;

      /*
       * Remember user on this browser.
       */
      localStorage.setItem(
        STORAGE_KEY,
        userId
      );

      setNotificationUserId(
        userId
      );

      /*
       * Connect user to Socket.IO room.
       */
      registerNotificationUser(
        userId
      );

      /*
       * Hide registration form.
       */
      setShow(false);

      console.log(
        '✅ Notification registration completed:',
        userId
      );

      /*
       * Setup Firebase push.
       */
      await setupPushNotifications(
        userId
      );

    } catch (err) {
      console.error(
        'Notification registration failed:',
        err
      );

      setError(
        err?.response?.data?.error ||
        err?.message ||
        'Unable to register. Please try again.'
      );

    } finally {
      setSaving(false);
    }
  };

  /* =======================================================
     LOADING
  ======================================================= */

  if (checking) {
    return null;
  }

  /* =======================================================
     EXISTING USER
     SHOW TEMPORARY TEST BUTTON
  ======================================================= */

  if (!show) {
    return (
      <div
        className="
          fixed
          bottom-4
          right-4
          z-[9999]
          w-[calc(100%-2rem)]
          sm:w-auto
          sm:min-w-[280px]
        "
      >
        <div
          className="
            rounded-2xl
            bg-slate-950
            border
            border-slate-800
            shadow-2xl
            p-3
          "
        >
          <button
            type="button"
            onClick={testMobileNotification}
            disabled={testing}
            className="
              w-full
              min-h-[46px]
              px-4
              rounded-xl
              bg-emerald-500
              hover:bg-emerald-400
              disabled:opacity-50
              disabled:cursor-not-allowed
              text-white
              font-bold
              transition
            "
          >
            {testing
              ? '🔄 Testing...'
              : '🔔 Test Mobile Notification'}
          </button>

          {testStatus && (
            <div
              className="
                mt-2
                px-2
                text-xs
                leading-5
                text-slate-300
                break-words
              "
            >
              {testStatus}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* =======================================================
     REGISTRATION FORM
  ======================================================= */

  return (
    <div
      className="
        fixed
        inset-0
        z-[9999]
        bg-black/70
        backdrop-blur-sm
        flex
        items-end
        sm:items-center
        justify-center
        p-0
        sm:p-4
      "
    >
      <div
        className="
          w-full
          sm:max-w-md
          bg-slate-950
          border
          border-slate-800
          rounded-t-3xl
          sm:rounded-3xl
          shadow-2xl
          overflow-hidden
        "
      >

        {/* HEADER */}

        <div
          className="
            relative
            px-5
            pt-6
            pb-5
            bg-gradient-to-br
            from-emerald-600/20
            via-slate-950
            to-slate-950
          "
        >

          <div
            className="
              absolute
              top-3
              left-1/2
              -translate-x-1/2
              w-10
              h-1
              rounded-full
              bg-slate-700
              sm:hidden
            "
          />

          <div
            className="
              flex
              items-start
              gap-4
            "
          >

            <div
              className="
                w-14
                h-14
                rounded-2xl
                bg-emerald-500/15
                border
                border-emerald-500/20
                flex
                items-center
                justify-center
                text-3xl
                shrink-0
              "
            >
              🔔
            </div>

            <div>
              <h2
                className="
                  text-xl
                  sm:text-2xl
                  font-bold
                  text-white
                "
              >
                Get Live Match Alerts
              </h2>

              <p
                className="
                  text-sm
                  text-slate-400
                  mt-1
                  leading-5
                "
              >
                Register once and we'll let you know
                when a match goes live.
              </p>
            </div>

          </div>
        </div>

        {/* FORM */}

        <form
          onSubmit={handleSubmit}
          className="
            px-5
            pb-6
            space-y-4
          "
        >

          {/* NAME */}

          <div>

            <label
              className="
                block
                text-sm
                font-medium
                text-slate-300
                mb-2
              "
            >
              Your name
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              placeholder="Enter your name"
              autoComplete="name"
              disabled={saving}
              className="
                w-full
                min-h-[48px]
                px-4
                rounded-xl
                bg-slate-900
                border
                border-slate-700
                text-white
                placeholder:text-slate-600
                outline-none
                focus:border-emerald-500
                focus:ring-2
                focus:ring-emerald-500/20
              "
            />

          </div>

          {/* EMAIL */}

          <div>

            <label
              className="
                block
                text-sm
                font-medium
                text-slate-300
                mb-2
              "
            >
              Email address

              <span
                className="
                  text-slate-500
                  font-normal
                "
              >
                {' '}optional
              </span>
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="you@example.com"
              autoComplete="email"
              disabled={saving}
              className="
                w-full
                min-h-[48px]
                px-4
                rounded-xl
                bg-slate-900
                border
                border-slate-700
                text-white
                placeholder:text-slate-600
                outline-none
                focus:border-emerald-500
                focus:ring-2
                focus:ring-emerald-500/20
              "
            />

          </div>

          {/* PHONE */}

          <div>

            <label
              className="
                block
                text-sm
                font-medium
                text-slate-300
                mb-2
              "
            >
              Phone number

              <span
                className="
                  text-slate-500
                  font-normal
                "
              >
                {' '}optional
              </span>
            </label>

            <input
              type="tel"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              placeholder="+91 98765 43210"
              autoComplete="tel"
              disabled={saving}
              className="
                w-full
                min-h-[48px]
                px-4
                rounded-xl
                bg-slate-900
                border
                border-slate-700
                text-white
                placeholder:text-slate-600
                outline-none
                focus:border-emerald-500
                focus:ring-2
                focus:ring-emerald-500/20
              "
            />

          </div>

          {/* ERROR */}

          {error && (
            <div
              className="
                rounded-xl
                border
                border-red-500/20
                bg-red-500/10
                px-4
                py-3
                text-sm
                text-red-300
              "
            >
              {error}
            </div>
          )}

          {/* INFO */}

          <div
            className="
              rounded-xl
              bg-slate-900/70
              border
              border-slate-800
              p-3
              text-xs
              text-slate-500
              leading-5
            "
          >
            🔒 Your details are used only for
            GCC Cricket notifications.
          </div>

          {/* BUTTON */}

          <button
            type="submit"
            disabled={saving}
            className="
              w-full
              min-h-[52px]
              rounded-xl
              bg-emerald-500
              hover:bg-emerald-400
              active:bg-emerald-600
              disabled:opacity-50
              disabled:cursor-not-allowed
              text-white
              font-bold
              text-base
              transition
            "
          >
            {saving
              ? 'Registering...'
              : '🔔 Notify Me'}
          </button>

          <p
            className="
              text-center
              text-xs
              text-slate-600
            "
          >
            You only need to register once
            on this device.
          </p>

        </form>

      </div>
    </div>
  );
}

