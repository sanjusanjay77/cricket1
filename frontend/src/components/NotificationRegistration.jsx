import { useEffect, useState } from 'react';
import { Notifications } from '../api/api.js';

const STORAGE_KEY = 'gccNotificationUserId';

export default function NotificationRegistration() {
  const [checking, setChecking] = useState(true);
  const [show, setShow] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkExistingUser();
  }, []);

  const checkExistingUser = async () => {
    const savedUserId =
      localStorage.getItem(STORAGE_KEY);

    if (!savedUserId) {
      setShow(true);
      setChecking(false);
      return;
    }

    try {
      await Notifications.getUser(savedUserId);

      // User already registered.
      setShow(false);
    } catch (err) {
      // Stored ID no longer exists.
      localStorage.removeItem(STORAGE_KEY);
      setShow(true);
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');

    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }

    if (!email.trim() && !phone.trim()) {
      setError('Enter your email or phone number.');
      return;
    }

    setSaving(true);

    try {
      const result = await Notifications.register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim()
      });

      if (!result?.user?.id) {
        throw new Error(
          'Registration failed. Please try again.'
        );
      }

      localStorage.setItem(
        STORAGE_KEY,
        result.user.id
      );

      setShow(false);

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

  if (checking || !show) {
    return null;
  }

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
          animate-[slideUp_.25s_ease-out]
        "
      >
        {/* Header */}
        <div className="relative px-5 pt-6 pb-5 bg-gradient-to-br from-emerald-600/20 via-slate-950 to-slate-950">
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

          <div className="flex items-start gap-4 pt-2 sm:pt-0">
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

            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Get Live Match Alerts
              </h2>

              <p className="text-sm text-slate-400 mt-1 leading-5">
                Register once and we'll let you know when a
                match goes live.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="px-5 pb-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
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

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Email address
              <span className="text-slate-500 font-normal">
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

          <div className="relative">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Phone number
              <span className="text-slate-500 font-normal">
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
            🔒 Your details are used only for GCC Cricket
            notifications.
          </div>

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
              shadow-lg
              shadow-emerald-500/10
            "
          >
            {saving
              ? 'Registering...'
              : '🔔 Notify Me'}
          </button>

          <p className="text-center text-xs text-slate-600">
            You only need to register once on this device.
          </p>
        </form>
      </div>
    </div>
  );
}
