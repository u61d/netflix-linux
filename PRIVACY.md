# Privacy Policy

**Last Updated**: December 2025

## TL;DR

- No tracking by default
- Crash reports are opt-in only
- Everything runs on your machine
- Your Netflix login stays between you and Netflix
- Watch history never leaves your computer

## What Gets Collected (Only If You Turn It On)

### Crash Reports

By default, crash reporting is **OFF**. If you enable it in Settings → Advanced:

**What gets sent:**
- Error messages and stack traces
- Your app version, OS version, Electron version
- A random anonymous ID (not connected to you personally)
- Settings that might have caused the crash

**What doesn't get sent:**
- Your Netflix account or what you watch
- Your IP address
- Your username or file paths
- Cookies, passwords, or session data

These reports go to Sentry (open-source error tracking). Only 10% of errors are sampled to keep data collection minimal.

**Important:** Crash reporting requires both:
1. You enabling it in settings
2. The app being built with a `SENTRY_DSN` environment variable

If you build from source without `SENTRY_DSN`, crash reporting won't work even if enabled.

### Discord Rich Presence

If you enable Discord integration, it shows what you're watching on your profile. This data goes directly to Discord, not to me. You control this in Settings.

## What Stays on Your Computer

Everything else is stored locally in `~/.config/netflix-linux/`:

- Your preferences
- Watch history (for the stats feature)
- Screenshots
- Keyboard shortcuts
- Profile settings
- Window positions

**We never see any of this.** It's yours.

## Third-Party Services

**Netflix**: You log in directly through their web player. I'm just wrapping it with extra features. Your credentials go to Netflix, not through me.

**Discord** (optional): If enabled, the app tells Discord what you're watching via their Rich Presence API.

**Sentry** (optional): Only if you enable crash reports AND the app was built with Sentry configured. See above.

## Your Rights

- Use the app completely offline (except for Netflix streaming, obviously)
- Disable all telemetry (it's disabled by default anyway)
- Delete everything by removing `~/.config/netflix-linux/`
- Read the source code - this is open source for a reason

## Questions?

Open an issue: https://github.com/u61d/netflix-linux/issues

## Changes to This Policy

If this policy changes, I'll update the date above and mention it in release notes.

---

**Bottom line**: This app respects your privacy because I built it for myself first. I don't want my data collected either, so the app doesn't do it. If you find anything suspicious in the code, please report it immediately.