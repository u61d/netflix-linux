# Changelog

## [Unreleased]

### Added
- Auto-update checker (downloads in background, asks before installing)
- E2E smoke tests for critical flows
- Better error handling for profile switching
- Import/export for settings
- Drag-to-reorder profiles
- Community can now update Netflix selectors without waiting for releases
- Auto-pause/resume on focus loss with Hyprland workspace awareness
- Auto-skip recap toggle in settings and menu
- Discord RPC shows Linux distro name/icon when available

### Fixed
- Profile switching doesn't lose your video position anymore
- Infinite retry loops when opening settings/keybinds windows (caps at 20 now)
- Missing error handling in player state tracking
- Discord RPC uses exponential backoff instead of hammering the server
- Watch history persists during playback and refreshes history window
- Screenshot sound and capture are debounced to avoid duplicates

### Changed
- Profile switching keeps main window open (was closing before)
- Better error messages in renderer preloads
- Stats overlay re-injects on navigation
- Skip recap selector updated for newer Netflix markup

## [2.0.0] - 2025-07-12

Built this over a few months as a personal project, figured I'd clean it up and share.

### What Works
- **DRM support** via Castlabs Electron (works on Linux without browser hassles)
- **Discord Rich Presence** - show what you're watching
- **Multi-profile support** - separate Netflix accounts per session
- **Watch history tracking** - export to CSV/JSON/TXT
- **Auto-skip** intros, recaps, credits
- **Screenshot capture** (F12) with sound effects
- **Picture-in-Picture** mode
- **Speed controls** 0.25x to 4x
- **Health reminders** for when you've been binging too long
- **Stats overlay** with real-time video metrics
- **Customizable keyboard shortcuts**
- **Queue management**
- **Wayland and tiling WM support** (tested on Hyprland, i3, bspwm)

### Privacy
- No tracking by default
- Crash reporting is opt-in only (uses Sentry with PII stripping)
- Anonymous IDs only
- Home paths are sanitized in logs

### Known Issues
- Some window features need extra setup on Wayland
- Screenshot sound needs `paplay`, `pw-play`, or `canberra-gtk-play`
- Discord RPC only works with desktop client

### Thanks
- Castlabs for Electron with Widevine
- Everyone who filed issues during testing

---

If you find bugs, [open an issue](https://github.com/u61d/netflix-linux/issues). PRs welcome but read CONTRIBUTING.md first.