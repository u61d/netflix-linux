const $ = (id) => document.getElementById(id);

let client = null;
let selfId = null;

function showSetup(errorMessage) {
  $('partyView').style.display = 'none';
  $('setupView').style.display = 'block';

  if (errorMessage) {
    $('setupStatus').textContent = errorMessage;
    $('setupStatus').style.display = 'block';
  } else {
    $('setupStatus').style.display = 'none';
  }
}

function showParty(roomId, isHost) {
  $('setupView').style.display = 'none';
  $('partyView').style.display = 'block';
  $('roomCodeText').textContent = roomId;
  $('roomCodeRow').style.display = isHost ? 'flex' : 'none';
  $('chatLog').innerHTML = '';
  $('rosterList').innerHTML = '';
  setPartyStatus('');
}

function setPartyStatus(message) {
  const el = $('partyStatus');
  if (!message) {
    el.style.display = 'none';
    return;
  }
  el.textContent = message;
  el.style.display = 'block';
}

function renderRoster(roster) {
  const list = $('rosterList');
  list.innerHTML = '';

  roster.forEach(({ id, displayName }) => {
    const li = document.createElement('li');
    li.textContent = id === selfId ? `${displayName} (you)` : displayName;
    if (id === selfId) li.classList.add('self');
    list.appendChild(li);
  });
}

function appendChatMessage({ displayName, message, self, system }) {
  const log = $('chatLog');
  const row = document.createElement('div');
  row.className = ['chat-message', self && 'self', system && 'system'].filter(Boolean).join(' ');

  if (!system) {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${displayName || 'Guest'}:`;
    row.appendChild(who);
  }

  const text = document.createElement('span');
  text.textContent = message;
  row.appendChild(text);

  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function wireClientEvents() {
  client.on('roster-changed', renderRoster);

  client.on('chat', (msg) => appendChatMessage(msg));

  client.on('remote-playback', (payload) => {
    window.watchPartyAPI.applyRemoteCommand(payload.action, payload);
  });

  client.on('sync-response', (payload) => {
    if (typeof payload.currentTime !== 'number') return;
    window.watchPartyAPI.applyRemoteCommand(payload.playing ? 'play' : 'pause', payload);
  });

  client.on('party-ended', () => {
    appendChatMessage({
      message: 'The host left and no one could take over. Party ended.',
      system: true,
    });
    setTimeout(() => leaveParty(), 1500);
  });

  client.on('migrating', ({ iAmNewHost }) => {
    setPartyStatus(
      iAmNewHost ? 'Host left — taking over as host...' : 'Host left — reconnecting...'
    );
    appendChatMessage({ message: 'Host disconnected, reconnecting...', system: true });
  });

  client.on('migration-complete', ({ isHost, roomId }) => {
    selfId = client.peer.id;
    $('roomCodeText').textContent = roomId;
    $('roomCodeRow').style.display = isHost ? 'flex' : 'none';
    setPartyStatus('');
    appendChatMessage({
      message: isHost ? 'You are now hosting.' : 'Reconnected.',
      system: true,
    });

    if (isHost) {
      window.watchPartyAPI.getCurrentState().then((state) => {
        if (!state) return;
        client.sendPlaybackEvent(state.playing ? 'play' : 'pause', state);
      });
    }
  });

  client.on('error', (err) => {
    setPartyStatus(`Connection issue: ${err?.message || err}`);
  });
}

async function saveDisplayName() {
  const raw = $('displayNameInput').value.trim();
  const name = await window.watchPartyAPI.setDisplayName(raw || 'Guest');
  $('displayNameInput').value = name;
  return name || 'Guest';
}

async function startHosting() {
  const displayName = await saveDisplayName();
  client = new window.WatchPartyClient(window.Peer, { displayName });
  wireClientEvents();

  try {
    const roomId = await client.hostRoom();
    selfId = roomId;
    showParty(roomId, true);
    window.watchPartyAPI.setActive(true);
  } catch (err) {
    showSetup(`Could not start hosting: ${err?.message || err}`);
    client = null;
  }
}

async function joinParty() {
  const code = $('joinCodeInput').value;
  if (!window.WatchPartyClient.normalizeRoomId(code)) {
    showSetup('Enter a room code');
    return;
  }

  const displayName = await saveDisplayName();
  client = new window.WatchPartyClient(window.Peer, { displayName });
  wireClientEvents();

  try {
    const roomId = await client.joinRoom(code);
    selfId = client.peer.id;
    showParty(roomId, false);
    window.watchPartyAPI.setActive(true);
    appendChatMessage({ message: `Connected to ${roomId}`, system: true });
  } catch (err) {
    showSetup(`Could not join: ${err?.message || err}`);
    client = null;
  }
}

function leaveParty() {
  window.watchPartyAPI.setActive(false);
  if (client) {
    client.leave();
    client = null;
  }
  selfId = null;
  showSetup();
}

function sendChat() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || !client) return;
  client.sendChat(text);
  input.value = '';
}

async function init() {
  const name = await window.watchPartyAPI.getDisplayName();
  if (name) $('displayNameInput').value = name;

  window.watchPartyAPI.onLocalEvent((data) => {
    if (!client) return;
    client.sendPlaybackEvent(data.action, {
      currentTime: data.currentTime,
      title: data.title,
      url: data.url,
    });
  });

  $('hostBtn').addEventListener('click', startHosting);
  $('joinBtn').addEventListener('click', joinParty);
  $('leaveBtn').addEventListener('click', leaveParty);
  $('sendChatBtn').addEventListener('click', sendChat);
  $('copyCodeBtn').addEventListener('click', () => {
    window.watchPartyAPI.copyText($('roomCodeText').textContent);
  });

  $('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
  $('joinCodeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinParty();
  });

  window.addEventListener('beforeunload', () => {
    window.watchPartyAPI.setActive(false);
    client?.leave();
  });
}

window.addEventListener('DOMContentLoaded', init);
