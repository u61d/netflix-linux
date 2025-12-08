# Contributing to Netflix for Linux

Thanks for considering contributing! This project started as a personal tool, so the codebase might have some quirks.

## Quick Start

```bash
git clone https://github.com/u61d/netflix-linux
cd netflix-linux
npm install
npm start
```

## Development

### Running in Dev Mode

```bash
npm run dev  # Launches with DevTools open
```

### Code Structure

```
src/
├── main/                 # Backend (Node.js/Electron)
│   ├── index.js         # Entry point
│   ├── AppContext.js    # Dependency injection container
│   ├── managers/        # Window, RPC, Keybind, Menu, Tray managers
│   ├── services/        # AutoSkipper, PlaybackService, etc.
│   ├── handlers/        # IPC handlers (settings, history, profiles)
│   └── utils/           # Logger, validation, notifications, Sentry
├── renderer/            # Frontend (HTML/CSS/JS)
│   ├── windows/         # Settings, history, profiles, queue UIs
│   └── shared/          # Shared CSS
└── config/              # Constants, defaults, selectors, schemas

tests/
├── unit/                # Jest unit tests
└── e2e/                 # Playwright E2E tests
```

### Architecture

- **AppContext**: Dependency injection container. All services/managers register here.
- **Services**: Business logic (auto-skipping, playback control, history tracking)
- **Managers**: UI/system integration (windows, keybinds, Discord RPC)
- **Handlers**: IPC communication between main/renderer processes

### Testing

```bash
npm test                 # Run unit tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
npm run test:e2e         # End-to-end tests (slow)
```

We need more tests. Current coverage is minimal. If you add a feature, add tests.

### Linting & Formatting

```bash
npm run lint             # Check for issues
npm run lint:fix         # Auto-fix what's possible
npm run format           # Format with Prettier
npm run format:check     # Check formatting
```

Please run these before committing. CI will fail if they don't pass.

## How to Contribute

### Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include:

- App version (Help → About)
- Linux distro & version
- Desktop environment (GNOME, KDE, Hyprland, etc.)
- Display server (Wayland or X11)
- Logs from `~/.config/netflix-linux/logs/`

### Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml). Tell us:

- What problem does this solve?
- How would you like it to work?
- Are you willing to implement it?

### Pull Requests

1. **Fork the repo** and create a branch from `main`
   ```bash
   git checkout -b fix/something-broken
   # or
   git checkout -b feature/cool-new-thing
   ```

2. **Make your changes**
   - Follow existing code style (check other files)
   - Add tests if applicable
   - Update docs if needed

3. **Test everything**
   ```bash
   npm run lint
   npm test
   npm run build  # Make sure it builds
   ```

4. **Commit with clear messages**
   ```
   Good: "Fix profile switching losing video position"
   Bad:  "fixed bug"
   ```

5. **Push and open a PR**
   - Describe what you changed and why
   - Reference any related issues (#123)
   - Screenshots/videos help

**Note:** CI uses secrets (Sentry DSN) that aren't available to forks. That's expected - your tests will pass locally, and maintainers will handle the release builds. Don't worry about CI failures related to missing secrets.

### Code Style

- **Use the existing style.** If a file uses `const`, don't introduce `var`.
- **Comments**: Explain *why*, not *what*. Code shows what it does.
  ```javascript
  // Bad
  const speed = 1.5; // Set speed to 1.5
  
  // Good
  const speed = 1.5; // Fallback when user preference is invalid
  ```
- **Error handling**: Always handle errors. Use try-catch or `.catch()`.
- **Logging**: Use `ctx.logger` not `console.log` (except in renderer preloads where logger isn't available)

### What We're Looking For

**High Priority:**
- Bug fixes
- More unit tests
- Better error messages
- Performance improvements
- Accessibility improvements

**Medium Priority:**
- New features (discuss in an issue first)
- UI/UX improvements
- Documentation improvements

**Low Priority:**
- Code refactoring without clear benefit
- Adding dependencies (we try to keep it light)

### Netflix Selector Updates

If Netflix changes their UI and auto-skip breaks:

1. Update `src/config/selectors.json`
2. Test thoroughly
3. Open PR with "Update Netflix selectors" title
4. Mention which selectors you changed and how you tested

## Development Tips

### Debugging

- **Main process**: `npm run dev` (DevTools in main window)
- **Renderer process**: Right-click → Inspect Element
- **Logs**: `~/.config/netflix-linux/logs/netflix.log`
- **Settings file**: `~/.config/netflix-linux/settings.json`

### Testing DRM/Widevine

This app uses Castlabs Electron. Regular Electron won't work for Netflix playback. The `package.json` already points to the right version.

### Common Issues

**"Cannot find module..."**
```bash
rm -rf node_modules package-lock.json
npm install
```

**"Widevine not working"**
- Make sure you're using the Castlabs Electron build
- Check logs for CDM errors
- Try: `npm run postinstall`

**"Settings window won't open"**
- Check DevTools console for errors
- Look for preload script issues
- Verify IPC handlers are registered

## Project Priorities

1. **Privacy first**: No tracking, opt-in only telemetry
2. **Performance**: Keep it fast and responsive
3. **Simplicity**: Don't over-engineer
4. **Linux-friendly**: Support tiling WMs, Wayland, etc.

## Questions?

Open an issue with the "question" label or start a discussion.

## License

By contributing, you agree your code will be licensed under MIT (same as the project).

---

Thanks for helping make this better!