const os = require('os');

class EnvironmentDetector {
  constructor() {
    this.platform = process.platform;
    this.desktop = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase();
    this.session = (process.env.DESKTOP_SESSION || '').toLowerCase();
    this.waylandDisplay = process.env.WAYLAND_DISPLAY;
    this.sessionType = process.env.XDG_SESSION_TYPE;
  }

  isLinux() {
    return this.platform === 'linux';
  }

  isWayland() {
    return !!this.waylandDisplay || this.sessionType === 'wayland';
  }

  isHyprland() {
    return this.desktop.includes('hypr') || this.session.includes('hypr');
  }

  isSway() {
    return this.desktop.includes('sway');
  }

  isKDE() {
    return this.desktop === 'kde';
  }

  isGNOME() {
    return this.desktop.includes('gnome');
  }

  isTilingWM() {
    return (
      this.isHyprland() ||
      this.isSway() ||
      this.desktop.includes('i3') ||
      this.desktop.includes('bspwm')
    );
  }

  getInfo() {
    return {
      platform: this.platform,
      isLinux: this.isLinux(),
      isWayland: this.isWayland(),
      isHyprland: this.isHyprland(),
      isSway: this.isSway(),
      isKDE: this.isKDE(),
      isGNOME: this.isGNOME(),
      isTilingWM: this.isTilingWM(),
      desktop: this.desktop,
      cpus: os.cpus().length,
      memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
    };
  }
}

module.exports = EnvironmentDetector;
