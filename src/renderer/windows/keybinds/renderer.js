console.log('[Keybinds] Script starting...');

let isInitialized = false;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 20;

function init() {
  if (isInitialized) return;

  initAttempts++;
  console.log(`[Keybinds] Checking for API... (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS})`);

  if (!window.keybindsAPI) {
    if (initAttempts >= MAX_INIT_ATTEMPTS) {
      console.error('[Keybinds] API failed to load');
      document.body.innerHTML = `
            <div style="padding: 20px; color: #f44336; text-align: center;">
              <h2>Failed to Load</h2>
              <p>Keyboard shortcuts interface could not initialize.</p>
              <button id="closeFallbackBtn" style="margin-top: 16px;">Close</button>
            </div>
          `;
      document.getElementById('closeFallbackBtn').addEventListener('click', () => window.close());
      return;
    }

    setTimeout(init, 100);
    return;
  }

  isInitialized = true;
  console.log('[Keybinds] API found!');

  const { keybindsAPI } = window;

  const actionLabels = {
    showStats: 'Show Stats',
    showHistory: 'Show History',
    showQueue: 'Show Queue',
    addCurrentToQueue: 'Add Current to Queue',
    openSettings: 'Open Settings',
    openKeybinds: 'Keybinds Window',
    openProfiles: 'Profiles Manager',
    toggleAlwaysOnTop: 'Toggle Always on Top',
    quit: 'Quit Application',
    screenshot: 'Take Screenshot',
    screenshotClipboard: 'Screenshot to Clipboard',
    pictureInPicture: 'Picture-in-Picture',
    speedIncrease: 'Increase Speed',
    speedDecrease: 'Decrease Speed',
    speedReset: 'Reset Speed to 1x',
    resetPlayback: 'Reset All Playback',
    toggleDetailedStats: 'Toggle Stats Overlay',
    exportHistory: 'Export Watch History',
  };

  let keybinds = {};
  let recording = null;

  async function loadKeybinds() {
    try {
      console.log('[Keybinds] Loading...');
      keybinds = await keybindsAPI.getKeybinds();
      console.log('[Keybinds] Got:', keybinds);

      const container = document.getElementById('keybindList');
      const errorEl = document.getElementById('errorMessage');
      errorEl.innerHTML = '';

      const html = Object.entries(actionLabels)
        .map(([action, label]) => {
          const currentKey = keybinds[action] || '';
          return `
              <div class="keybind-item enter">
                <div class="action-name">${label}</div>
                <input
                  type="text"
                  class="keybind-input"
                  id="key-${action}"
                  value="${currentKey}"
                  readonly
                  data-action="${action}"
                  placeholder="Click to set"
                />
                <button class="secondary clear-btn" data-action="${action}">Clear</button>
              </div>
            `;
        })
        .join('');

      container.innerHTML = html;

      document.querySelectorAll('.keybind-input').forEach((input) => {
        input.onclick = function () {
          startRecording(this.dataset.action);
        };
      });

      document.querySelectorAll('.clear-btn').forEach((btn) => {
        btn.onclick = function () {
          clearKeybind(this.dataset.action);
        };
      });

      console.log('[Keybinds] UI ready');
    } catch (e) {
      console.error('[Keybinds] Error:', e);
      document.getElementById('errorMessage').innerHTML = `
            <div class="error">⚠️ Failed: ${e.message}</div>
          `;
    }
  }

  function startRecording(action) {
    console.log('[Keybinds] Recording:', action);

    if (recording) {
      const oldInput = document.getElementById(`key-${recording}`);
      if (oldInput) {
        oldInput.classList.remove('recording');
        oldInput.value = keybinds[recording] || '';
      }
      document.removeEventListener('keydown', handleKeyPress);
    }

    recording = action;
    const input = document.getElementById(`key-${action}`);
    if (!input) return;

    input.classList.add('recording');
    input.value = 'Press keys...';

    document.addEventListener('keydown', handleKeyPress);
  }

  function handleKeyPress(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!recording) return;

    const modifiers = [];
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.metaKey) modifiers.push('Command');

    let key = e.key;

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;

    const keyMap = {
      ' ': 'Space',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Escape: 'Esc',
    };

    key = keyMap[key] || key.toUpperCase();
    const accelerator = [...modifiers, key].join('+');

    const input = document.getElementById(`key-${recording}`);
    if (input) {
      input.value = accelerator;
      input.classList.remove('recording');
    }

    keybinds[recording] = accelerator;

    document.removeEventListener('keydown', handleKeyPress);
    recording = null;
  }

  function clearKeybind(action) {
    keybinds[action] = '';
    const input = document.getElementById(`key-${action}`);
    if (input) input.value = '';
  }

  async function saveKeybinds() {
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      await keybindsAPI.saveKeybinds(keybinds);
      alert('✓ Saved! Restart the app.');
      window.close();
    } catch (e) {
      document.getElementById('errorMessage').innerHTML = `
            <div class="error">⚠️ ${e.message}</div>
          `;
      btn.disabled = false;
      btn.textContent = 'Save & Restart Required';
    }
  }

  async function resetAll() {
    if (!confirm('Reset all shortcuts?')) return;
    try {
      await keybindsAPI.resetKeybinds();
      await loadKeybinds();
      alert('✓ Reset!');
    } catch (e) {
      document.getElementById('errorMessage').innerHTML = `
            <div class="error">⚠️ ${e.message}</div>
          `;
    }
  }

  document.getElementById('resetBtn').onclick = resetAll;
  document.getElementById('saveBtn').onclick = saveKeybinds;
  document.getElementById('closeBtn').onclick = () => window.close();

  window.addEventListener('beforeunload', () => {
    if (recording) document.removeEventListener('keydown', handleKeyPress);
  });

  loadKeybinds();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
