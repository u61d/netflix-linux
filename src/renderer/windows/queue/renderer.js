const { queueAPI } = window;
let queue = [];
let dragItemId = null;

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function showStatus(message, type = 'success') {
  const el = document.getElementById('status');
  el.className = `status ${type}`;
  el.textContent = message;
  setTimeout(() => {
    if (el.textContent === message) el.textContent = '';
  }, 3000);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function render(items) {
  const container = document.getElementById('queueContainer');
  if (!items.length) {
    container.innerHTML = `
            <div class="empty">
              <p>Queue is empty.</p>
              <div>Use the hover-card queue button or the queue shortcut while browsing Netflix.</div>
            </div>
          `;
    return;
  }

  container.innerHTML = items
    .map((item, index) => {
      const pinned = item.pinned ? 'Pinned' : 'Normal';
      return `
              <div class="queue-item" draggable="true" data-index="${index}" data-id="${escapeHtml(item.id)}" data-pinned="${item.pinned ? 'true' : 'false'}">
                <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
                <div class="queue-item-info">
                  <div class="title">${escapeHtml(item.title || 'Unknown Title')}</div>
                  <div class="metadata">
                    <span>Added ${formatDate(item.addedAt)}</span>
                    <span>Last played ${formatDate(item.lastPlayedAt)}</span>
                    <span>${pinned}</span>
                  </div>
                </div>
                <div class="item-actions">
                  <button class="secondary" type="button" data-action="pin">${item.pinned ? 'Unpin' : 'Pin'}</button>
                  <button class="secondary" type="button" data-action="play">Play</button>
                  <button class="secondary" type="button" data-action="remove">Remove</button>
                </div>
              </div>
            `;
    })
    .join('');

  attachDragAndDrop();
}

function attachDragAndDrop() {
  const nodes = document.querySelectorAll('.queue-item');
  nodes.forEach((node) => {
    node.addEventListener('dragstart', () => {
      dragItemId = node.dataset.id || null;
      node.classList.add('dragging');
    });

    node.addEventListener('dragend', () => {
      dragItemId = null;
      node.classList.remove('dragging');
      node.classList.remove('drag-over');
    });

    node.addEventListener('dragover', (event) => {
      event.preventDefault();
      node.classList.add('drag-over');
    });

    node.addEventListener('dragleave', () => {
      node.classList.remove('drag-over');
    });

    node.addEventListener('drop', async (event) => {
      event.preventDefault();
      node.classList.remove('drag-over');
      const toId = node.dataset.id || null;
      if (!dragItemId || !toId || dragItemId === toId) return;

      const fromIndex = queue.findIndex((entry) => entry.id === dragItemId);
      const toIndex = queue.findIndex((entry) => entry.id === toId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

      try {
        await queueAPI.reorderQueue(fromIndex, toIndex);
        await loadQueue();
        showStatus('Queue reordered');
      } catch (error) {
        showStatus(`Reorder failed: ${error.message}`, 'error');
      }
    });
  });
}

async function loadQueue() {
  try {
    queue = await queueAPI.getQueue();
    applyFilter();
  } catch (error) {
    showStatus(`Load failed: ${error.message}`, 'error');
    document.getElementById('queueContainer').innerHTML =
      '<div class="empty">Failed to load queue.</div>';
  }
}

function applyFilter() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!query) {
    render(queue);
    return;
  }
  render(
    queue.filter((entry) => `${entry.title || ''} ${entry.url || ''}`.toLowerCase().includes(query))
  );
}

async function removeItem(id) {
  try {
    await queueAPI.removeFromQueue(id);
    await loadQueue();
    showStatus('Item removed');
  } catch (error) {
    showStatus(`Remove failed: ${error.message}`, 'error');
  }
}

async function togglePin(id, pinned) {
  try {
    await queueAPI.pinItem(id, pinned);
    await loadQueue();
    showStatus(pinned ? 'Item pinned' : 'Item unpinned');
  } catch (error) {
    showStatus(`Pin failed: ${error.message}`, 'error');
  }
}

async function playItem(id) {
  try {
    const item = await queueAPI.playNext(id);
    if (item) {
      showStatus(`Playing: ${item.title}`);
      await loadQueue();
    }
  } catch (error) {
    showStatus(`Play failed: ${error.message}`, 'error');
  }
}

async function playNext() {
  try {
    const item = await queueAPI.playNext();
    if (!item) {
      showStatus('Queue is empty', 'error');
      return;
    }
    showStatus(`Playing: ${item.title}`);
    await loadQueue();
  } catch (error) {
    showStatus(`Play next failed: ${error.message}`, 'error');
  }
}

async function clearQueue() {
  if (!confirm('Clear the entire queue?')) return;
  try {
    await queueAPI.clearQueue();
    await loadQueue();
    showStatus('Queue cleared');
  } catch (error) {
    showStatus(`Clear failed: ${error.message}`, 'error');
  }
}

async function dedupeQueue() {
  try {
    const result = await queueAPI.dedupeQueue();
    await loadQueue();
    showStatus(`Removed ${result.removed || 0} duplicate item(s)`);
  } catch (error) {
    showStatus(`Dedupe failed: ${error.message}`, 'error');
  }
}

document.getElementById('searchInput').addEventListener('input', applyFilter);
document.getElementById('playNextBtn').addEventListener('click', playNext);
document.getElementById('clearBtn').addEventListener('click', clearQueue);
document.getElementById('dedupeBtn').addEventListener('click', dedupeQueue);

document.getElementById('queueContainer').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;

  const itemNode = button.closest('.queue-item');
  if (!itemNode) return;

  const { id, pinned } = itemNode.dataset;
  switch (button.dataset.action) {
    case 'pin':
      togglePin(id, pinned !== 'true');
      break;
    case 'play':
      playItem(id);
      break;
    case 'remove':
      removeItem(id);
      break;
  }
});

window.addEventListener('DOMContentLoaded', loadQueue);
