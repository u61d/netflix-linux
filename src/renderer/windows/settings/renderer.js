const $ = (id) => document.getElementById(id);
let selectorHealthInFlight = false;

function setChecked(id, value) {
  const el = $(id);
  if (el) el.checked = Boolean(value);
}

function setValue(id, value, fallback = '') {
  const el = $(id);
  if (!el) return;
  el.value = value === undefined || value === null ? fallback : value;
}

function showStatus(message, type = 'info') {
  const el = $('statusMessage');
  el.classList.remove('enter-status');
  void el.offsetWidth; // force reflow so the entrance animation restarts every call
  el.style.display = 'block';
  el.className = `status ${type} enter-status`;
  el.textContent = message;
}

async function withLoading(button, task, loadingLabel) {
  const original = button.innerHTML;
  button.disabled = true;
  button.classList.add('is-loading');
  button.innerHTML = `<span class="spinner"></span>${loadingLabel || button.textContent}`;

  try {
    return await task();
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.innerHTML = original;
  }
}

function hideStatus() {
  const el = $('statusMessage');
  el.style.display = 'none';
  el.textContent = '';
}

function formatSelectorHealth(result) {
  if (!result) return 'No diagnostics returned.';
  if (result.error) return `Error: ${result.error}`;

  const rows = [
    `Checked: ${result.checkedAt}`,
    `Valid: ${result.valid}/${result.total}`,
    `Invalid: ${result.invalid}`,
    '',
  ];

  for (const selector of result.selectors || []) {
    rows.push(`${selector.exists ? 'OK ' : 'BAD'} ${selector.key}  (${selector.matchCount} match)`);
    rows.push(`  ${selector.selector}`);
  }

  return rows.join('\n');
}

function formatUpdateStatus(status) {
  if (!status) return 'Update service unavailable';
  return [
    `Current version: ${status.currentVersion}`,
    `Channel: ${status.channel}`,
    `Auto-check: ${status.autoCheck ? 'enabled' : 'disabled'}`,
    `Checking now: ${status.checking ? 'yes' : 'no'}`,
  ].join('\n');
}

async function loadUpdateStatus() {
  const status = await window.settingsAPI.getUpdateStatus();
  $('updateStatus').textContent = formatUpdateStatus(status);
}

async function loadReleaseList(force = false) {
  const releases = await window.settingsAPI.listUpdateReleases(force);
  const select = $('releaseSelect');
  select.innerHTML = '';

  for (const release of releases || []) {
    const option = document.createElement('option');
    option.value = release.tag;
    option.textContent = `${release.tag}${release.prerelease ? ' (beta)' : ''} - ${
      release.name || release.publishedAt || ''
    }`;
    select.appendChild(option);
  }

  if (!select.options.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No releases found';
    select.appendChild(option);
  }
}

async function loadSettings() {
  hideStatus();
  const s = await window.settingsAPI.getSettings();

  setChecked('discordEnabled', s.discordEnabled);
  setChecked('mprisEnabled', s.mprisEnabled);
  setChecked('notificationsEnabled', s.notificationsEnabled);
  setChecked('quietMode', s.quietMode);

  setChecked('autoCheckUpdates', s.autoCheckUpdates);
  setValue('updateChannel', s.updateChannel, 'stable');
  setChecked('sessionRestoreEnabled', s.sessionRestoreEnabled);
  setChecked('crashSafeMode', s.crashSafeMode);

  setChecked('autoSkipIntro', s.autoSkipIntro);
  setChecked('autoSkipRecap', s.autoSkipRecap);
  setChecked('autoSkipCredits', s.autoSkipCredits);
  setChecked('autoNextEpisode', s.autoNextEpisode);
  setChecked('selectorHealthAlerts', s.selectorHealthAlerts);

  setChecked('autoPauseOnBlur', s.autoPauseOnBlur);
  setValue('playbackSpeed', String(s.playbackSpeed ?? '1'));

  setChecked('subtitleCustomizationEnabled', s.subtitleCustomizationEnabled);
  setValue('subtitleFontSize', s.subtitleFontSize, 'medium');
  setValue('subtitleFontFamily', s.subtitleFontFamily, 'default');
  setValue('subtitleTextColor', s.subtitleTextColor, '#ffffff');
  setValue('subtitleBackgroundColor', s.subtitleBackgroundColor, '#000000');
  setValue('subtitleBackgroundOpacity', s.subtitleBackgroundOpacity, 75);
  setValue('subtitleEdgeStyle', s.subtitleEdgeStyle, 'dropshadow');
  setValue('subtitleVerticalOffset', s.subtitleVerticalOffset, 0);
  updateSubtitlePreview();

  setValue('uiTheme', s.uiTheme, 'netflix-red');
  setChecked('compactMode', s.compactMode);

  setChecked('alwaysOnTop', s.alwaysOnTop);
  setChecked('startMinimized', s.startMinimized);
  setChecked('borderless', s.borderless);

  setChecked('showDetailedStats', s.showDetailedStats);
  setChecked('networkMetricsEnabled', s.networkMetricsEnabled);
  setChecked('healthReminder', s.healthReminder);
  setValue('reminderInterval', s.reminderInterval, 60);

  setChecked('debugMode', s.debugMode);
  setChecked('sentryEnabled', s.sentryEnabled);

  setChecked('screenshotSound', s.screenshotSound);
  setChecked('screenshotNotification', s.screenshotNotification);
  setValue('screenshotsDir', s.screenshotsDir, '');
  setValue('screenshotFormat', s.screenshotFormat, 'png');
  setValue('screenshotQuality', s.screenshotQuality, 100);
  updateScreenshotQualityVisibility();

  $('safeModeInfo').textContent = [
    `Safe mode active: ${s.safeModeActive ? 'yes' : 'no'}`,
    `Crash counter: ${s.crashCount || 0}`,
  ].join('\n');

  await loadUpdateStatus();
  await loadReleaseList(false);
}

