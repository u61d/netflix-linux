const winston = require('winston');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const { formatLogLine } = require('./logFormat');

class Logger {
  constructor() {
    const logDir = path.join(app.getPath('userData'), 'logs');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const defaultLevel =
      process.env.NETFLIX_LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');

    this.logger = winston.createLogger({
      level: defaultLevel,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(formatLogLine)
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),

        // main log file, rotates at 5MB
        new winston.transports.File({
          filename: path.join(logDir, 'netflix.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),

        // separate file for errors only
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: 5242880,
          maxFiles: 3,
        }),
      ],
    });
  }

  info(message, ...args) {
    this.logger.info(message, ...args);
  }

  warn(message, ...args) {
    this.logger.warn(message, ...args);
  }

  error(message, ...args) {
    this.logger.error(message, ...args);
  }

  debug(message, ...args) {
    this.logger.debug(message, ...args);
  }

  setLevel(level = 'info') {
    this.logger.level = level;
    this.logger.info(`Logger level set to: ${level}`);
  }
}

module.exports = Logger;
