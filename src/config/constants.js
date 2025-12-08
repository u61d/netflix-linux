const path = require('path');

const ASSETS = {
  icon: path.join(__dirname, '../../assets/icons/icon.png'),
  iconPlaying: path.join(__dirname, '../../assets/icons/icon-playing.png'),
  iconPaused: path.join(__dirname, '../../assets/icons/icon-paused.png'),
  stats: path.join(__dirname, '../../assets/icons/stats.png'),
  play: path.join(__dirname, '../../assets/icons/play.png'),
  pause: path.join(__dirname, '../../assets/icons/pause.png'),
  seek: path.join(__dirname, '../../assets/icons/seek.png'),
  error: path.join(__dirname, '../../assets/icons/error.png'),
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
