const path = require('path');
const fs = require('fs');

const iconDir = path.join(__dirname, '../../assets/icons');
const icon = path.join(iconDir, 'icon.png');
const withFallback = (name) => {
  const candidate = path.join(iconDir, name);
  return fs.existsSync(candidate) ? candidate : icon;
};

const ASSETS = {
  icon,
  iconPlaying: withFallback('icon-playing.png'),
  iconPaused: withFallback('icon-paused.png'),
  stats: withFallback('stats.png'),
  play: withFallback('play.png'),
  pause: withFallback('pause.png'),
  seek: withFallback('seek.png'),
  error: withFallback('error.png'),
};

const SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

const TIMINGS = {
  TICK_MS: 1000,
  AUTOSKIP_INTERVAL_MS: 500,
  RPC_RETRY_MS: 7000,
  RPC_UPDATE_THROTTLE_MS: 5000,
  SELECTOR_VALIDATION_MS: 3600000,
};

module.exports = {
  ASSETS,
  SPEEDS,
  TIMINGS,
};
