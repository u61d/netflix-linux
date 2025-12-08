const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Smoke Tests', () => {
  let app;
  let window;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [path.join(__dirname, '../../src/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('should launch and load Netflix', async () => {
    await window.waitForURL('**/netflix.com/**', { timeout: 30000 });
    
    const title = await window.title();
    expect(title).toContain('Netflix');
  });

  test('should open settings window', async () => {
    await window.keyboard.press('Control+,');
    
    const windows = await app.windows();
    expect(windows.length).toBeGreaterThan(1);
    
    const settingsWindow = windows.find(w => w.url().includes('settings'));
    expect(settingsWindow).toBeDefined();

    const heading = await settingsWindow.textContent('h1');
    expect(heading).toContain('Settings');
  });

  test('should toggle Discord RPC setting', async () => {
    const windows = await app.windows();
    const settingsWindow = windows.find(w => w.url().includes('settings'));
    
    if (settingsWindow) {
      const checkbox = await settingsWindow.locator('#discordEnabled');
      const initialState = await checkbox.isChecked();
      
      await checkbox.click();
      
      const newState = await checkbox.isChecked();
      expect(newState).toBe(!initialState);
    }
  });
});