/* BotBrowser Control — Renderer */
'use strict';

(function () {
  // ─── State ──────────────────────────────────────────────────────────────────
  let profiles = [];
  let runningSessions = [];
  let currentView = 'profiles';
  let editingProfileId = null;
  let searchQuery = '';
  let selectedProfileIds = new Set();
  let settings = {};
  const IS_WIN = window.api.platform === 'win32';
  const IS_MAC = window.api.platform === 'darwin';

  // Kernel manager state
  let kernelReleases = null;
  let kernelInstalled = [];
  let kernelDownloads = {}; // version -> { progress, status }

  // IP check state
  let ipCheckResults = {}; // profileId -> result
  let ipCheckLoading = {}; // profileId -> bool

  // Quick proxy popover state
  let quickProxyProfileId = null;

  // ─── Icons ──────────────────────────────────────────────────────────────────
  const I = {
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>',
    profile: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
    session: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-5 14H4v-4h11v4zm0-5H4V9h11v4zm5 5h-4V9h4v9z"/></svg>',
    shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>',
    network: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>',
    cpu: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3H7v2H5v2H3v2h2v2H3v2h2v2H3v2h2v2h2v2h2v-2h2v2h2v-2h2v2h2v-2h2v-2h2v-2h-2v-2h2v-2h-2v-2h2V9h-2V7h-2V5h-2V3h-2v2h-2V3zm0 4h6v6H9V7z"/></svg>',
    zap: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>',
    user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
    cookie: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-.34-.02-.67-.05-1H21c-.34 0-.67-.01-1-.05V10c-.39-.04-.77-.1-1.15-.18L17 8.07V6.5C17 4.57 15.43 3 13.5 3c-.18 0-.36.01-.53.03C12.68 2.04 12.35 2 12 2z"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>',
    folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
    globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
    info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
    kernel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
    proxy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
    android: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.341A5.98 5.98 0 0 0 18 13a5.98 5.98 0 0 0-.477-2.341l2.21-2.21a9.01 9.01 0 0 1 0 9.102l-2.21-2.21zM13 5.523A5.98 5.98 0 0 0 10.659 5l-2.21-2.21a9.01 9.01 0 0 1 9.102 0L15.341 5A5.98 5.98 0 0 0 13 5.523zM8.659 5L6.448 2.79a9.01 9.01 0 0 0-4.239 8.551A9.01 9.01 0 0 0 6.449 19.21L8.659 17A6 6 0 0 1 8 13a6 6 0 0 1 .659-6zM13 20.477A5.98 5.98 0 0 0 15.341 21l2.21 2.21a9.01 9.01 0 0 1-9.102 0L10.659 21A5.98 5.98 0 0 0 13 20.477zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
    use: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function esc(s) { return String(s||'').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"'); }
  function el(id) { return document.getElementById(id); }
  function val(id) { const e = el(id); return e ? e.value.trim() : ''; }
  function chk(id) { const e = el(id); return e ? e.checked : false; }
  function selVal(id) { const e = el(id); return e ? e.value : ''; }

  function timeAgo(iso) {
    if (!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }

  function showToast(msg, type = 'info', duration = 3500) {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, duration);
  }

  // ─── Init ────────────────────────────────────────────────────────────────────
  async function init() {
    settings = await window.api.settings.get();
    await loadProfiles();
    await refreshRunningSessions();
    render();
    bindNav();
    bindEvents();
  }

  async function loadProfiles() {
    profiles = await window.api.profiles.getAll();
  }

  async function refreshRunningSessions() {
    runningSessions = await window.api.browser.getRunning();
  }

  // ─── Navigation ──────────────────────────────────────────────────────────────
  function bindNav() {
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentView = btn.dataset.nav;
        selectedProfileIds.clear();
        render();
      });
    });
    window.api.on('navigate', (view) => { currentView = view; render(); });
    window.api.on('action', (action) => { if (action === 'new-profile') openProfileEditor(null); });
  }

  // ─── Event Delegation ────────────────────────────────────────────────────────
  function bindEvents() {
    document.addEventListener('click', (e) => {
      // Close context menus
      if (!e.target.closest('.context-menu')) {
        document.querySelectorAll('.context-menu').forEach(m => m.remove());
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const data = { ...btn.dataset };
      handleAction(action, data, e);
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'search-input') {
        searchQuery = e.target.value.toLowerCase();
        renderProfiles();
      }
      if (e.target.dataset.action === 'select-profile') {
        const id = e.target.dataset.id;
        if (e.target.checked) selectedProfileIds.add(id);
        else selectedProfileIds.delete(id);
        updateBulkBar();
      }
      if (e.target.id === 'select-all-profiles') {
        const visible = getVisibleProfiles();
        if (e.target.checked) visible.forEach(p => selectedProfileIds.add(p.id));
        else selectedProfileIds.clear();
        renderProfiles();
        updateBulkBar();
      }
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'search-input') {
        searchQuery = e.target.value.toLowerCase();
        renderProfiles();
      }
    });

    // IPC events
    window.api.on('instance:started', ({ profileId }) => {
      const p = profiles.find(x => x.id === profileId);
      if (p) { p.status = 'running'; }
      refreshRunningSessions().then(() => renderView());
    });
    window.api.on('instance:stopped', ({ profileId }) => {
      const p = profiles.find(x => x.id === profileId);
      if (p) { p.status = 'stopped'; }
      refreshRunningSessions().then(() => renderView());
    });
    window.api.on('instance:error', ({ profileId, error }) => {
      showToast(`Error: ${error}`, 'error', 5000);
      const p = profiles.find(x => x.id === profileId);
      if (p) p.status = 'stopped';
      refreshRunningSessions().then(() => renderView());
    });
    window.api.on('profile:statusChanged', ({ profileId, status }) => {
      const p = profiles.find(x => x.id === profileId);
      if (p) p.status = status;
      renderView();
    });
    window.api.on('profile:cookiesSaved', ({ profileId, count, path: cookiePath }) => {
      const p = profiles.find(x => x.id === profileId);
      if (p) { p.savedCookiesPath = cookiePath; p.cookieCount = count; p.cookiesSavedAt = new Date().toISOString(); }
      showToast(`${count} cookies saved for profile`, 'success');
      renderView();
    });

    // Kernel download events
    window.api.on('kernel:downloadProgress', ({ version, progress }) => {
      kernelDownloads[version] = { ...(kernelDownloads[version] || {}), progress, status: 'downloading' };
      updateKernelProgressUI(version, progress);
    });
    window.api.on('kernel:downloadComplete', ({ version }) => {
      kernelDownloads[version] = { progress: 100, status: 'done' };
      showToast(`Kernel ${version} downloaded.`, 'success');
      window.api.kernel.listInstalled().then(list => {
        kernelInstalled = list;
        if (currentView === 'settings') renderSettings();
      });
    });
  }

  function handleAction(action, data, e) {
    switch (action) {
      case 'launch-profile':    launchProfile(data.id); break;
      case 'stop-profile':      stopProfile(data.id); break;
      case 'stop-all':          stopAll(); break;
      case 'edit-profile':      openProfileEditor(data.id); break;
      case 'duplicate-profile': duplicateProfile(data.id); break;
      case 'delete-profile':    deleteProfile(data.id); break;
      case 'new-profile':       openProfileEditor(null); break;
      case 'save-profile':      saveProfile(); break;
      case 'cancel-edit':       closeProfileEditor(); break;
      case 'show-context':      showContextMenu(data.id, e); break;
      case 'delete-selected':   deleteSelected(); break;
      case 'clear-selection':   clearSelection(); break;
      case 'browse-file':       browseFile(data.target, data.filter); break;
      case 'browse-dir':        browseDir(data.target); break;
      case 'save-settings':     saveSettings(); break;
      case 'browse-exe':        browseExe(); break;
      case 'browse-userdata':   browseUserData(); break;
      case 'tab-switch':        switchTab(data.tab); break;
      case 'add-header':        addCustomHeader(); break;
      case 'remove-header':     removeCustomHeader(data.key); break;
      // IP check
      case 'check-ip':          checkProfileIp(data.id); break;
      // Quick proxy
      case 'quick-proxy':       openQuickProxy(data.id, e); break;
      case 'save-quick-proxy':  saveQuickProxy(data.id); break;
      case 'close-quick-proxy': closeQuickProxy(); break;
      // Kernel manager
      case 'kernel-refresh':    fetchKernelReleases(true); break;
      case 'kernel-download':   downloadKernel(data.version, data.url, data.filename); break;
      case 'kernel-delete':     deleteKernel(data.version); break;
      case 'kernel-use':        useKernelPath(data.execpath); break;
      case 'kernel-open-dir':   window.api.shell.openPath(data.dir); break;
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  function render() {
    updateNavActive();
    renderView();
  }

  function renderView() {
    const main = el('main-content');
    if (!main) return;
    if (currentView === 'profiles') renderProfiles();
    else if (currentView === 'sessions') renderSessions();
    else if (currentView === 'settings') renderSettings();
  }

  function updateNavActive() {
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === currentView);
    });
  }

  function getVisibleProfiles() {
    if (!searchQuery) return profiles;
    return profiles.filter(p =>
      (p.name||'').toLowerCase().includes(searchQuery) ||
      (p.proxyServer||'').toLowerCase().includes(searchQuery) ||
      (p.browserBrand||'').toLowerCase().includes(searchQuery) ||
      (p.startUrl||'').toLowerCase().includes(searchQuery)
    );
  }

  function updateBulkBar() {
    const bar = el('bulk-action-bar');
    if (!bar) return;
    if (selectedProfileIds.size > 0) {
      bar.style.display = 'flex';
      const countEl = bar.querySelector('.bulk-count');
      if (countEl) countEl.textContent = `${selectedProfileIds.size} selected`;
    } else {
      bar.style.display = 'none';
    }
  }

  function renderProfiles() {
    const main = el('main-content');
    if (!main) return;
    const visible = getVisibleProfiles();
    const allSelected = visible.length > 0 && visible.every(p => selectedProfileIds.has(p.id));
    const runningSet = new Set(runningSessions.map(s => s.profileId));

    // Brand → avatar gradient + label
    const brandMeta = {
      chrome:   { bg: 'linear-gradient(135deg,#4285f4,#34a853)', label: 'Ch' },
      edge:     { bg: 'linear-gradient(135deg,#0078d4,#00bcf2)', label: 'Ed' },
      brave:    { bg: 'linear-gradient(135deg,#fb542b,#ff7f4d)', label: 'Br' },
      opera:    { bg: 'linear-gradient(135deg,#cc0f16,#ff4444)', label: 'Op' },
      firefox:  { bg: 'linear-gradient(135deg,#ff9500,#ff6611)', label: 'Fx' },
      chromium: { bg: 'linear-gradient(135deg,#6366f1,#8b5cf6)', label: 'Cr' },
      webview:  { bg: 'linear-gradient(135deg,#10b981,#059669)', label: 'Wv' },
    };

    // Update sidebar stats
    const statP = el('stat-profiles'); if (statP) statP.textContent = profiles.length;
    const statR = el('stat-running'); if (statR) statR.textContent = runningSessions.length;
    const statInd = el('stat-indicator'); if (statInd) statInd.classList.toggle('running', runningSessions.length > 0);
    const badgeP = el('badge-profiles'); if (badgeP) badgeP.textContent = profiles.length || '';
    const badgeS = el('badge-sessions'); if (badgeS) { badgeS.textContent = runningSessions.length || ''; badgeS.style.display = runningSessions.length ? '' : 'none'; }

    main.innerHTML = `
      <div class="view-header">
        <div class="view-header-left">
          <div class="view-title-icon">${I.profile}</div>
          <h1 class="view-title">Profiles</h1>
          <span class="profile-count-pill">${profiles.length}</span>
        </div>
        <div class="view-header-right">
          <div class="search-wrap">
            <input class="search-input" id="search-input" placeholder="Search profiles…" value="${esc(searchQuery)}">
          </div>
          <button class="btn btn-primary btn-sm" data-action="new-profile">${I.plus} New Profile</button>
        </div>
      </div>

      ${selectedProfileIds.size > 0 ? `
      <div id="bulk-action-bar" class="bulk-action-bar">
        <span class="bulk-count">${selectedProfileIds.size} selected</span>
        <button class="btn btn-danger btn-sm" data-action="delete-selected">${I.trash} Delete Selected</button>
        <button class="btn btn-ghost btn-sm" data-action="clear-selection">✕ Clear</button>
      </div>` : `<div id="bulk-action-bar" class="bulk-action-bar" style="display:none"></div>`}

      ${visible.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">${I.profile}</div>
          ${profiles.length === 0
            ? `<h3>No profiles yet</h3><p>Create your first browser profile to get started.</p>
               <button class="btn btn-primary" data-action="new-profile">${I.plus} Create Profile</button>`
            : `<h3>No results</h3><p>No profiles match your search query.</p>`
          }
        </div>` : `
        <div class="profiles-table-wrap">
          <div class="profiles-col-header">
            <div class="col-hdr">
              <label class="checkbox-wrap" title="Select all">
                <input type="checkbox" id="select-all-profiles" ${allSelected ? 'checked' : ''}>
                <span class="checkmark"></span>
              </label>
            </div>
            <div class="col-hdr"></div>
            <div class="col-hdr">Profile</div>
            <div class="col-hdr">Proxy</div>
            <div class="col-hdr">Tags</div>
            <div class="col-hdr">Status</div>
            <div class="col-hdr" style="text-align:right">Actions</div>
          </div>
          ${visible.map(profile => {
            const isRunning = runningSet.has(profile.id) || profile.status === 'running';
            const isSelected = selectedProfileIds.has(profile.id);
            const brandKey = (profile.browserBrand || '').toLowerCase();
            const bm = brandMeta[brandKey] || { bg: 'linear-gradient(135deg,#6366f1,#8b5cf6)', label: (profile.name || 'P').charAt(0).toUpperCase() };
            const letter = profile.browserBrand ? bm.label : (profile.name || 'P').charAt(0).toUpperCase();
            const proxyHost = profile.proxyServer
              ? profile.proxyServer.replace(/^[a-z]+:\/\/[^@]+@/, '').replace(/^[a-z]+:\/\//, '')
              : '';
            const brandTagClass = brandKey === 'firefox' ? 'tag-firefox' : 'tag-chrome';
            return `
            <div class="profile-card${isRunning ? ' running' : ''}${isSelected ? ' selected' : ''}" data-profile-id="${profile.id}">
              <div class="profile-cell">
                <label class="checkbox-wrap">
                  <input type="checkbox" data-action="select-profile" data-id="${profile.id}" ${isSelected ? 'checked' : ''}>
                  <span class="checkmark"></span>
                </label>
              </div>
              <div class="profile-cell" style="padding:0 4px">
                <div class="profile-avatar" style="background:${bm.bg}">${letter}</div>
              </div>
              <div class="profile-identity">
                <div class="profile-name-wrap">
                  <div class="profile-name">${esc(profile.name || 'Unnamed')}</div>
                  <div class="profile-sub">
                    ${profile.startUrl
                      ? `${I.globe}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${esc(profile.startUrl)}</span>`
                      : `<span style="color:var(--text-3)">No start URL</span>`
                    }
                    ${profile.cookieCount
                      ? `<span style="color:var(--warning)">${I.cookie} ${profile.cookieCount}${profile.cookiesSavedAt ? ' · ' + timeAgo(profile.cookiesSavedAt) : ''}</span>`
                      : ''
                    }
                  </div>
                </div>
              </div>
              <div class="profile-cell">
                ${proxyHost
                  ? `<span class="profile-tag tag-proxy" title="${esc(proxyHost)}">${I.globe} ${esc(proxyHost)}</span>`
                  : `<span style="color:var(--text-3);font-size:11px">—</span>`
                }
              </div>
              <div class="profile-cell" style="gap:3px;flex-wrap:nowrap">
                ${profile.browserBrand
                  ? `<span class="profile-tag ${brandTagClass}">${profile.browserBrand.charAt(0).toUpperCase() + profile.browserBrand.slice(1)}</span>`
                  : ''
                }
                ${profile.profileFilePath ? `<span class="profile-tag">.enc</span>` : ''}
                ${profile.remoteDebuggingPort ? `<span class="profile-tag tag-chrome">CDP</span>` : ''}
              </div>
              <div class="profile-cell">
                <span class="status-pill ${isRunning ? 'running' : 'idle'}">
                  <span class="status-pill-dot"></span>
                  ${isRunning ? 'Running' : 'Idle'}
                </span>
              </div>
              <div class="profile-cell profile-actions" style="opacity:1;justify-content:flex-end;gap:2px">
                ${isRunning
                  ? `<button class="btn btn-danger btn-sm" data-action="stop-profile" data-id="${profile.id}">${I.stop} Stop</button>`
                  : `<button class="btn btn-primary btn-sm" data-action="launch-profile" data-id="${profile.id}">${I.play} Launch</button>`
                }
                ${profile.proxyServer ? `<button class="btn btn-secondary btn-sm btn-icon" data-action="quick-proxy" data-id="${profile.id}" title="Change proxy">${I.proxy}</button>` : `<button class="btn btn-ghost btn-sm btn-icon" data-action="quick-proxy" data-id="${profile.id}" title="Set proxy">${I.proxy}</button>`}
                ${profile.proxyServer ? `<button class="btn btn-secondary btn-sm btn-icon${ipCheckLoading[profile.id] ? ' loading' : ''}" data-action="check-ip" data-id="${profile.id}" title="Check IP">${ipCheckLoading[profile.id] ? '<span class="spin">⟳</span>' : I.globe}</button>` : ''}
                <button class="btn btn-secondary btn-sm btn-icon" data-action="edit-profile" data-id="${profile.id}" title="Edit">${I.edit}</button>
                <button class="btn btn-secondary btn-sm btn-icon" data-action="duplicate-profile" data-id="${profile.id}" title="Duplicate">${I.copy}</button>
                <button class="btn btn-danger btn-sm btn-icon" data-action="delete-profile" data-id="${profile.id}" title="Delete">${I.trash}</button>
                <button class="btn btn-ghost btn-sm btn-icon" data-action="show-context" data-id="${profile.id}" title="More">⋮</button>
              </div>
              ${ipCheckResults[profile.id] ? renderIpBadge(profile.id) : ''}
            </div>`;
          }).join('')}
        </div>`}
    `;
  }

  function renderSessions() {
    const main = el('main-content');
    if (!main) return;

    // Update sidebar stats
    const statP = el('stat-profiles'); if (statP) statP.textContent = profiles.length;
    const statR = el('stat-running'); if (statR) statR.textContent = runningSessions.length;
    const statInd = el('stat-indicator'); if (statInd) statInd.classList.toggle('running', runningSessions.length > 0);
    const badgeS = el('badge-sessions'); if (badgeS) { badgeS.textContent = runningSessions.length || ''; badgeS.style.display = runningSessions.length ? '' : 'none'; }

    main.innerHTML = `
      <div class="view-header">
        <div class="view-header-left">
          <div class="view-title-icon">${I.session}</div>
          <h1 class="view-title">Running Sessions</h1>
          <span class="profile-count-pill">${runningSessions.length}</span>
        </div>
        <div class="view-header-right">
          ${runningSessions.length > 0 ? `<button class="btn btn-danger btn-sm" data-action="stop-all">${I.stop} Stop All</button>` : ''}
        </div>
      </div>
      ${runningSessions.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">${I.session}</div>
             <h3>No active sessions</h3>
             <p>Launch a profile from the Profiles tab to start a browser session.</p>
             <button class="btn btn-secondary btn-sm" data-nav="profiles">Go to Profiles</button>
           </div>`
        : `<div class="sessions-wrap">
             <table class="sessions-table">
               <thead>
                 <tr>
                   <th>Profile</th>
                   <th>PID</th>
                   <th>Started</th>
                   <th>URL</th>
                   <th style="text-align:right">Action</th>
                 </tr>
               </thead>
               <tbody>
                 ${runningSessions.map(s => `
                 <tr>
                   <td>
                     <strong style="color:var(--text-1)">${esc(s.profileName)}</strong>
                   </td>
                   <td><code>${s.pid}</code></td>
                   <td style="color:var(--text-2)">${timeAgo(s.startTime)}</td>
                   <td><span class="url-cell">${esc(s.url || 'about:blank')}</span></td>
                   <td style="text-align:right">
                     <button class="btn btn-danger btn-sm" data-action="stop-profile" data-id="${s.profileId}">${I.stop} Stop</button>
                   </td>
                 </tr>`).join('')}
               </tbody>
             </table>
           </div>`
      }
    `;
  }

  function renderSettings() {
    const main = el('main-content');
    if (!main) return;
    const s = settings;
    const defaultPath = IS_WIN
      ? 'C:\Program Files\BotBrowser\chrome.exe'
      : IS_MAC ? '/Applications/Chromium.app/Contents/MacOS/Chromium' : '/usr/bin/botbrowser';

    main.innerHTML = `
      <div class="view-header">
        <div class="view-header-left">
          <div class="view-title-icon">${I.settings}</div>
          <h1 class="view-title">Settings</h1>
        </div>
        <div class="view-header-right">
          <button class="btn btn-primary btn-sm" data-action="save-settings">${I.check} Save Settings</button>
        </div>
      </div>

      <div class="settings-form">

        <!-- Section: Executable -->
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-icon" style="background:rgba(52,152,219,0.1);border-color:rgba(52,152,219,0.2)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:#3498db"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
            </div>
            <div>
              <div class="settings-card-title">BotBrowser Executable</div>
              <div class="settings-card-desc">Path to your BotBrowser (Chromium-based) binary</div>
            </div>
          </div>
          <div class="settings-card-body">
            <div class="form-group full">
              <label class="form-label">Executable Path</label>
              <div class="input-with-btn">
                <input class="form-input font-mono" id="s-botBrowserPath" value="${esc(s.botBrowserPath || defaultPath)}" placeholder="${esc(defaultPath)}">
                <button class="btn btn-secondary btn-sm" data-action="browse-exe">${I.folder} Browse</button>
              </div>
              <div class="form-hint">${IS_WIN ? 'e.g. C:\Program Files\BotBrowser\chrome.exe' : IS_MAC ? '/Applications/Chromium.app/Contents/MacOS/Chromium' : '/usr/bin/botbrowser'}</div>
            </div>
            <div class="form-group full" style="margin-top:14px">
              <label class="form-label">Default User Data Directory</label>
              <div class="input-with-btn">
                <input class="form-input font-mono" id="s-defaultUserDataDir" value="${esc(s.defaultUserDataDir || '')}" placeholder="Leave blank to use app data folder">
                <button class="btn btn-secondary btn-sm" data-action="browse-userdata">${I.folder} Browse</button>
              </div>
              <div class="form-hint">Each profile gets its own sub-folder here. Leave blank for the default app data directory.</div>
            </div>
          </div>
        </div>

        <!-- Section: Proxy -->
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-icon" style="background:rgba(39,174,96,0.1);border-color:rgba(39,174,96,0.2)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:#27ae60"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
            </div>
            <div>
              <div class="settings-card-title">Default Proxy</div>
              <div class="settings-card-desc">Applied to all new profiles unless overridden per-profile</div>
            </div>
          </div>
          <div class="settings-card-body">
            <div class="form-group full">
              <label class="form-label">Proxy Server</label>
              <input class="form-input" id="s-defaultProxy" value="${esc(s.defaultProxy || '')}" placeholder="http://user:pass@host:port  or  socks5://host:port">
              <div class="form-hint">Supports HTTP, HTTPS, SOCKS4, SOCKS5 with optional credentials.</div>
            </div>
          </div>
        </div>

        <!-- Section: Kernel Manager -->
        <div class="settings-card" id="kernel-manager-card">
          <div class="settings-card-header">
            <div class="settings-card-icon" style="background:rgba(155,89,182,0.1);border-color:rgba(155,89,182,0.2)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:#9b59b6"><path d="M4 20h16v-2H4v2zm8-18L4 10h4v4h8v-4h4L12 2z"/></svg>
            </div>
            <div>
              <div class="settings-card-title">Kernel Manager</div>
              <div class="settings-card-desc">Download and manage BotBrowser browser kernels from GitHub releases</div>
            </div>
            <div style="margin-left:auto">
              <button class="btn btn-secondary btn-sm" data-action="kernel-refresh" id="kernel-refresh-btn">${I.refresh} Refresh</button>
            </div>
          </div>
          <div class="settings-card-body">
            ${renderKernelManager()}
          </div>
        </div>

        <!-- Section: About -->
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-card-icon" style="background:rgba(52,152,219,0.08);border-color:rgba(52,152,219,0.15)">
              <img src="../assets/logo.svg" width="18" height="18" style="border-radius:4px;display:block">
            </div>
            <div>
              <div class="settings-card-title">About BotBrowser Control</div>
              <div class="settings-card-desc">Desktop profile manager for BotBrowser</div>
            </div>
          </div>
          <div class="settings-card-body">
            <div class="about-grid">
              <div class="about-item">
                <span class="about-item-label">Version</span>
                <span class="about-item-value">1.0.0</span>
              </div>
              <div class="about-item">
                <span class="about-item-label">Platform</span>
                <span class="about-item-value">${IS_WIN ? 'Windows' : IS_MAC ? 'macOS' : 'Linux'}</span>
              </div>
              <div class="about-item">
                <span class="about-item-label">CLI Spec</span>
                <span class="about-item-value">CLI_FLAGS.md</span>
              </div>
              <div class="about-item">
                <span class="about-item-label">Support</span>
                <span class="about-item-value" style="color:var(--accent)">github.com/botswin/BotBrowser</span>
              </div>
            </div>
            <div class="info-box info" style="margin-top:14px">
              ${I.info}
              <div>Supports all <strong>CLI flags</strong> from BotBrowser's CLI_FLAGS.md spec — proxy, fingerprint, locale, timezone, WebRTC, noise seeds, and more.</div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  // ─── Profile Editor ───────────────────────────────────────────────────────────
  function openProfileEditor(profileId) {
    editingProfileId = profileId;
    const profile = profileId ? profiles.find(p => p.id === profileId) : null;
    const d = profile ? { ...getDefaultProfile(), ...profile } : getDefaultProfile();

    // Tab definitions with icons
    const tabs = [
      { id: 'general',     label: 'General',      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>' },
      { id: 'network',     label: 'Network',      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>' },
      { id: 'identity',    label: 'Identity',     icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>' },
      { id: 'fingerprint', label: 'Fingerprint',  icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28zM3.5 9.72c-.1 0-.2-.03-.29-.09-.23-.16-.28-.47-.12-.7.99-1.4 2.25-2.5 3.75-3.27C9.98 4.04 14 4.03 17.15 6.65c1.5.77 2.76 1.86 3.75 3.25.16.22.11.54-.12.7-.23.16-.54.11-.7-.12-.9-1.26-2.04-2.25-3.39-2.94-2.87-2.43-6.62-2.43-9.49 0-1.36.69-2.5 1.68-3.4 2.94-.1.14-.25.21-.4.21h.1zm6.89 2.1c-.14 0-.27-.06-.37-.16-1.05-1.09-2.76-1.57-4.18-1.19-.29.08-.6-.1-.67-.39-.08-.29.1-.6.39-.67 1.82-.49 3.93.12 5.2 1.49.2.22.19.55-.03.75-.1.1-.23.15-.34.17zm-1.07 7.86c-.08 0-.16-.02-.23-.06-2.24-1.29-3.13-3.67-2.16-5.77.49-1.06 1.35-1.85 2.41-2.23 1.06-.38 2.19-.3 3.16.22 1.01.55 1.77 1.49 2.1 2.62.08.28-.09.57-.37.65-.29.08-.57-.09-.65-.37-.26-.9-.84-1.64-1.64-2.08-.77-.42-1.66-.49-2.49-.17-.84.3-1.5.91-1.87 1.73-.74 1.6-.1 3.43 1.56 4.38.26.15.35.48.2.73-.1.17-.29.26-.5.26h.52zm9.55-1.34c-.18 0-.36-.1-.46-.26-1.16-2.02-.77-4.58.96-6.08.52-.45 1.14-.78 1.81-.97.29-.08.58.09.66.38.08.29-.09.58-.38.66-.51.15-.97.39-1.38.73-1.36 1.18-1.67 3.22-.74 4.84.16.26.07.59-.19.75-.09.05-.19.07-.28.07h0zm-5.62-.42c-.28 0-.52-.19-.57-.47-.08-.44-.11-.88-.1-1.32 0-.29.23-.52.53-.52.29 0 .53.24.52.53-.01.38.02.76.09 1.13.06.29-.13.57-.42.63-.03.01-.06.01-.08.01h.03z"/></svg>' },
      { id: 'behavior',    label: 'Behavior',     icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>' },
      { id: 'session',     label: 'Session',      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-.34-.02-.67-.05-1H21c-.34 0-.67-.01-1-.05V10c-.39-.04-.77-.1-1.15-.18L17 8.07V6.5C17 4.57 15.43 3 13.5 3c-.18 0-.36.01-.53.03C12.68 2.04 12.35 2 12 2z"/></svg>' },
      { id: 'advanced',    label: 'Advanced',     icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>' },
    ];

    const overlay = document.createElement('div');
    overlay.id = 'profile-editor-overlay';
    overlay.className = 'editor-overlay';
    overlay.innerHTML = `
      <div class="editor-modal">
        <div class="editor-header">
          <div class="editor-header-left">
            <div class="editor-header-icon">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </div>
            <div>
              <h2>${profileId ? 'Edit Profile' : 'New Profile'}</h2>
              <div class="editor-header-sub">${profileId ? 'Update profile settings and flags' : 'Configure a new browser profile'}</div>
            </div>
          </div>
          <button class="btn btn-ghost btn-icon" data-action="cancel-edit" style="font-size:16px">✕</button>
        </div>
        <div class="editor-layout">
          <nav class="editor-sidenav">
            <div class="editor-nav-section">Profile</div>
            ${tabs.slice(0,2).map((t,i) =>
              `<button class="editor-tab${i===0?' active':''}" data-action="tab-switch" data-tab="${t.id}">${t.icon}${t.label}</button>`
            ).join('')}
            <div class="editor-nav-section">Browser</div>
            ${tabs.slice(2,5).map(t =>
              `<button class="editor-tab" data-action="tab-switch" data-tab="${t.id}">${t.icon}${t.label}</button>`
            ).join('')}
            <div class="editor-nav-section">More</div>
            ${tabs.slice(5).map(t =>
              `<button class="editor-tab" data-action="tab-switch" data-tab="${t.id}">${t.icon}${t.label}</button>`
            ).join('')}
          </nav>
          <div class="editor-body">
            ${renderTabGeneral(d)}
            ${renderTabNetwork(d)}
            ${renderTabIdentity(d)}
            ${renderTabFingerprint(d)}
            ${renderTabBehavior(d)}
            ${renderTabSession(d)}
            ${renderTabAdvanced(d)}
          </div>
        </div>
        <div class="editor-footer">
          <button class="btn btn-ghost" data-action="cancel-edit">Cancel</button>
          <button class="btn btn-primary" data-action="save-profile">${I.check} ${profileId ? 'Save Changes' : 'Create Profile'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeProfileEditor(); });

    // Rebuild custom headers UI
    renderCustomHeadersUI(d.customHeaders || {});
  }

  function closeProfileEditor() {
    const overlay = el('profile-editor-overlay');
    if (overlay) overlay.remove();
    editingProfileId = null;
  }

  function switchTab(tab) {
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.editor-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
    // Scroll panel to top on switch
    const body = document.querySelector('.editor-body');
    if (body) body.scrollTop = 0;
  }

  function getDefaultProfile() {
    return {
      name: '', browserBrand: '', colorScheme: 'light',
      locale: 'auto', timezone: 'auto', languages: 'auto', location: 'auto',
      startUrl: '', proxyServer: '', proxyIp: '', proxyBypassRgx: '',
      profileFilePath: '', profileDirPath: '',
      windowSize: 'real', screenSize: 'real', orientation: 'profile',
      disableDeviceScaleFactorOnGUI: false,
      noiseCanvas: true, noiseWebglImage: true, noiseAudioContext: true,
      noiseClientRects: false, noiseTextRects: true,
      webrtc: 'profile', webrtcICE: 'google', webgl: 'profile', webgpu: 'profile',
      fonts: 'profile', mediaDevices: 'profile', speechVoices: 'profile', mediaTypes: 'expand',
      alwaysActive: true, disableDebugger: true, disableConsoleMessage: true,
      portProtection: false, localDns: false, injectRandomHistory: '',
      mobileForceTouch: false, keyboard: 'profile',
      uaFullVersion: '', brandFullVersion: '', userAgent: '',
      platform: '', platformVersion: '', model: '', architecture: '', bitness: '', mobile: false,
      cookies: '', bookmarks: '', remoteDebuggingPort: '',
      customHeaders: {}, networkInfoOverride: false,
      noiseSeed: '', timeSeed: '', stackSeed: 'profile', timeScale: '',
      fps: 'profile', mirrorController: '', mirrorClient: '',
      canvasRecordFile: '', audioRecordFile: '',
      botScript: '', ipService: '', enableVariationsInContext: false,
      gpuEmulation: true,
    };
  }

  // ─── Tab Renderers ─────────────────────────────────────────────────────────────

  function badge(tier) {
    if (!tier) return '';
    if (tier === 'PRO') return '<span class="badge-pro">PRO</span>';
    return `<span class="badge-ent">${tier}</span>`;
  }

  function renderToggle(id, label, hint, checked, tier) {
    return `<div class="toggle-row">
      <div class="toggle-info">
        <label class="form-label" for="${id}">${label}${badge(tier)}</label>
        ${hint ? `<div class="form-hint">${hint}</div>` : ''}
      </div>
      <label class="toggle-switch"><input type="checkbox" id="${id}"${checked?' checked':''}><span class="toggle-slider"></span></label>
    </div>`;
  }

  function renderTabGeneral(d) {
    return `<div class="editor-panel active" id="tab-general">
      <div class="form-section">
        <div class="form-section-title">${I.user} Profile Identity</div>
        <div class="form-grid">
          <div class="form-group full">
            <label class="form-label">Profile Name *</label>
            <input class="form-input" id="f-name" type="text" placeholder="e.g. Work Account 1" value="${esc(d.name||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Browser Brand ${badge('ENT Tier2')}</label>
            <select class="form-select" id="f-browserBrand">
              <option value=""${!d.browserBrand?' selected':''}>From Profile</option>
              ${['chrome','chromium','edge','brave','opera','webview'].map(b=>`<option value="${b}"${d.browserBrand===b?' selected':''}>${b.charAt(0).toUpperCase()+b.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Color Scheme</label>
            <select class="form-select" id="f-colorScheme">
              <option value="light"${d.colorScheme==='light'?' selected':''}>Light</option>
              <option value="dark"${d.colorScheme==='dark'?' selected':''}>Dark</option>
            </select>
          </div>
          <div class="form-group full">
            <label class="form-label">Start URL</label>
            <input class="form-input" id="f-startUrl" type="text" placeholder="https://example.com" value="${esc(d.startUrl||'')}">
          </div>
          <div class="form-group full">
            <label class="form-label">Profile File (.enc) ${badge('recommended')}</label>
            <div class="input-with-btn">
              <input class="form-input font-mono" id="f-profileFilePath" placeholder="Select a .enc profile file…" value="${esc(d.profileFilePath||'')}">
              <button class="btn btn-secondary btn-sm" data-action="browse-file" data-target="f-profileFilePath" data-filter="enc">Browse</button>
            </div>
            <div class="form-hint">BotBrowser .enc profile for fingerprint protection. Highly recommended.</div>
          </div>
          <div class="form-group full">
            <label class="form-label">Profile Directory ${badge('--bot-profile-dir')}</label>
            <div class="input-with-btn">
              <input class="form-input font-mono" id="f-profileDirPath" placeholder="Directory with multiple .enc files…" value="${esc(d.profileDirPath||'')}">
              <button class="btn btn-secondary btn-sm" data-action="browse-dir" data-target="f-profileDirPath">Browse</button>
            </div>
            <div class="form-hint">Random profile selected on each startup for fingerprint diversity.</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderTabNetwork(d) {
    return `<div class="editor-panel" id="tab-network">
      <div class="form-section">
        <div class="form-section-title">${I.network} Proxy Configuration</div>
        <div class="form-grid">
          <div class="form-group full">
            <label class="form-label">Proxy Server</label>
            <input class="form-input" id="f-proxyServer" placeholder="http://user:pass@host:port or socks5://..." value="${esc(d.proxyServer||'')}">
            <div class="form-hint">Supports HTTP, HTTPS, SOCKS5, SOCKS5H with embedded credentials.</div>
          </div>
          <div class="form-group full">
            <label class="form-label">Proxy IP ${badge('ENT Tier1')} <span class="form-hint-inline">--proxy-ip</span></label>
            <input class="form-input" id="f-proxyIp" placeholder="203.0.113.1" value="${esc(d.proxyIp||'')}">
            <div class="form-hint">Skip per-page IP lookups for better performance.</div>
          </div>
          <div class="form-group full">
            <label class="form-label">Proxy Bypass Regex ${badge('PRO')} <span class="form-hint-inline">--proxy-bypass-rgx</span></label>
            <input class="form-input font-mono" id="f-proxyBypassRgx" placeholder="\\.js($|\\?)" value="${esc(d.proxyBypassRgx||'')}">
            <div class="form-hint">RE2 regex. Matches hostname + full URL. E.g. <code>\\.(js|css|png)($|\\?)</code> bypasses static assets.</div>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.globe} Locale & Geo</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Timezone ${badge('ENT Tier1')}</label>
            <input class="form-input" id="f-timezone" placeholder="auto" value="${esc(d.timezone||'auto')}">
            <div class="form-hint">auto / real / America/New_York</div>
          </div>
          <div class="form-group">
            <label class="form-label">Locale ${badge('ENT Tier1')}</label>
            <input class="form-input" id="f-locale" placeholder="auto" value="${esc(d.locale||'auto')}">
            <div class="form-hint">auto / en-US / fr-FR</div>
          </div>
          <div class="form-group">
            <label class="form-label">Languages ${badge('ENT Tier1')}</label>
            <input class="form-input" id="f-languages" placeholder="auto" value="${esc(d.languages||'auto')}">
            <div class="form-hint">auto / en-US,en / fr-FR,fr</div>
          </div>
          <div class="form-group">
            <label class="form-label">Location ${badge('ENT Tier1')}</label>
            <input class="form-input" id="f-location" placeholder="auto" value="${esc(d.location||'auto')}">
            <div class="form-hint">auto / real / 40.7128,-74.0060</div>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.globe} Custom HTTP Headers ${badge('PRO')}</div>
        <div id="custom-headers-container"></div>
        <button class="btn btn-secondary btn-sm" data-action="add-header" style="margin-top:8px">${I.plus} Add Header</button>
        <div class="form-hint">Headers are injected into all HTTP/HTTPS requests. Use CDP BotBrowser.setCustomHeaders for runtime changes.</div>
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.network} IP & WebRTC</div>
        <div class="form-grid">
          <div class="form-group full">
            <label class="form-label">IP Service ${badge('--bot-ip-service')}</label>
            <input class="form-input" id="f-ipService" placeholder="https://ip.example.com" value="${esc(d.ipService||'')}">
            <div class="form-hint">Custom IP lookup endpoint. Comma-separated for multiple (races them).</div>
          </div>
          <div class="form-group full">
            <label class="form-label">WebRTC ICE Servers ${badge('ENT Tier1')}</label>
            <input class="form-input" id="f-webrtcICE" placeholder="google" value="${esc(d.webrtcICE||'google')}">
            <div class="form-hint">google / custom:stun:host:port,turn:host:port</div>
          </div>
        </div>
        ${renderToggle('f-localDns', 'Local DNS Solver', 'Keep DNS resolution local. Prevents DNS leaks.', d.localDns===true, 'ENT Tier1')}
        ${renderToggle('f-portProtection', 'Port Protection', 'Protect local service ports (VNC, RDP, etc) from being scanned.', d.portProtection===true, 'PRO')}
        ${renderToggle('f-networkInfoOverride', 'Network Info Override', 'Use profile-defined navigator.connection values (rtt, downlink, effectiveType).', d.networkInfoOverride===true, null)}
      </div>
    </div>`;
  }

  function renderTabIdentity(d) {
    return `<div class="editor-panel" id="tab-identity">
      <div class="form-section">
        <div class="form-section-title">${I.shield} Browser Identity ${badge('ENT Tier2')}</div>
        <div class="form-grid">
          <div class="form-group full">
            <label class="form-label">User Agent String ${badge('--user-agent')}</label>
            <input class="form-input font-mono" id="f-userAgent" placeholder="Leave blank to use profile default" value="${esc(d.userAgent||'')}">
            <div class="form-hint">Supports placeholders: {platform}, {platform-version}, {model}, {ua-full-version}, {ua-major-version}, {brand-full-version}, {architecture}, {bitness}</div>
          </div>
          <div class="form-group">
            <label class="form-label">UA Full Version ${badge('ENT Tier2')}</label>
            <input class="form-input" id="f-uaFullVersion" placeholder="138.0.7204.92" value="${esc(d.uaFullVersion||'')}">
            <div class="form-hint">Must match Chromium major (e.g. for v138, starts with "138.")</div>
          </div>
          <div class="form-group">
            <label class="form-label">Brand Full Version ${badge('ENT Tier2')}</label>
            <input class="form-input" id="f-brandFullVersion" placeholder="142.0.3595.65" value="${esc(d.brandFullVersion||'')}">
            <div class="form-hint">For Edge/Opera/Brave cadence divergence in UA-CH tuples.</div>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.cpu} Custom User-Agent ${badge('ENT Tier3')}</div>
        <div class="form-hint-banner">Full control over userAgentData. Works together with User Agent String above. BotBrowser auto-generates all Sec-CH-UA-* headers.</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Platform</label>
            <select class="form-select" id="f-platform">
              <option value=""${!d.platform?' selected':''}>From Profile</option>
              ${['Windows','Android','macOS','Linux'].map(p=>`<option value="${p}"${d.platform===p?' selected':''}>${p}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Platform Version</label>
            <input class="form-input" id="f-platformVersion" placeholder="10.0 / 13 / 14.0" value="${esc(d.platformVersion||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Device Model</label>
            <input class="form-input" id="f-model" placeholder="SM-G991B" value="${esc(d.model||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Architecture</label>
            <select class="form-select" id="f-architecture">
              <option value=""${!d.architecture?' selected':''}>From Profile</option>
              ${['x86','arm','arm64'].map(a=>`<option value="${a}"${d.architecture===a?' selected':''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Bitness</label>
            <select class="form-select" id="f-bitness">
              <option value=""${!d.bitness?' selected':''}>From Profile</option>
              <option value="32"${d.bitness==='32'?' selected':''}>32-bit</option>
              <option value="64"${d.bitness==='64'?' selected':''}>64-bit</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Mobile Device</label>
            <select class="form-select" id="f-mobile">
              <option value=""${d.mobile===undefined||d.mobile===''?' selected':''}>From Profile</option>
              <option value="true"${d.mobile===true||d.mobile==='true'?' selected':''}>Yes</option>
              <option value="false"${d.mobile===false&&d.mobile!==''?' selected':''}>No</option>
            </select>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderTabFingerprint(d) {
    return `<div class="editor-panel" id="tab-fingerprint">
      <div class="form-section">
        <div class="form-section-title">${I.cpu} Display & Input</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Window Size</label>
            <input class="form-input" id="f-windowSize" placeholder="real" value="${esc(d.windowSize||'real')}">
            <div class="form-hint">profile / real / 1920x1080 / JSON</div>
          </div>
          <div class="form-group">
            <label class="form-label">Screen Size</label>
            <input class="form-input" id="f-screenSize" placeholder="real" value="${esc(d.screenSize||'real')}">
            <div class="form-hint">profile / real / 2560x1440 / JSON</div>
          </div>
          <div class="form-group">
            <label class="form-label">Orientation ${badge('--bot-config-orientation')}</label>
            <select class="form-select" id="f-orientation">
              ${['profile','landscape','portrait','landscape-primary','landscape-secondary','portrait-primary','portrait-secondary'].map(o=>`<option value="${o}"${d.orientation===o?' selected':''}>${o}</option>`).join('')}
            </select>
            <div class="form-hint">Desktop profiles ignore this flag.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Keyboard</label>
            <select class="form-select" id="f-keyboard">
              <option value="profile"${d.keyboard==='profile'?' selected':''}>Profile (emulated)</option>
              <option value="real"${d.keyboard==='real'?' selected':''}>Real (system)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fonts</label>
            <select class="form-select" id="f-fonts">
              <option value="profile"${d.fonts==='profile'?' selected':''}>Profile (embedded)</option>
              <option value="expand"${d.fonts==='expand'?' selected':''}>Expand (profile + system)</option>
              <option value="real"${d.fonts==='real'?' selected':''}>Real (system fonts)</option>
            </select>
          </div>
        </div>
        ${renderToggle('f-disableDeviceScaleFactorOnGUI', 'Disable Device Scale Factor', 'Ignore DPI-based UI scaling (disableDeviceScaleFactorOnGUI).', d.disableDeviceScaleFactorOnGUI===true, null)}
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.zap} Rendering & Media</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">WebGL</label>
            <select class="form-select" id="f-webgl">
              <option value="profile"${d.webgl==='profile'?' selected':''}>Profile</option>
              <option value="real"${d.webgl==='real'?' selected':''}>Real (system)</option>
              <option value="disabled"${d.webgl==='disabled'?' selected':''}>Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">WebGPU</label>
            <select class="form-select" id="f-webgpu">
              <option value="profile"${d.webgpu==='profile'?' selected':''}>Profile</option>
              <option value="real"${d.webgpu==='real'?' selected':''}>Real (system)</option>
              <option value="disabled"${d.webgpu==='disabled'?' selected':''}>Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">WebRTC</label>
            <select class="form-select" id="f-webrtc">
              <option value="profile"${d.webrtc==='profile'?' selected':''}>Profile</option>
              <option value="real"${d.webrtc==='real'?' selected':''}>Real (native)</option>
              <option value="disabled"${d.webrtc==='disabled'?' selected':''}>Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Media Devices</label>
            <select class="form-select" id="f-mediaDevices">
              <option value="profile"${d.mediaDevices==='profile'?' selected':''}>Profile (synthetic)</option>
              <option value="real"${d.mediaDevices==='real'?' selected':''}>Real (system)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Speech Voices</label>
            <select class="form-select" id="f-speechVoices">
              <option value="profile"${d.speechVoices==='profile'?' selected':''}>Profile (synthetic)</option>
              <option value="real"${d.speechVoices==='real'?' selected':''}>Real (system)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Media Types</label>
            <select class="form-select" id="f-mediaTypes">
              <option value="expand"${d.mediaTypes==='expand'?' selected':''}>Expand (prefer local)</option>
              <option value="profile"${d.mediaTypes==='profile'?' selected':''}>Profile</option>
              <option value="real"${d.mediaTypes==='real'?' selected':''}>Real (system)</option>
            </select>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.shield} Noise Toggles</div>
        ${renderToggle('f-noiseCanvas','Canvas Noise','Deterministic variance for Canvas 2D fingerprint protection.',d.noiseCanvas!==false,null)}
        ${renderToggle('f-noiseWebglImage','WebGL Image Noise','Deterministic variance for WebGL image fingerprint protection.',d.noiseWebglImage!==false,null)}
        ${renderToggle('f-noiseAudioContext','Audio Context Noise','Deterministic variance for AudioContext fingerprint protection.',d.noiseAudioContext!==false,null)}
        ${renderToggle('f-noiseClientRects','Client Rects Noise','Variance for getBoundingClientRect/getClientRects.',d.noiseClientRects===true,null)}
        ${renderToggle('f-noiseTextRects','Text Rects Noise','Deterministic variance for text metrics.',d.noiseTextRects!==false,null)}
      </div>
    </div>`;
  }

  function renderTabBehavior(d) {
    return `<div class="editor-panel" id="tab-behavior">
      <div class="form-section">
        <div class="form-section-title">${I.shield} Protection Toggles</div>
        ${renderToggle('f-disableDebugger','Disable Debugger','Ignore JS debugger statements to avoid pauses during automation.',d.disableDebugger!==false,null)}
        ${renderToggle('f-disableConsoleMessage','Disable Console Messages','Suppress console.* forwarding in CDP logs.',d.disableConsoleMessage!==false,'ENT Tier1')}
        ${renderToggle('f-alwaysActive','Always Active','Keep windows/tabs active even when unfocused (suppress blur events).',d.alwaysActive!==false,'PRO')}
        ${renderToggle('f-mobileForceTouch','Mobile Force Touch','Force touch events on/off for mobile device simulation.',d.mobileForceTouch===true,null)}
        ${renderToggle('f-enableVariationsInContext','X-Client-Data in Incognito','Include X-Client-Data headers in incognito for Google domains.',d.enableVariationsInContext===true,'ENT Tier2')}
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.zap} Timing & Seeds ${badge('ENT Tier2')}</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">FPS ${badge('ENT Tier2')}</label>
            <input class="form-input" id="f-fps" placeholder="profile" value="${esc(d.fps||'profile')}">
            <div class="form-hint">profile / real / number (e.g. 60)</div>
          </div>
          <div class="form-group">
            <label class="form-label">Time Scale ${badge('ENT Tier2')}</label>
            <input class="form-input" id="f-timeScale" type="number" step="0.01" min="0.01" max="0.99" placeholder="0.92" value="${esc(d.timeScale||'')}">
            <div class="form-hint">Float 0–1. Scales performance.now() intervals.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Noise Seed ${badge('ENT Tier2')}</label>
            <input class="form-input" id="f-noiseSeed" type="number" placeholder="42" value="${esc(d.noiseSeed||'')}">
            <div class="form-hint">Integer seed for Canvas/WebGL/Audio noise RNG.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Time Seed ${badge('ENT Tier2')}</label>
            <input class="form-input" id="f-timeSeed" type="number" placeholder="0" value="${esc(d.timeSeed||'')}">
            <div class="form-hint">Deterministic timing diversity across 27 browser ops.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Stack Seed ${badge('ENT Tier2')}</label>
            <input class="form-input" id="f-stackSeed" placeholder="profile" value="${esc(d.stackSeed||'profile')}">
            <div class="form-hint">profile / real / integer seed</div>
          </div>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.info} History & Session</div>
        <div class="form-group full">
          <label class="form-label">Inject Random History ${badge('PRO')}</label>
          <input class="form-input" id="f-injectRandomHistory" placeholder="false" value="${esc(d.injectRandomHistory||'')}">
          <div class="form-hint">true (2–7 entries) / false / number (e.g. 15 → history.length of 16)</div>
        </div>
      </div>
    </div>`;
  }

  function renderTabSession(d) {
    return `<div class="editor-panel" id="tab-session">
      <div class="form-section">
        <div class="form-section-title">${I.cookie} Cookies & Bookmarks</div>
        <div class="form-group full">
          <label class="form-label">Cookies ${badge('PRO')}</label>
          <textarea class="form-textarea" id="f-cookies" rows="4" placeholder='[{"name":"session","value":"abc","domain":".example.com"}] or @/path/to/cookies.json'>${esc(d.cookies||'')}</textarea>
          <div class="form-hint">Inline JSON array or @/path/to/file.json. Cookies saved via CDP are auto-loaded.</div>
        </div>
        <div class="form-group full">
          <label class="form-label">Bookmarks</label>
          <textarea class="form-textarea" id="f-bookmarks" rows="3" placeholder='[{"title":"Example","type":"url","url":"https://example.com"}]'>${esc(d.bookmarks||'')}</textarea>
        </div>
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.network} Mirror Mode ${badge('ENT Tier3')}</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Mirror Controller Endpoint</label>
            <input class="form-input" id="f-mirrorController" placeholder="host:port" value="${esc(d.mirrorController||'')}">
            <div class="form-hint">Launch as controller (captures actions)</div>
          </div>
          <div class="form-group">
            <label class="form-label">Mirror Client Endpoint</label>
            <input class="form-input" id="f-mirrorClient" placeholder="host:port" value="${esc(d.mirrorClient||'')}">
            <div class="form-hint">Launch as client (receives actions)</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderTabAdvanced(d) {
    return `<div class="editor-panel" id="tab-advanced">
      <div class="form-section">
        <div class="form-section-title">${I.cpu} Debug & Automation</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Remote Debugging Port</label>
            <input class="form-input" id="f-remoteDebuggingPort" type="number" placeholder="9222" value="${esc(d.remoteDebuggingPort||'')}">
            <div class="form-hint">Enables CDP. Required for cookie save on stop.</div>
          </div>
          <div class="form-group">
            <label class="form-label">Bot Script ${badge('--bot-script')}</label>
            <div class="input-with-btn">
              <input class="form-input font-mono" id="f-botScript" placeholder="/path/to/script.js" value="${esc(d.botScript||'')}">
              <button class="btn btn-secondary btn-sm" data-action="browse-file" data-target="f-botScript" data-filter="js">Browse</button>
            </div>
            <div class="form-hint">Framework-less CDP script with chrome.debugger API access.</div>
          </div>
        </div>
        ${renderToggle('f-gpuEmulation', 'GPU Emulation', 'Use system GPU/GL drivers. Set OFF to use your own GPU driver directly.', d.gpuEmulation!==false, 'ENT Tier2')}
      </div>
      <div class="form-section">
        <div class="form-section-title">${I.zap} Recording (Forensics)</div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Canvas Record File ${badge('--bot-canvas-record-file')}</label>
            <div class="input-with-btn">
              <input class="form-input font-mono" id="f-canvasRecordFile" placeholder="/tmp/canvaslab.jsonl" value="${esc(d.canvasRecordFile||'')}">
              <button class="btn btn-secondary btn-sm" data-action="browse-file" data-target="f-canvasRecordFile" data-filter="jsonl">Browse</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Audio Record File ${badge('--bot-audio-record-file')}</label>
            <div class="input-with-btn">
              <input class="form-input font-mono" id="f-audioRecordFile" placeholder="/tmp/audiolab.jsonl" value="${esc(d.audioRecordFile||'')}">
              <button class="btn btn-secondary btn-sm" data-action="browse-file" data-target="f-audioRecordFile" data-filter="jsonl">Browse</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ─── Custom Headers UI ─────────────────────────────────────────────────────────
  let customHeadersState = {};

  function renderCustomHeadersUI(headers) {
    customHeadersState = { ...headers };
    rebuildCustomHeadersDOM();
  }

  function rebuildCustomHeadersDOM() {
    const container = el('custom-headers-container');
    if (!container) return;
    const entries = Object.entries(customHeadersState);
    if (entries.length === 0) {
      container.innerHTML = '<div class="form-hint">No custom headers added.</div>';
      return;
    }
    container.innerHTML = entries.map(([key, value]) => `
      <div class="custom-header-row" data-key="${esc(key)}">
        <input class="form-input" placeholder="Header-Name" value="${esc(key)}" onchange="this.closest('.custom-header-row').dataset.key=this.value">
        <span class="custom-header-sep">:</span>
        <input class="form-input" placeholder="value" value="${esc(value)}">
        <button class="btn btn-ghost btn-sm btn-icon" data-action="remove-header" data-key="${esc(key)}">${I.trash}</button>
      </div>
    `).join('');
  }

  function addCustomHeader() {
    customHeadersState['X-Custom-Header'] = '';
    rebuildCustomHeadersDOM();
  }

  function removeCustomHeader(key) {
    delete customHeadersState[key];
    rebuildCustomHeadersDOM();
  }

  function readCustomHeaders() {
    const rows = document.querySelectorAll('.custom-header-row');
    const result = {};
    rows.forEach(row => {
      const inputs = row.querySelectorAll('input');
      const k = inputs[0]?.value?.trim();
      const v = inputs[1]?.value?.trim();
      if (k) result[k] = v || '';
    });
    return result;
  }

  // ─── Profile Actions ──────────────────────────────────────────────────────────
  // ─── IP Check ─────────────────────────────────────────────────────────────
  function renderIpBadge(profileId) {
    const r = ipCheckResults[profileId];
    if (!r) return '';
    const isHosting = r.hosting || r.proxy;
    const flag = r.countryCode ? `<span class="ip-flag">${countryCodeToEmoji(r.countryCode)}</span>` : '';
    const datacenter = isHosting ? `<span class="ip-badge-dc" title="Datacenter/proxy detected">DC</span>` : '';
    return `<div class="ip-result-bar" data-profile-id="${profileId}">
      ${flag}
      <span class="ip-result-ip">${esc(r.query || '')}</span>
      <span class="ip-result-loc">${esc([r.city, r.countryCode].filter(Boolean).join(', '))}</span>
      <span class="ip-result-isp">${esc((r.isp || r.org || '').slice(0, 30))}</span>
      ${datacenter}
      <button class="ip-result-close" title="Dismiss" onclick="this.closest('.ip-result-bar').remove()">✕</button>
    </div>`;
  }

  function countryCodeToEmoji(cc) {
    if (!cc || cc.length !== 2) return '🌐';
    return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E0 - 65 + c.charCodeAt(0)));
  }

  async function checkProfileIp(profileId) {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    if (ipCheckLoading[profileId]) return;

    ipCheckLoading[profileId] = true;
    renderProfiles(); // show spinner

    try {
      const result = await window.api.proxy.checkIp(profile.proxyServer || '');
      ipCheckResults[profileId] = result;
      if (result.status === 'fail') {
        showToast(`IP check failed: ${result.message || 'Unknown error'}`, 'error');
      } else {
        const isHosting = result.hosting || result.proxy;
        const loc = [result.city, result.regionName, result.country].filter(Boolean).join(', ');
        showToast(
          `${countryCodeToEmoji(result.countryCode)} ${result.query} · ${loc}${isHosting ? ' · ⚠ Datacenter/Proxy' : ''}`,
          isHosting ? 'warning' : 'success',
          6000
        );
      }
    } catch (e) {
      showToast(`IP check error: ${e.message}`, 'error');
    } finally {
      ipCheckLoading[profileId] = false;
      renderProfiles();
    }
  }

  // ─── Quick Proxy Popover ──────────────────────────────────────────────────
  function openQuickProxy(profileId, e) {
    // Remove any existing popover
    closeQuickProxy();
    quickProxyProfileId = profileId;
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    const ipResult = ipCheckResults[profileId];
    const autoFillBtn = (ipResult && ipResult.query)
      ? `<button class="btn btn-ghost btn-sm" onclick="document.getElementById('qp-proxyip').value='${ipResult.query}'" title="Auto-fill from last IP check">↑ ${ipResult.query}</button>`
      : '';

    const popover = document.createElement('div');
    popover.id = 'quick-proxy-popover';
    popover.className = 'quick-proxy-popover';
    popover.innerHTML = `
      <div class="quick-proxy-header">
        <span>${I.proxy} Quick Proxy</span>
        <button class="btn btn-ghost btn-sm btn-icon" data-action="close-quick-proxy">✕</button>
      </div>
      <div class="quick-proxy-body">
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:11px;margin-bottom:4px">Proxy Server</label>
          <input class="form-input form-input-sm" id="qp-proxy" placeholder="http://user:pass@host:port" value="${esc(profile.proxyServer || '')}">
        </div>
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label" style="font-size:11px;margin-bottom:4px">Proxy IP (exit IP override)</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input class="form-input form-input-sm" id="qp-proxyip" placeholder="203.0.113.1" value="${esc(profile.proxyIp || '')}">
            ${autoFillBtn}
          </div>
        </div>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px">
          <button class="btn btn-secondary btn-sm" data-action="check-ip" data-id="${profileId}">${I.globe} Check IP</button>
          <button class="btn btn-primary btn-sm" data-action="save-quick-proxy" data-id="${profileId}">${I.check} Apply</button>
        </div>
      </div>
    `;
    document.body.appendChild(popover);

    // Position near the button
    const btn = e.target.closest('[data-action="quick-proxy"]');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + 320 > window.innerWidth) left = window.innerWidth - 330;
      if (top + 220 > window.innerHeight) top = rect.top - 226;
      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
    }

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', onOutsideClickQP);
    }, 10);
  }

  function onOutsideClickQP(e) {
    if (!e.target.closest('#quick-proxy-popover') && !e.target.closest('[data-action="quick-proxy"]')) {
      closeQuickProxy();
    }
  }

  function closeQuickProxy() {
    const pop = document.getElementById('quick-proxy-popover');
    if (pop) pop.remove();
    quickProxyProfileId = null;
    document.removeEventListener('click', onOutsideClickQP);
  }

  async function saveQuickProxy(profileId) {
    const proxyServer = (document.getElementById('qp-proxy')?.value || '').trim();
    const proxyIp = (document.getElementById('qp-proxyip')?.value || '').trim();
    try {
      const updated = await window.api.profiles.update(profileId, { proxyServer, proxyIp });
      const idx = profiles.findIndex(p => p.id === profileId);
      if (idx !== -1) profiles[idx] = { ...profiles[idx], ...updated };
      showToast('Proxy updated.', 'success');
      closeQuickProxy();
      renderProfiles();
    } catch (e) {
      showToast(`Failed to update proxy: ${e.message}`, 'error');
    }
  }

  // ─── Kernel Manager ───────────────────────────────────────────────────────
  function renderKernelManager() {
    const platform = window.api.platform;
    const platformAssetExt = platform === 'win32' ? ['.7z', '-win', '.exe'] :
                              platform === 'darwin' ? ['.dmg', '-mac'] :
                              ['.deb', '.AppImage', '-linux'];

    if (!kernelReleases) {
      return `<div class="kernel-loading">
        <div style="color:var(--text-3);font-size:13px;padding:8px 0">
          ${I.download} Click <strong>Refresh</strong> to fetch available releases from GitHub.
        </div>
      </div>`;
    }

    if (kernelReleases.length === 0) {
      return `<div class="kernel-loading"><div style="color:var(--text-3);font-size:13px;padding:8px 0">No releases found.</div></div>`;
    }

    const installedVersions = new Set(kernelInstalled.map(k => k.version));

    const installedSection = `
      <div class="kernel-installed-section">
        <div class="kernel-section-label">Installed</div>
        ${kernelInstalled.length === 0
          ? `<div style="color:var(--text-3);font-size:12px;padding:4px 0">No kernels installed yet.</div>`
          : kernelInstalled.map(k => `
            <div class="kernel-installed-row">
              <div class="kernel-installed-info">
                <span class="kernel-version-tag installed">${esc(k.version)}</span>
                <span style="color:var(--text-3);font-size:11px">${k.installedAt ? timeAgo(k.installedAt) : ''}</span>
              </div>
              <div style="display:flex;gap:4px">
                ${k.execPath ? `<button class="btn btn-primary btn-sm" data-action="kernel-use" data-execpath="${esc(k.execPath)}" title="Use as BotBrowser executable">${I.use} Use</button>` : ''}
                <button class="btn btn-danger btn-sm btn-icon" data-action="kernel-delete" data-version="${esc(k.version)}" title="Delete">${I.trash}</button>
              </div>
            </div>
          `).join('')
        }
      </div>`;

    const releasesSection = `
      <div class="kernel-section-label" style="margin-top:16px">Available Releases</div>
      <div class="kernel-releases-list">
        ${kernelReleases.map(release => {
          const isInstalled = installedVersions.has(release.tagName);
          const dl = kernelDownloads[release.tagName];
          const platformAssets = release.assets.filter(a =>
            platformAssetExt.some(ext => a.name.toLowerCase().includes(ext.toLowerCase()))
          );
          const displayAssets = (platformAssets.length > 0 ? platformAssets : release.assets).slice(0, 5);

          return `
          <div class="kernel-release-row${isInstalled ? ' kernel-installed-row-highlight' : ''}">
            <div class="kernel-release-header">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span class="kernel-version-tag${isInstalled ? ' installed' : ''}">${esc(release.tagName)}</span>
                ${release.prerelease ? '<span class="badge-ent" style="font-size:9px;padding:1px 5px">PRE</span>' : ''}
                <span style="color:var(--text-3);font-size:11px">${release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : ''}</span>
                ${isInstalled ? `<span style="color:var(--success);font-size:11px">${I.check} Installed</span>` : ''}
              </div>
            </div>
            ${dl && dl.status === 'downloading'
              ? `<div class="kernel-progress-wrap" id="kp-${release.tagName.replace(/[^a-zA-Z0-9]/g,'_')}">
                   <div class="kernel-progress-bar" style="width:${dl.progress||0}%"></div>
                   <span class="kernel-progress-label">${dl.progress||0}%</span>
                 </div>`
              : ''
            }
            <div class="kernel-assets">
              ${displayAssets.map(asset => `
                <div class="kernel-asset-row">
                  <span class="kernel-asset-name" title="${esc(asset.name)}">${esc(asset.name)}</span>
                  <span class="kernel-asset-size">${formatBytes(asset.size)}</span>
                  ${(!dl || dl.status !== 'downloading')
                    ? `<button class="btn btn-secondary btn-sm" data-action="kernel-download"
                         data-version="${esc(release.tagName)}"
                         data-url="${esc(asset.downloadUrl)}"
                         data-filename="${esc(asset.name)}">${I.download} Download</button>`
                    : `<span style="color:var(--text-3);font-size:11px">Downloading…</span>`
                  }
                </div>
              `).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;

    return installedSection + releasesSection;
  }

  function formatBytes(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function fetchKernelReleases(force) {
    if (kernelReleases && !force) return;
    const btn = document.getElementById('kernel-refresh-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⟳ Fetching…'; }
    try {
      const [releases, installed] = await Promise.all([
        window.api.kernel.fetchReleases(),
        window.api.kernel.listInstalled(),
      ]);
      kernelReleases = releases;
      kernelInstalled = installed;
    } catch (e) {
      showToast(`Failed to fetch releases: ${e.message}`, 'error', 5000);
      kernelReleases = [];
    } finally {
      if (currentView === 'settings') renderSettings();
    }
  }

  async function downloadKernel(version, url, filename) {
    if (kernelDownloads[version]?.status === 'downloading') return;
    kernelDownloads[version] = { progress: 0, status: 'downloading' };
    if (currentView === 'settings') renderSettings();
    try {
      await window.api.kernel.download({ downloadUrl: url, fileName: filename, version });
    } catch (e) {
      kernelDownloads[version] = { status: 'error' };
      showToast(`Download failed: ${e.message}`, 'error', 5000);
      if (currentView === 'settings') renderSettings();
    }
  }

  function updateKernelProgressUI(version, progress) {
    const safeV = version.replace(/[^a-zA-Z0-9]/g, '_');
    const wrap = document.getElementById(`kp-${safeV}`);
    if (wrap) {
      const fill = wrap.querySelector('.kernel-progress-bar');
      const label = wrap.querySelector('.kernel-progress-label');
      if (fill) fill.style.width = progress + '%';
      if (label) label.textContent = progress + '%';
    }
  }

  async function deleteKernel(version) {
    if (!confirm(`Delete kernel ${version}? This cannot be undone.`)) return;
    await window.api.kernel.delete(version);
    kernelInstalled = kernelInstalled.filter(k => k.version !== version);
    showToast(`Kernel ${version} deleted.`, 'success');
    if (currentView === 'settings') renderSettings();
  }

  async function useKernelPath(execPath) {
    if (!execPath) { showToast('No executable path for this kernel.', 'error'); return; }
    await window.api.settings.set({ botBrowserPath: execPath });
    settings.botBrowserPath = execPath;
    showToast('BotBrowser path updated to this kernel.', 'success');
    if (currentView === 'settings') renderSettings();
  }


  async function launchProfile(id) {
    try {
      await window.api.browser.launch(id);
    } catch (e) {
      showToast(`Launch failed: ${e.message}`, 'error', 6000);
    }
  }

  async function stopProfile(id) {
    await window.api.browser.stop(id);
    await refreshRunningSessions();
    renderView();
  }

  async function stopAll() {
    await window.api.browser.stopAll();
    await refreshRunningSessions();
    renderView();
  }

  async function duplicateProfile(id) {
    try {
      showToast('Duplicating profile and copying session data…', 'info', 2000);
      const copy = await window.api.profiles.duplicate(id);
      profiles.push(copy);
      showToast(`Profile "${copy.name}" created with session data copied.`, 'success');
      renderView();
    } catch (e) {
      showToast(`Duplicate failed: ${e.message}`, 'error');
    }
  }

  async function deleteProfile(id) {
    const p = profiles.find(x => x.id === id);
    if (!confirm(`Delete profile "${p?.name || id}"? This cannot be undone.`)) return;
    await window.api.profiles.delete(id);
    profiles = profiles.filter(x => x.id !== id);
    selectedProfileIds.delete(id);
    renderView();
  }

  async function deleteSelected() {
    if (selectedProfileIds.size === 0) return;
    if (!confirm(`Delete ${selectedProfileIds.size} selected profile(s)? This cannot be undone.`)) return;
    const ids = [...selectedProfileIds];
    await window.api.profiles.deleteMultiple(ids);
    profiles = profiles.filter(p => !selectedProfileIds.has(p.id));
    selectedProfileIds.clear();
    showToast(`${ids.length} profile(s) deleted.`, 'success');
    renderView();
  }

  function clearSelection() {
    selectedProfileIds.clear();
    renderView();
  }

  async function saveProfile() {
    const name = val('f-name');
    if (!name) { showToast('Profile name is required.', 'error'); return; }

    const profileData = {
      name,
      browserBrand: val('f-browserBrand') || '',
      colorScheme: selVal('f-colorScheme'),
      startUrl: val('f-startUrl'),
      profileFilePath: val('f-profileFilePath'),
      profileDirPath: val('f-profileDirPath'),

      // Network
      proxyServer: val('f-proxyServer'),
      proxyIp: val('f-proxyIp'),
      proxyBypassRgx: val('f-proxyBypassRgx'),
      timezone: val('f-timezone') || 'auto',
      locale: val('f-locale') || 'auto',
      languages: val('f-languages') || 'auto',
      location: val('f-location') || 'auto',
      ipService: val('f-ipService'),
      webrtcICE: val('f-webrtcICE') || 'google',
      localDns: chk('f-localDns'),
      portProtection: chk('f-portProtection'),
      networkInfoOverride: chk('f-networkInfoOverride'),
      customHeaders: readCustomHeaders(),

      // Identity
      userAgent: val('f-userAgent'),
      uaFullVersion: val('f-uaFullVersion'),
      brandFullVersion: val('f-brandFullVersion'),
      platform: selVal('f-platform'),
      platformVersion: val('f-platformVersion'),
      model: val('f-model'),
      architecture: selVal('f-architecture'),
      bitness: selVal('f-bitness'),
      mobile: selVal('f-mobile') === '' ? '' : selVal('f-mobile') === 'true',

      // Fingerprint
      windowSize: val('f-windowSize') || 'real',
      screenSize: val('f-screenSize') || 'real',
      orientation: selVal('f-orientation'),
      keyboard: selVal('f-keyboard'),
      fonts: selVal('f-fonts'),
      disableDeviceScaleFactorOnGUI: chk('f-disableDeviceScaleFactorOnGUI'),
      webgl: selVal('f-webgl'),
      webgpu: selVal('f-webgpu'),
      webrtc: selVal('f-webrtc'),
      mediaDevices: selVal('f-mediaDevices'),
      speechVoices: selVal('f-speechVoices'),
      mediaTypes: selVal('f-mediaTypes'),
      noiseCanvas: chk('f-noiseCanvas'),
      noiseWebglImage: chk('f-noiseWebglImage'),
      noiseAudioContext: chk('f-noiseAudioContext'),
      noiseClientRects: chk('f-noiseClientRects'),
      noiseTextRects: chk('f-noiseTextRects'),

      // Behavior
      disableDebugger: chk('f-disableDebugger'),
      disableConsoleMessage: chk('f-disableConsoleMessage'),
      alwaysActive: chk('f-alwaysActive'),
      mobileForceTouch: chk('f-mobileForceTouch'),
      enableVariationsInContext: chk('f-enableVariationsInContext'),
      fps: val('f-fps') || 'profile',
      timeScale: val('f-timeScale'),
      noiseSeed: val('f-noiseSeed'),
      timeSeed: val('f-timeSeed'),
      stackSeed: val('f-stackSeed') || 'profile',
      injectRandomHistory: val('f-injectRandomHistory'),

      // Session
      cookies: val('f-cookies'),
      bookmarks: val('f-bookmarks'),
      mirrorController: val('f-mirrorController'),
      mirrorClient: val('f-mirrorClient'),

      // Advanced
      remoteDebuggingPort: val('f-remoteDebuggingPort'),
      botScript: val('f-botScript'),
      gpuEmulation: chk('f-gpuEmulation'),
      canvasRecordFile: val('f-canvasRecordFile'),
      audioRecordFile: val('f-audioRecordFile'),
    };

    // ── Auto-detect Android profiles ──────────────────────────────────────────
    // If platform is Android, automatically apply mobile settings
    const isAndroid = profileData.platform === 'Android';
    const hasMobileModel = profileData.model && /android|samsung|pixel|xiaomi|huawei|oneplus|oppo|vivo|lg|htc|sony|moto/i.test(profileData.model);
    if (isAndroid || hasMobileModel) {
      if (profileData.mobile === '' || profileData.mobile === false) {
        profileData.mobile = true;
      }
      if (profileData.orientation === 'profile' || !profileData.orientation) {
        profileData.orientation = 'portrait';
      }
      if (!profileData.mobileForceTouch) {
        profileData.mobileForceTouch = true;
      }
      if (isAndroid || hasMobileModel) {
        if (!profileData.architecture) profileData.architecture = 'arm64';
        if (!profileData.bitness) profileData.bitness = '64';
      }
      // Show info toast on first detection
      if (!editingProfileId) {
        showToast('Android detected — mobile settings auto-applied.', 'info', 4000);
      }
    }

    try {
      if (editingProfileId) {
        const updated = await window.api.profiles.update(editingProfileId, profileData);
        const idx = profiles.findIndex(p => p.id === editingProfileId);
        if (idx !== -1) profiles[idx] = { ...profiles[idx], ...updated };
        showToast('Profile saved.', 'success');
      } else {
        const created = await window.api.profiles.create(profileData);
        profiles.push(created);
        showToast(`Profile "${created.name}" created.`, 'success');
      }
      closeProfileEditor();
      renderView();
    } catch (e) {
      showToast(`Save failed: ${e.message}`, 'error');
    }
  }

  // ─── Context Menu ──────────────────────────────────────────────────────────────
  function showContextMenu(profileId, e) {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    const isRunning = runningSessions.some(s => s.profileId === profileId);
    menu.innerHTML = `
      <div class="context-menu-item" data-action="${isRunning?'stop-profile':'launch-profile'}" data-id="${profileId}">${isRunning?I.stop+' Stop':I.play+' Launch'}</div>
      <div class="context-menu-item" data-action="edit-profile" data-id="${profileId}">${I.edit} Edit</div>
      <div class="context-menu-item" data-action="duplicate-profile" data-id="${profileId}">${I.copy} Duplicate (with session)</div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" data-action="delete-profile" data-id="${profileId}">${I.trash} Delete</div>
    `;
    document.body.appendChild(menu);
    const rect = e.target.getBoundingClientRect();
    let x = rect.right, y = rect.bottom;
    if (x + 200 > window.innerWidth) x = rect.left - 200;
    if (y + 180 > window.innerHeight) y = rect.top - 180;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  // ─── File/Dir Browsing ─────────────────────────────────────────────────────────
  async function browseFile(targetId, filter) {
    const filters = filter === 'enc' ? [{ name: 'BotBrowser Profile', extensions: ['enc', 'json'] }]
      : filter === 'js' ? [{ name: 'JavaScript', extensions: ['js'] }]
      : filter === 'jsonl' ? [{ name: 'JSONL', extensions: ['jsonl', 'json'] }]
      : [{ name: 'All Files', extensions: ['*'] }];
    const p = await window.api.dialog.openFile({ filters });
    if (p) { const inp = el(targetId); if (inp) inp.value = p; }
  }

  async function browseDir(targetId) {
    const p = await window.api.dialog.selectDirectory();
    if (p) { const inp = el(targetId); if (inp) inp.value = p; }
  }

  async function browseExe() {
    const p = await window.api.dialog.selectExecutable();
    if (p) { const inp = el('s-botBrowserPath'); if (inp) inp.value = p; }
  }

  async function browseUserData() {
    const p = await window.api.dialog.selectDirectory();
    if (p) { const inp = el('s-defaultUserDataDir'); if (inp) inp.value = p; }
  }

  // ─── Settings ──────────────────────────────────────────────────────────────────
  async function saveSettings() {
    const newSettings = {
      botBrowserPath: val('s-botBrowserPath'),
      defaultUserDataDir: val('s-defaultUserDataDir'),
      defaultProxy: val('s-defaultProxy'),
    };
    await window.api.settings.set(newSettings);
    settings = { ...settings, ...newSettings };
    showToast('Settings saved.', 'success');
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();