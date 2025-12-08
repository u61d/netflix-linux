const winston = require('winston');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

class Logger {
  constructor() {
    const logDir = path.join(app.getPath('userData'), 'logs');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `[${timestamp}] ${level.toUpperCase()}: ${message}${stack ? '\n' + stack : ''}`;
        })
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
}

module.exports = Logger;