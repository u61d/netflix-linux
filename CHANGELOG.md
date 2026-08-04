# Changelog

## [Unreleased]

### Added

- Subtitle customization: size, font, color, background/opacity, edge style, and vertical position, with live preview in Settings
- Selector health check for subtitles, same idea as the auto-skip one
- Subtitle DOM selectors moved into `selectors.json` with the skip-button ones

## [2.1.0] - 2026-05-02

### Added

- Auto-update controls with stable/beta channels, release browsing, rollback links, and background downloads
- Session restore prompt on startup plus a manual restore action in settings
- Selector health diagnostics with JSON export
- Advanced watch queue controls: hover-card add button, search, drag reorder, dedupe, pin, and play-next
- Theme packs and compact mode for app windows
- Crash-safe mode after repeated unclean exits
- E2E smoke tests for critical flows
- Import/export for settings
- Community health docs for contributors and pull requests

### Fixed

- Discord RPC now looks for Linux IPC sockets more reliably and backs off reconnects instead of hammering
- Watch history ignores browse pages, tracks paused time correctly, and finalizes sessions on cleanup
- Screenshot sound and capture are debounced to avoid duplicates
- Settings side effects only re-apply when values actually changed

### Changed

- Settings window now exposes update, diagnostics, restore, appearance, and safety controls in one place
- Renderer queue integration can add titles directly from Netflix hover cards
- Child windows inherit the selected theme and compact mode after load
- Main process startup now tracks crash state and can enter safe mode automatically
- Stats overlay can include connection and drop-rate data alongside the existing playback stats

## [2.0.1] - 2026-02-21

Stability and polish update.

### What Changed

- Improved main process safety defaults
- Added icon fallbacks to avoid missing resource issues
- Fixed WindowManager test handle leak
- Cleaned settings window messaging/wording
- Updated docs for discoverability:
  - README roadmap + "Help This Project Grow"
  - Better contribution/discoverability notes
- Added new release media:
  - UI demo GIF
  - Settings screenshot
  - History screenshot

### Notes

- No intentional breaking changes
- Linux packages included: AppImage, pacman, deb.

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
