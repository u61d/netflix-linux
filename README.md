# Netflix for Linux

Unofficial Netflix desktop client for Linux with DRM support, Discord Rich Presence, and playback features.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-2.0.0-green.svg)

## Why?

Netflix doesn't have a proper Linux desktop app. This fixes that.

**Features:**
- Full DRM support via Widevine
- Discord Rich Presence
- Multi-profile support (different accounts, separate sessions)
- Watch history with CSV/JSON/TXT export
- Auto-skip intros, recaps, credits
- Screenshot capture (F12)
- Picture-in-Picture mode
- Speed controls (0.25x to 4x)
- Auto-pause on focus loss (workspace-aware on Hyprland)
- Health reminders
- Stats overlay with real-time metrics
- Customizable keyboard shortcuts
- Watch queue (experimental)
- Wayland and tiling WM support (tested on Hyprland, i3, bspwm)

**Privacy:**
- No tracking by default
- Crash reporting is opt-in only (uses Sentry)
- Everything runs locally
- See [PRIVACY.md](PRIVACY.md)

## Install

### Requirements

- Linux (any distro)
- Node.js 18+ and npm 9+
- System packages:
  - Arch/Manjaro: `gtk3 nss alsa-lib`
  - Debian/Ubuntu: `libgtk-3-0 libnss3 libasound2`
  - Fedora: `gtk3 nss alsa-lib`

### Quick Install

Download from [Releases](https://github.com/u61d/netflix-linux/releases):

**AppImage** (universal):
```bash
chmod +x Netflix-*.AppImage
./Netflix-*.AppImage
```

**Arch/Manjaro**:
```bash
sudo pacman -U netflix-linux-*.pacman
```

**Debian/Ubuntu**:
```bash
sudo dpkg -i netflix-linux-*.deb
```

### Build from Source

```bash
git clone https://github.com/u61d/netflix-linux
cd netflix-linux
npm install
npm start
```

Build packages:
```bash
npm run build              # all formats
npm run build:appimage     # AppImage only
npm run build:pacman       # Arch package
npm run build:deb          # Debian package
```

## Usage

### Keyboard Shortcuts

| Keys | Action |
|------|--------|
| `Ctrl+,` | Settings |
| `Ctrl+Shift+S` | Show stats |
| `Ctrl+Shift+H` | Watch history |
| `Ctrl+Shift+Q` | Watch queue |
| `Ctrl+K` | Customize shortcuts |
| `Ctrl+P` | Switch profiles |
| `F12` | Screenshot |
| `F9` | Picture-in-Picture |
| `F6/F7/F8` | Speed controls |
| `Ctrl+Shift+T` | Always on top |
| `Ctrl+Q` | Quit |

All shortcuts are customizable.

### Discord Rich Presence

Shows what you're watching on Discord. Requires Discord desktop client.

To use your own Discord app:
1. Create app at [discord.com/developers](https://discord.com/developers/applications)
2. Copy Client ID
3. Settings → Discord → Paste Client ID

Or set via environment variable:
```bash
export DISCORD_CLIENT_ID=your_client_id
```

### Multiple Profiles

Use profiles for different Netflix accounts or separate watch histories. Each profile has isolated cookies and sessions. No restart needed to switch.

### Screenshots

Press F12 to capture. Saves to `~/Pictures/Netflix Screenshots/` by default.

Sound effect requires one of:
- `paplay` (PulseAudio)
- `pw-play` (PipeWire)
- `canberra-gtk-play`

```bash
# Arch
sudo pacman -S libpulse pipewire

# Debian/Ubuntu
sudo apt install pulseaudio-utils pipewire-bin
```

## Configuration

**Settings**: `~/.config/netflix-linux/settings.json`  
**Logs**: `~/.config/netflix-linux/logs/`  
**Screenshots**: `~/Pictures/Netflix Screenshots/` (configurable)

### Environment Variables

Optional (see `.env.example`):

```bash
# Sentry error tracking (requires opt-in in settings)
SENTRY_DSN=your_sentry_dsn

# Custom Discord app ID
DISCORD_CLIENT_ID=your_discord_app_id
```

## Development

```bash
# Run with DevTools
npm run dev

# Tests
npm test
npm run test:watch
npm run test:coverage
npm run test:e2e

# Lint and format
npm run lint
npm run format
```

### Project Structure

```
src/
├── main/                 # Backend (Electron)
│   ├── index.js         # Entry point
│   ├── AppContext.js    # Dependency injection
│   ├── managers/        # Window, RPC, Keybind, Menu, Tray
│   ├── services/        # AutoSkipper, Playback, History
│   ├── handlers/        # IPC handlers
│   └── utils/           # Logger, validation, notifications
├── renderer/            # Frontend (HTML/CSS/JS)
│   ├── windows/         # Settings, history, profiles, queue
│   └── shared/          # Shared styles
└── config/              # Constants, defaults, selectors

tests/
├── unit/                # Jest unit tests
└── e2e/                 # Playwright E2E tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Known Issues

### Wayland
Some window management features need extra flags. The app auto-detects Wayland and adjusts.

### Tiling WMs
Enable "Borderless window" in settings for better tiling behavior.

### Screenshot sound not working
Install one of: `paplay`, `pw-play`, or `canberra-gtk-play`

### Discord RPC not connecting
Discord desktop client must be running. Browser version doesn't support RPC.

### Watch queue
Queue is experimental and may not populate on some Netflix layouts. Use `Ctrl+Shift+Q` to open it.

### Video won't play
The app uses Castlabs Electron with Widevine DRM. Check logs in `~/.config/netflix-linux/logs/` if playback fails.

## Contributing

PRs welcome. Please:
- Follow existing code style
- Add tests for new features
- Run `npm run lint` before committing
- Update docs if needed

**Note:** CI workflows use secrets (Sentry) that won't be available in forks. Maintainers handle releases.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT - see [LICENSE](LICENSE)

## Disclaimer

This is an unofficial client. Netflix is a trademark of Netflix, Inc. This project is not affiliated with or endorsed by Netflix, Inc.

## Credits

- Castlabs for Electron with Widevine
- Netflix for making content worth watching
- Everyone who filed issues and contributed