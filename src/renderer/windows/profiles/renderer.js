const { profilesAPI } = window;

async function loadProfiles() {
  try {
    const { profiles, current } = await profilesAPI.getProfiles();
    const container = document.getElementById('profileList');

    container.innerHTML = Object.entries(profiles)
      .map(
        ([id, profile]) => `
          <div class="profile-item enter ${id === current ? 'active' : ''}">
            <div class="profile-info">
              <div class="profile-name">${profile.name} ${id === current ? '✓' : ''}</div>
              <div class="profile-url">${profile.url}</div>
            </div>
            ${id !== 'default' ? `<button class="danger" data-action="delete" data-id="${id}">Delete</button>` : ''}
            <button data-action="switch" data-id="${id}">${id === current ? 'Current' : 'Switch'}</button>
          </div>
        `
      )
      .join('');
  } catch (e) {
    alert('Failed to load profiles: ' + e.message);
  }
}

async function addProfile() {
  const name = document.getElementById('profileName').value.trim();
  const url = document.getElementById('profileUrl').value.trim();

  if (!name || name.length > 50) {
    alert('Profile name must be 1-50 characters');
    return;
  }

  try {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    await profilesAPI.addProfile({ id, name, url });

    document.getElementById('profileName').value = '';
    document.getElementById('profileUrl').value = 'https://www.netflix.com/';
    await loadProfiles();
  } catch (e) {
    alert('Failed to add profile: ' + e.message);
  }
}

async function deleteProfile(id) {
  if (!confirm('Delete this profile?')) return;

  try {
    await profilesAPI.deleteProfile(id);
    await loadProfiles();
  } catch (e) {
    alert('Failed to delete profile: ' + e.message);
  }
}

async function switchProfile(id) {
  try {
    await profilesAPI.switchProfile(id);
    await loadProfiles();
  } catch (e) {
    alert('Failed to switch profile: ' + e.message);
  }
}

window.addEventListener('DOMContentLoaded', loadProfiles);

document.getElementById('profileList').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === 'delete') deleteProfile(id);
  if (action === 'switch') switchProfile(id);
});

document.getElementById('addProfileBtn').addEventListener('click', addProfile);
document.getElementById('closeProfilesBtn').addEventListener('click', () => window.close());
