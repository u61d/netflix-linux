const Store = require('electron-store');
const { DEFAULTS } = require('../config/defaults');
const Logger = require('./utils/logger');

class AppContext {
  constructor() {
    this.store = new Store({ name: 'settings', defaults: DEFAULTS });
    this.logger = new Logger();
    this.mainWindow = null;
    this.managers = {};
    this.services = {};
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  getMainWindow() {
    return this.mainWindow;
  }

  registerManager(name, manager) {
    this.managers[name] = manager;
  }

  getManager(name) {
    return this.managers[name];
  }

  registerService(name, service) {
    this.services[name] = service;
  }

  getService(name) {
    return this.services[name];
  }

  async cleanup() {
    this.logger.info('Cleaning up application context');

    for (const service of Object.values(this.services)) {
      if (service.cleanup) {
        await service.cleanup();
      }
    }

    for (const manager of Object.values(this.managers)) {
      if (manager.cleanup) {
        await manager.cleanup();
      }
    }
  }
}

module.exports = AppContext;