async function saveSettings() {
  const btn = $('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const updates = {
      discordEnabled: $('discordEnabled').checked,
      mprisEnabled: $('mprisEnabled').checked,
      notificationsEnabled: $('notificationsEnabled').checked,
      quietMode: $('quietMode').checked,

      autoCheckUpdates: $('autoCheckUpdates').checked,
      updateChannel: $('updateChannel').value,
      sessionRestoreEnabled: $('sessionRestoreEnabled').checked,
      crashSafeMode: $('crashSafeMode').checked,

      autoSkipIntro: $('autoSkipIntro').checked,
      autoSkipRecap: $('autoSkipRecap').checked,
      autoSkipCredits: $('autoSkipCredits').checked,
      autoNextEpisode: $('autoNextEpisode').checked,
      selectorHealthAlerts: $('selectorHealthAlerts').checked,

      autoPauseOnBlur: $('autoPauseOnBlur').checked,
      playbackSpeed: Number.parseFloat($('playbackSpeed').value),

      subtitleCustomizationEnabled: $('subtitleCustomizationEnabled').checked,
      subtitleFontSize: $('subtitleFontSize').value,
      subtitleFontFamily: $('subtitleFontFamily').value,
      subtitleTextColor: $('subtitleTextColor').value,
      subtitleBackgroundColor: $('subtitleBackgroundColor').value,
      subtitleBackgroundOpacity: Number.parseInt($('subtitleBackgroundOpacity').value, 10),
      subtitleEdgeStyle: $('subtitleEdgeStyle').value,
      subtitleVerticalOffset: Number.parseInt($('subtitleVerticalOffset').value, 10),

      uiTheme: $('uiTheme').value,
      compactMode: $('compactMode').checked,

      alwaysOnTop: $('alwaysOnTop').checked,
      startMinimized: $('startMinimized').checked,
      borderless: $('borderless').checked,

      showDetailedStats: $('showDetailedStats').checked,
      networkMetricsEnabled: $('networkMetricsEnabled').checked,
      healthReminder: $('healthReminder').checked,
      reminderInterval: Number.parseInt($('reminderInterval').value, 10),

      debugMode: $('debugMode').checked,
      sentryEnabled: $('sentryEnabled').checked,

      screenshotSound: $('screenshotSound').checked,
      screenshotNotification: $('screenshotNotification').checked,
      screenshotsDir: $('screenshotsDir').value,
      screenshotFormat: $('screenshotFormat').value,
      screenshotQuality: Number.parseInt($('screenshotQuality').value, 10),
    };

    await window.settingsAPI.updateSettings(updates);
    showStatus('Saved successfully.', 'success');
    await loadUpdateStatus();
  } catch (error) {
    showStatus(`Save failed: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function checkUpdatesNow() {
  try {
    await withLoading(
      $('checkUpdatesBtn'),
      async () => {
        showStatus('Checking for updates...', 'info');
        await window.settingsAPI.checkUpdatesNow();
        await loadUpdateStatus();
      },
      'Checking...'
    );
    showStatus('Update check finished.', 'success');
  } catch (error) {
    showStatus(`Update check failed: ${error.message}`, 'error');
  }
}

async function rollbackSelected() {
  const tag = $('releaseSelect').value;
  if (!tag) {
    showStatus('Select a release first.', 'error');
    return;
  }

  try {
    await withLoading(
      $('rollbackBtn'),
      () => window.settingsAPI.rollbackVersion(tag),
      'Opening...'
    );
    showStatus(`Opened release page for ${tag}.`, 'success');
  } catch (error) {
    showStatus(`Rollback failed: ${error.message}`, 'error');
  }
}

async function runSelectorHealth() {
  if (selectorHealthInFlight) return;
  selectorHealthInFlight = true;
  try {
    $('selectorHealthOutput').textContent = 'Running diagnostics...';
    const result = await withLoading(
      $('runSelectorHealthBtn'),
      () => window.settingsAPI.checkSelectorHealth(),
      'Checking...'
    );
    $('selectorHealthOutput').classList.remove('enter');
    void $('selectorHealthOutput').offsetWidth; // force reflow so the entrance animation restarts
    $('selectorHealthOutput').classList.add('enter');
    $('selectorHealthOutput').textContent = formatSelectorHealth(result);
    if (result?.invalid > 0) {
      showStatus(`Selector check found ${result.invalid} invalid selector(s).`, 'error');
    } else {
      showStatus('Selector check passed.', 'success');
    }
  } catch (error) {
    $('selectorHealthOutput').textContent = `Error: ${error.message}`;
    showStatus(`Selector check failed: ${error.message}`, 'error');
  } finally {
    selectorHealthInFlight = false;
  }
}

async function exportSelectorHealth() {
  try {
    const path = await window.settingsAPI.exportSelectorHealth();
    if (path) {
      showStatus(`Selector report exported: ${path}`, 'success');
    }
  } catch (error) {
    showStatus(`Export failed: ${error.message}`, 'error');
  }
}

const EDGE_SHADOW_CSS = {
  none: 'none',
  dropshadow: '1px 1px 3px rgba(0,0,0,0.9)',
  raised: '1px 1px 2px rgba(0,0,0,0.9), 2px 2px 4px rgba(0,0,0,0.9)',
  outline:
    '-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9)',
};

function hexToRgba(hex, alphaPercent) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!match) return `rgba(0,0,0,${alphaPercent / 100})`;
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alphaPercent / 100})`;
}

const SUBTITLE_FONT_PX = { small: 14, medium: 18, large: 22, xlarge: 27 };
const SUBTITLE_FONT_STACK = {
  default: 'inherit',
  sans: '"Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  monospace: '"Courier New", Consolas, monospace',
};

function updateSubtitlePreview() {
  const opacity = Number($('subtitleBackgroundOpacity').value) || 0;
  const offset = Number($('subtitleVerticalOffset').value) || 0;
  $('subtitleBackgroundOpacityValue').textContent = `${opacity}%`;
  $('subtitleVerticalOffsetValue').textContent = `${offset}px`;

  const enabled = $('subtitleCustomizationEnabled').checked;
  const stage = $('subtitlePreviewStage');
  const text = $('subtitlePreviewText');
  const inner = $('subtitlePreviewInner');

  stage.style.opacity = enabled ? '1' : '0.4';
  text.style.bottom = `${10 + offset / 3}px`;
  inner.style.fontSize = `${SUBTITLE_FONT_PX[$('subtitleFontSize').value] || 18}px`;
  inner.style.color = $('subtitleTextColor').value;
  inner.style.fontFamily = SUBTITLE_FONT_STACK[$('subtitleFontFamily').value] || 'inherit';
  inner.style.textShadow = EDGE_STYLE_OR_NONE();
  inner.style.backgroundColor = hexToRgba($('subtitleBackgroundColor').value, opacity);
  inner.style.padding = '2px 8px';
  inner.style.borderRadius = '3px';

  function EDGE_STYLE_OR_NONE() {
    return EDGE_SHADOW_CSS[$('subtitleEdgeStyle').value] || 'none';
  }
}

async function reapplySubtitleStyle() {
  try {
    await withLoading(
      $('reapplySubtitleBtn'),
      () => window.settingsAPI.reapplySubtitleStyle(),
      'Applying...'
    );
    showStatus('Subtitle style re-applied to the main window.', 'success');
  } catch (error) {
    showStatus(`Could not re-apply subtitle style: ${error.message}`, 'error');
  }
}

async function checkSubtitleSelectors() {
  const output = $('subtitleSelectorOutput');
  output.classList.remove('enter');
  void output.offsetWidth; // force reflow so the entrance animation restarts every call
  output.style.display = 'block';
  output.classList.add('enter');
  output.textContent = 'Checking...';
  try {
    const result = await withLoading(
      $('checkSubtitleSelectorsBtn'),
      () => window.settingsAPI.checkSubtitleSelectors(),
      'Checking...'
    );
    if (!result) {
      output.textContent = 'No main window available to check.';
      return;
    }
    if (result.error) {
      output.textContent = `Error: ${result.error}`;
      return;
    }
    output.textContent = [
      `Container elements found: ${result.containerFound}`,
      `Subtitle text elements found: ${result.textContainerFound}`,
      '',
      result.note,
    ].join('\n');
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
  }
}

async function restoreSessionNow() {
  try {
    const restored = await window.settingsAPI.restoreSessionNow();
    showStatus(
      restored ? 'Session restored.' : 'No restorable session found.',
      restored ? 'success' : 'info'
    );
  } catch (error) {
    showStatus(`Restore failed: ${error.message}`, 'error');
  }
}

async function clearSafeModeState() {
  try {
    await window.settingsAPI.exitSafeMode();
    await loadSettings();
    showStatus('Safe mode state cleared.', 'success');
  } catch (error) {
    showStatus(`Could not clear safe mode state: ${error.message}`, 'error');
  }
}

async function chooseDir() {
  try {
    const dir = await window.settingsAPI.chooseScreenshotDir();
    if (dir) $('screenshotsDir').value = dir;
  } catch (error) {
    showStatus(`Folder selection failed: ${error.message}`, 'error');
  }
}

function updateScreenshotQualityVisibility() {
  const isJpeg = $('screenshotFormat').value === 'jpg';
  $('screenshotQualityRow').style.display = isJpeg ? 'flex' : 'none';
  $('screenshotQualityValue').textContent = $('screenshotQuality').value;
}

async function exportSettings() {
  try {
    const path = await window.settingsAPI.exportSettings();
    if (path) showStatus(`Settings exported: ${path}`, 'success');
  } catch (error) {
    showStatus(`Export failed: ${error.message}`, 'error');
  }
}

async function importSettings() {
  if (!window.confirm('Import will overwrite current settings. Continue?')) return;

  try {
    const success = await window.settingsAPI.importSettings();
    if (success) {
      await loadSettings();
      showStatus('Settings imported.', 'success');
    }
  } catch (error) {
    showStatus(`Import failed: ${error.message}`, 'error');
  }
}

function bindEvents() {
  $('chooseDir').addEventListener('click', chooseDir);
  $('screenshotFormat').addEventListener('change', updateScreenshotQualityVisibility);
  $('screenshotQuality').addEventListener('input', updateScreenshotQualityVisibility);
  $('saveBtn').addEventListener('click', saveSettings);
  $('cancelBtn').addEventListener('click', () => window.close());
  $('exportBtn').addEventListener('click', exportSettings);
  $('importBtn').addEventListener('click', importSettings);

  $('runSelectorHealthBtn').addEventListener('click', runSelectorHealth);
  $('exportSelectorHealthBtn').addEventListener('click', exportSelectorHealth);

  $('checkUpdatesBtn').addEventListener('click', checkUpdatesNow);
  $('refreshReleasesBtn').addEventListener('click', () => loadReleaseList(true));
  $('rollbackBtn').addEventListener('click', rollbackSelected);

  $('restoreSessionNowBtn').addEventListener('click', restoreSessionNow);
  $('exitSafeModeBtn').addEventListener('click', clearSafeModeState);

  $('reapplySubtitleBtn').addEventListener('click', reapplySubtitleStyle);
  $('checkSubtitleSelectorsBtn').addEventListener('click', checkSubtitleSelectors);

  const subtitleInputs = [
    'subtitleCustomizationEnabled',
    'subtitleFontSize',
    'subtitleFontFamily',
    'subtitleTextColor',
    'subtitleBackgroundColor',
    'subtitleBackgroundOpacity',
    'subtitleEdgeStyle',
    'subtitleVerticalOffset',
  ];
  subtitleInputs.forEach((id) => {
    $(id).addEventListener('input', updateSubtitlePreview);
    $(id).addEventListener('change', updateSubtitlePreview);
  });
}

function init() {
  if (!window.settingsAPI) {
    document.body.innerHTML =
      '<div style="padding:16px">Settings API unavailable. Restart the app.</div>';
    return;
  }

  bindEvents();
  loadSettings().catch((error) => {
    showStatus(`Failed to load settings: ${error.message}`, 'error');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
