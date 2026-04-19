const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');

// ─── Fix app name BEFORE anything else (prevents "Electron" in menu/title bar) ───
app.setName('BotBrowser Control');

// ─── Platform-aware defaults ───────────────────────────────────────────────────
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

function getDefaultBotBrowserPath() {
  if (IS_MAC) return '/Applications/Chromium.app/Contents/MacOS/Chromium';
  if (IS_WIN) return 'C:\\Program Files\\BotBrowser\\chrome.exe';
  return '/usr/bin/botbrowser'; // Linux
}

function getDefaultUserDataDir() {
  return path.join(app.getPath('userData'), 'browser-profiles');
}

const DEFAULT_BOTBROWSER_PATH = getDefaultBotBrowserPath();

// ─── Persistent store ──────────────────────────────────────────────────────────
const store = new Store({
  name: 'botbrowser-control',
  defaults: {
    profiles: [],
    settings: {
      botBrowserPath: DEFAULT_BOTBROWSER_PATH,
      defaultUserDataDir: getDefaultUserDataDir(),
      theme: 'dark',
      defaultProxy: '',
      autoLaunch: false,
    },
    windowBounds: { width: 1280, height: 800 }
  }
});

// ─── Runtime state ─────────────────────────────────────────────────────────────
const runningInstances = new Map(); // profileId -> instance object
const tempFiles = new Map();        // profileId -> tempFilePath
let mainWindow = null;

// ─── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const bounds = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 800,
    minWidth: 960,
    minHeight: 600,
    ...(IS_MAC ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'under-window',
      visualEffectState: 'active',
    } : {
      frame: true,
    }),
    backgroundColor: '#2c3e50',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize();
    store.set('windowBounds', { width, height });
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  buildMenu();
}

function buildMenu() {
  const template = [
    ...(IS_MAC ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Profile', accelerator: IS_MAC ? 'Cmd+N' : 'Ctrl+N', click: () => mainWindow?.webContents.send('action', 'new-profile') },
        { type: 'separator' },
        IS_MAC ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Profiles', accelerator: IS_MAC ? 'Cmd+1' : 'Ctrl+1', click: () => mainWindow?.webContents.send('navigate', 'profiles') },
        { label: 'Running Sessions', accelerator: IS_MAC ? 'Cmd+2' : 'Ctrl+2', click: () => mainWindow?.webContents.send('navigate', 'sessions') },
        { label: 'Settings', accelerator: IS_MAC ? 'Cmd+3' : 'Ctrl+3', click: () => mainWindow?.webContents.send('navigate', 'settings') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(IS_MAC ? [{ type: 'separator' }, { role: 'front' }] : [])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC: Profile Management ───────────────────────────────────────────────────

ipcMain.handle('profiles:getAll', () => store.get('profiles', []));

ipcMain.handle('profiles:create', (_, profileData) => {
  const profiles = store.get('profiles', []);
  const newProfile = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'stopped',
    ...profileData
  };
  profiles.push(newProfile);
  store.set('profiles', profiles);
  return newProfile;
});

ipcMain.handle('profiles:update', (_, { id, updates }) => {
  const profiles = store.get('profiles', []);
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Profile not found');
  profiles[idx] = { ...profiles[idx], ...updates, updatedAt: new Date().toISOString() };
  store.set('profiles', profiles);
  return profiles[idx];
});

ipcMain.handle('profiles:delete', (_, id) => {
  const profiles = store.get('profiles', []);
  store.set('profiles', profiles.filter(p => p.id !== id));
  if (runningInstances.has(id)) {
    try { runningInstances.get(id).process.kill('SIGTERM'); } catch {}
    runningInstances.delete(id);
  }
  return true;
});

ipcMain.handle('profiles:deleteMultiple', (_, ids) => {
  const idSet = new Set(ids);
  const profiles = store.get('profiles', []);
  store.set('profiles', profiles.filter(p => !idSet.has(p.id)));
  for (const id of ids) {
    if (runningInstances.has(id)) {
      try { runningInstances.get(id).process.kill('SIGTERM'); } catch {}
      runningInstances.delete(id);
    }
  }
  return true;
});

ipcMain.handle('profiles:duplicate', async (_, id) => {
  const profiles = store.get('profiles', []);
  const original = profiles.find(p => p.id === id);
  if (!original) throw new Error('Profile not found');

  const newId = uuidv4();
  const copy = {
    ...original,
    id: newId,
    name: original.name + ' (Copy)',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'stopped',
    cookieCount: 0,
    cookiesSavedAt: null,
    savedCookiesPath: null,
  };

  // Copy user-data-dir (cookies, history, session data, open tabs)
  const settings = store.get('settings');
  const srcDir = path.join(settings.defaultUserDataDir, id);
  const dstDir = path.join(settings.defaultUserDataDir, newId);

  if (fs.existsSync(srcDir)) {
    try {
      copyDirRecursive(srcDir, dstDir);

      // Update savedCookiesPath to point to new location
      const newCookiesPath = path.join(dstDir, 'saved-cookies.json');
      if (fs.existsSync(newCookiesPath)) {
        copy.savedCookiesPath = newCookiesPath;
        // Count cookies
        try {
          const cookies = JSON.parse(fs.readFileSync(newCookiesPath, 'utf8'));
          copy.cookieCount = Array.isArray(cookies) ? cookies.length : 0;
          copy.cookiesSavedAt = original.cookiesSavedAt;
        } catch {}
      }
    } catch (e) {
    }
  }

  profiles.push(copy);
  store.set('profiles', profiles);
  return copy;
});

/** Recursively copy a directory */
function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// ─── IPC: Browser Launch ───────────────────────────────────────────────────────

ipcMain.handle('browser:launch', async (_, profileId) => {
  let profiles = store.get('profiles', []);
  let profile = profiles.find(p => p.id === profileId);
  if (!profile) throw new Error('Profile not found');

  // Guard: if already tracked as running, don't spawn a duplicate
  if (runningInstances.has(profileId)) {
    throw new Error('Profile is already running.');
  }

  // Ghost recovery: profile was marked running (from a previous force-close)
  // but has no live process — reset it before launching fresh
  if (profile.status === 'running') {
    updateProfileStatus(profileId, 'stopped');
    profile = { ...profile, status: 'stopped' };
  }

  const settings = store.get('settings');
  const botBrowserPath = settings.botBrowserPath || DEFAULT_BOTBROWSER_PATH;

  if (!fs.existsSync(botBrowserPath)) {
    throw new Error(
      `BotBrowser executable not found at:\n${botBrowserPath}\n\nPlease install BotBrowser or update the path in Settings.`
    );
  }

  // Build unique user-data-dir per profile
  const userDataDir = path.join(settings.defaultUserDataDir, profileId);
  fs.mkdirSync(userDataDir, { recursive: true });

  // Auto-load previously saved cookies
  const savedCookiesPath = path.join(userDataDir, 'saved-cookies.json');
  if (fs.existsSync(savedCookiesPath) && !profile.cookies) {
    profile = { ...profile, cookies: `@${savedCookiesPath}` };
  }

  // Resolve --bot-profile argument
  let botProfileArg = '';
  if (profile.profileFilePath && fs.existsSync(profile.profileFilePath)) {
    botProfileArg = injectConfigsIntoEncFile(profile.profileFilePath, profile, profileId);
  } else if (profile.profileDirPath && fs.existsSync(profile.profileDirPath)) {
    botProfileArg = null; // use --bot-profile-dir instead
  } else {
    botProfileArg = writeStandaloneConfigFile(profile, profileId);
  }

  const args = buildLaunchArgs(profile, userDataDir, botProfileArg);

  const proc = spawn(botBrowserPath, args, {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(IS_WIN ? { shell: false } : {})
  });

  // Pick up --remote-debugging-port from args
  const rdpArg = args.find(a => a.startsWith('--remote-debugging-port='));
  const remoteDebuggingPort = rdpArg ? parseInt(rdpArg.split('=')[1], 10) : null;

  const instance = {
    process: proc,
    pid: proc.pid,
    profileId,
    profileName: profile.name,
    startTime: new Date().toISOString(),
    url: profile.startUrl || 'about:blank',
    userDataDir,
    remoteDebuggingPort,
    args
  };

  runningInstances.set(profileId, instance);
  updateProfileStatus(profileId, 'running');

  proc.stdout.on('data', (_data) => {});
  proc.stderr.on('data', (_data) => {});

  proc.on('close', (code) => {
    runningInstances.delete(profileId);
    updateProfileStatus(profileId, 'stopped');
    cleanupTempFile(profileId);
    mainWindow?.webContents.send('instance:stopped', { profileId, code });
  });

  proc.on('error', (err) => {
    runningInstances.delete(profileId);
    updateProfileStatus(profileId, 'stopped');
    cleanupTempFile(profileId);
    mainWindow?.webContents.send('instance:error', { profileId, error: err.message });
  });

  mainWindow?.webContents.send('instance:started', { profileId, pid: proc.pid });
  return { pid: proc.pid, args };
});

ipcMain.handle('browser:stop', async (_, profileId) => {
  // Ghost profile — not tracked in memory (e.g. after force-close + relaunch)
  // Still force status to stopped so the UI unlocks.
  if (!runningInstances.has(profileId)) {
    updateProfileStatus(profileId, 'stopped');
    return false;
  }
  const inst = runningInstances.get(profileId);

  // Save cookies via CDP before killing
  if (inst.remoteDebuggingPort) {
    try {
      await saveCookiesViaCDP(profileId, inst.remoteDebuggingPort, inst.userDataDir);
    } catch (e) {
    }
  }

  try { inst.process.kill(IS_WIN ? undefined : 'SIGTERM'); } catch {}
  runningInstances.delete(profileId);
  cleanupTempFile(profileId);
  updateProfileStatus(profileId, 'stopped');
  return true;
});

ipcMain.handle('browser:stopAll', async () => {
  const savePromises = [];
  for (const [profileId, inst] of runningInstances) {
    if (inst.remoteDebuggingPort) {
      savePromises.push(
        saveCookiesViaCDP(profileId, inst.remoteDebuggingPort, inst.userDataDir)
          .catch(_e => {})
      );
    }
  }
  await Promise.allSettled(savePromises);

  for (const [profileId, inst] of runningInstances) {
    try { inst.process.kill(IS_WIN ? undefined : 'SIGTERM'); } catch {}
    cleanupTempFile(profileId);
    updateProfileStatus(profileId, 'stopped');
  }
  runningInstances.clear();
  return true;
});

ipcMain.handle('browser:getRunning', () => {
  const result = [];
  for (const [profileId, inst] of runningInstances) {
    result.push({
      profileId,
      pid: inst.pid,
      profileName: inst.profileName,
      startTime: inst.startTime,
      url: inst.url
    });
  }
  return result;
});

// ─── IPC: Settings ─────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => store.get('settings'));
ipcMain.handle('settings:set', (_, newSettings) => {
  store.set('settings', { ...store.get('settings'), ...newSettings });
  return true;
});

// ─── IPC: Dialogs ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async (_, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
    ...options
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_, options = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:selectExecutable', async () => {
  const filters = IS_WIN
    ? [{ name: 'Executable', extensions: ['exe'] }]
    : [{ name: 'All Files', extensions: ['*'] }];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('shell:openPath', (_, p) => shell.openPath(p));
ipcMain.handle('shell:showItemInFolder', (_, p) => shell.showItemInFolder(p));

// ─── Config File Helpers ───────────────────────────────────────────────────────

function writeStandaloneConfigFile(profile, profileId) {
  const configs = buildConfigsBlock(profile);
  const json = JSON.stringify({ configs }, null, 2);
  const tmpPath = path.join(os.tmpdir(), `botbrowser-config-${profileId}.json`);
  fs.writeFileSync(tmpPath, json, 'utf8');
  tempFiles.set(profileId, tmpPath);
  return tmpPath;
}

function injectConfigsIntoEncFile(encFilePath, profile, profileId) {
  try {
    const raw = fs.readFileSync(encFilePath, 'utf8');
    const enc = JSON.parse(raw);
    enc.configs = buildConfigsBlock(profile);
    const tmpPath = path.join(os.tmpdir(), `botbrowser-enc-${profileId}.json`);
    fs.writeFileSync(tmpPath, JSON.stringify(enc, null, 2), 'utf8');
    tempFiles.set(profileId, tmpPath);
    return tmpPath;
  } catch (e) {
    return writeStandaloneConfigFile(profile, profileId);
  }
}

function cleanupTempFile(profileId) {
  const p = tempFiles.get(profileId);
  if (p && fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
  tempFiles.delete(profileId);
}

/**
 * Build the "configs" JSON block from profile UI fields.
 * Maps to BotBrowser profile configs structure (PROFILE_CONFIGS.md).
 */
function buildConfigsBlock(profile) {
  const configs = {};

  // ── Identity & Locale ──
  if (profile.locale) configs.locale = profile.locale;
  if (profile.languages) configs.languages = profile.languages;
  if (profile.timezone) configs.timezone = profile.timezone;

  // location: 'auto', 'real', or "lat,lon" → { latitude, longitude }
  if (profile.location) {
    if (typeof profile.location === 'string' && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(profile.location.trim())) {
      const [lat, lon] = profile.location.split(',').map(Number);
      configs.location = { latitude: lat, longitude: lon };
    } else {
      configs.location = profile.location;
    }
  }

  if (profile.colorScheme) configs.colorScheme = profile.colorScheme;
  if (profile.browserBrand) configs.browserBrand = profile.browserBrand;
  if (profile.brandFullVersion) configs.brandFullVersion = profile.brandFullVersion;
  if (profile.uaFullVersion) configs.uaFullVersion = profile.uaFullVersion;

  // ── Custom UA (ENT Tier3) ──
  if (profile.platform) configs.platform = profile.platform;
  if (profile.platformVersion) configs.platformVersion = profile.platformVersion;
  if (profile.model) configs.model = profile.model;
  if (profile.architecture) configs.architecture = profile.architecture;
  if (profile.bitness) configs.bitness = profile.bitness;
  if (profile.mobile !== undefined && profile.mobile !== '') configs.mobile = !!profile.mobile;

  // ── Proxy ──
  if (profile.proxyServer) {
    configs.proxy = { server: profile.proxyServer };
    if (profile.proxyIp) configs.proxy.ip = profile.proxyIp;
  }

  // ── Custom Headers (PRO) ──
  if (profile.customHeaders && typeof profile.customHeaders === 'object' && Object.keys(profile.customHeaders).length > 0) {
    configs.customHeaders = profile.customHeaders;
  }

  // ── Window & Screen ──
  if (profile.windowSize) configs.window = profile.windowSize;
  if (profile.screenSize) configs.screen = profile.screenSize;
  if (profile.orientation) configs.orientation = profile.orientation;
  if (profile.disableDeviceScaleFactorOnGUI) configs.disableDeviceScaleFactorOnGUI = true;

  // ── Rendering & Media ──
  if (profile.webgl) configs.webgl = profile.webgl;
  if (profile.webgpu) configs.webgpu = profile.webgpu;
  if (profile.webrtc) configs.webrtc = profile.webrtc;
  if (profile.webrtcICE) configs.webrtcICE = profile.webrtcICE;
  if (profile.speechVoices) configs.speechVoices = profile.speechVoices;
  if (profile.mediaDevices) configs.mediaDevices = profile.mediaDevices;
  if (profile.mediaTypes) configs.mediaTypes = profile.mediaTypes;
  if (profile.fonts) configs.fonts = profile.fonts;
  if (profile.keyboard) configs.keyboard = profile.keyboard;

  // ── Noise toggles ──
  if (profile.noiseCanvas !== undefined && profile.noiseCanvas !== '') configs.noiseCanvas = !!profile.noiseCanvas;
  if (profile.noiseWebglImage !== undefined && profile.noiseWebglImage !== '') configs.noiseWebglImage = !!profile.noiseWebglImage;
  if (profile.noiseAudioContext !== undefined && profile.noiseAudioContext !== '') configs.noiseAudioContext = !!profile.noiseAudioContext;
  if (profile.noiseClientRects !== undefined && profile.noiseClientRects !== '') configs.noiseClientRects = !!profile.noiseClientRects;
  if (profile.noiseTextRects !== undefined && profile.noiseTextRects !== '') configs.noiseTextRects = !!profile.noiseTextRects;

  // ── Behavior toggles ──
  if (profile.alwaysActive !== undefined) configs.alwaysActive = !!profile.alwaysActive;
  if (profile.disableDebugger !== undefined) configs.disableDebugger = !!profile.disableDebugger;
  if (profile.disableConsoleMessage !== undefined) configs.disableConsoleMessage = !!profile.disableConsoleMessage;
  if (profile.portProtection !== undefined) configs.portProtection = !!profile.portProtection;
  if (profile.mobileForceTouch !== undefined) configs.mobileForceTouch = !!profile.mobileForceTouch;
  if (profile.networkInfoOverride !== undefined) configs.networkInfoOverride = !!profile.networkInfoOverride;
  if (profile.enableVariationsInContext !== undefined) configs.enableVariationsInContext = !!profile.enableVariationsInContext;

  // ── Inject random history (PRO) ──
  if (profile.injectRandomHistory !== undefined && profile.injectRandomHistory !== '') {
    const v = profile.injectRandomHistory;
    if (v === true || v === 'true') configs.injectRandomHistory = true;
    else if (v === false || v === 'false') configs.injectRandomHistory = false;
    else if (!isNaN(Number(v))) configs.injectRandomHistory = Number(v);
  }

  // ── Timing & Seeds (ENT Tier2) ──
  if (profile.fps !== undefined && profile.fps !== '' && profile.fps !== 'profile') configs.fps = isNaN(Number(profile.fps)) ? profile.fps : Number(profile.fps);
  if (profile.timeScale !== undefined && profile.timeScale !== '') { const ts = parseFloat(profile.timeScale); if (!isNaN(ts)) configs.timeScale = ts; }
  if (profile.noiseSeed !== undefined && profile.noiseSeed !== '') { const ns = parseInt(profile.noiseSeed); if (!isNaN(ns)) configs.noiseSeed = ns; }
  if (profile.timeSeed !== undefined && profile.timeSeed !== '') { const ts = parseInt(profile.timeSeed); if (!isNaN(ts)) configs.timeSeed = ts; }
  if (profile.stackSeed !== undefined && profile.stackSeed !== '') {
    const ss = profile.stackSeed;
    if (ss === 'profile' || ss === 'real') configs.stackSeed = ss;
    else if (!isNaN(parseInt(ss))) configs.stackSeed = parseInt(ss);
  }

  return configs;
}

/**
 * Build CLI args array from profile settings.
 * Priority: CLI flags > profile configs > profile defaults.
 */
function buildLaunchArgs(profile, userDataDir, botProfileArg) {
  const args = [];

  // ── Core profile ──
  if (botProfileArg) args.push(`--bot-profile=${botProfileArg}`);
  if (profile.profileDirPath && fs.existsSync(profile.profileDirPath)) {
    args.push(`--bot-profile-dir=${profile.profileDirPath}`);
  }

  // ── Session ──
  args.push(`--user-data-dir=${userDataDir}`);
  args.push('--restore-last-session');
  args.push(`--no-first-run`);

  // ── Bot title (window label) ──
  if (profile.name) args.push(`--bot-title=${profile.name}`);

  // ── Proxy ──
  if (profile.proxyServer && profile.proxyServer.trim()) args.push(`--proxy-server=${profile.proxyServer.trim()}`);
  if (profile.proxyIp && profile.proxyIp.trim()) args.push(`--proxy-ip=${profile.proxyIp.trim()}`);
  if (profile.proxyBypassRgx && profile.proxyBypassRgx.trim()) args.push(`--proxy-bypass-rgx=${profile.proxyBypassRgx.trim()}`);

  // ── Identity overrides ──
  if (profile.browserBrand && profile.browserBrand !== '') args.push(`--bot-config-browser-brand=${profile.browserBrand}`);
  if (profile.brandFullVersion && profile.brandFullVersion !== '') args.push(`--bot-config-brand-full-version=${profile.brandFullVersion}`);
  if (profile.uaFullVersion && profile.uaFullVersion !== '') args.push(`--bot-config-ua-full-version=${profile.uaFullVersion}`);
  if (profile.userAgent && profile.userAgent.trim()) args.push(`--user-agent=${profile.userAgent.trim()}`);

  // ── Locale / Geo ──
  if (profile.locale && profile.locale !== '') args.push(`--bot-config-locale=${profile.locale}`);
  if (profile.timezone && profile.timezone !== '') args.push(`--bot-config-timezone=${profile.timezone}`);
  if (profile.languages && profile.languages !== '') args.push(`--bot-config-languages=${profile.languages}`);
  if (profile.location && profile.location !== '') args.push(`--bot-config-location=${profile.location}`);
  if (profile.colorScheme) args.push(`--bot-config-color-scheme=${profile.colorScheme}`);

  // ── Custom UA (ENT Tier3) ──
  if (profile.platform && profile.platform !== '') args.push(`--bot-config-platform=${profile.platform}`);
  if (profile.platformVersion) args.push(`--bot-config-platform-version=${profile.platformVersion}`);
  if (profile.model) args.push(`--bot-config-model=${profile.model}`);
  if (profile.architecture) args.push(`--bot-config-architecture=${profile.architecture}`);
  if (profile.bitness) args.push(`--bot-config-bitness=${profile.bitness}`);
  if (profile.mobile !== undefined && profile.mobile !== '') args.push(`--bot-config-mobile=${!!profile.mobile}`);

  // ── Display & Input ──
  if (profile.windowSize) args.push(`--bot-config-window=${profile.windowSize}`);
  if (profile.screenSize) args.push(`--bot-config-screen=${profile.screenSize}`);
  if (profile.orientation) args.push(`--bot-config-orientation=${profile.orientation}`);
  if (profile.keyboard) args.push(`--bot-config-keyboard=${profile.keyboard}`);
  if (profile.fonts) args.push(`--bot-config-fonts=${profile.fonts}`);
  if (profile.disableDeviceScaleFactorOnGUI) args.push('--bot-config-disable-device-scale-factor');

  // ── Rendering & Media ──
  if (profile.webgl) args.push(`--bot-config-webgl=${profile.webgl}`);
  if (profile.webgpu) args.push(`--bot-config-webgpu=${profile.webgpu}`);
  if (profile.webrtc) args.push(`--bot-config-webrtc=${profile.webrtc}`);
  if (profile.speechVoices) args.push(`--bot-config-speech-voices=${profile.speechVoices}`);
  if (profile.mediaDevices) args.push(`--bot-config-media-devices=${profile.mediaDevices}`);
  if (profile.mediaTypes) args.push(`--bot-config-media-types=${profile.mediaTypes}`);

  // ── Noise overrides ──
  if (profile.noiseCanvas !== undefined && profile.noiseCanvas !== '') args.push(`--bot-config-noise-canvas=${!!profile.noiseCanvas}`);
  if (profile.noiseWebglImage !== undefined && profile.noiseWebglImage !== '') args.push(`--bot-config-noise-webgl-image=${!!profile.noiseWebglImage}`);
  if (profile.noiseAudioContext !== undefined && profile.noiseAudioContext !== '') args.push(`--bot-config-noise-audio-context=${!!profile.noiseAudioContext}`);
  if (profile.noiseClientRects !== undefined && profile.noiseClientRects !== '') args.push(`--bot-config-noise-client-rects=${!!profile.noiseClientRects}`);
  if (profile.noiseTextRects !== undefined && profile.noiseTextRects !== '') args.push(`--bot-config-noise-text-rects=${!!profile.noiseTextRects}`);

  // ── Behavior & Protection toggles ──
  if (profile.disableDebugger === true || profile.disableDebugger === 'true') args.push('--bot-disable-debugger');
  if (!(profile.disableConsoleMessage === false || profile.disableConsoleMessage === 'false')) args.push('--bot-disable-console-message');
  args.push('--bot-always-active');
  if (profile.portProtection === true || profile.portProtection === 'true') args.push('--bot-port-protection');
  if (profile.localDns === true || profile.localDns === 'true') args.push('--bot-local-dns');
  if (profile.mobileForceTouch === true || profile.mobileForceTouch === 'true') args.push('--bot-mobile-force-touch');
  if (profile.enableVariationsInContext === true || profile.enableVariationsInContext === 'true') args.push('--bot-enable-variations-in-context');
  if (profile.networkInfoOverride === true || profile.networkInfoOverride === 'true') args.push('--bot-network-info-override');

  // ── Inject random history (PRO) ──
  if (profile.injectRandomHistory !== undefined && profile.injectRandomHistory !== '') {
    const v = profile.injectRandomHistory;
    if (v === true || v === 'true') args.push('--bot-inject-random-history=true');
    else if (v !== false && v !== 'false' && !isNaN(Number(v))) args.push(`--bot-inject-random-history=${Number(v)}`);
  }

  // ── WebRTC ICE (ENT Tier1) ──
  if (profile.webrtcICE && profile.webrtcICE !== 'profile' && profile.webrtcICE !== '') {
    args.push(`--bot-webrtc-ice=${profile.webrtcICE}`);
  }

  // ── Timing & Seeds (ENT Tier2) ──
  if (profile.noiseSeed !== undefined && profile.noiseSeed !== '') { const ns = parseInt(profile.noiseSeed); if (!isNaN(ns) && ns >= 0) args.push(`--bot-noise-seed=${ns}`); }
  if (profile.timeSeed !== undefined && profile.timeSeed !== '') { const ts = parseInt(profile.timeSeed); if (!isNaN(ts) && ts >= 0) args.push(`--bot-time-seed=${ts}`); }
  if (profile.stackSeed !== undefined && profile.stackSeed !== '') {
    const ss = profile.stackSeed;
    if (ss === 'profile' || ss === 'real') args.push(`--bot-stack-seed=${ss}`);
    else if (!isNaN(parseInt(ss))) args.push(`--bot-stack-seed=${parseInt(ss)}`);
  }
  if (profile.timeScale !== undefined && profile.timeScale !== '') { const ts = parseFloat(profile.timeScale); if (!isNaN(ts) && ts > 0 && ts < 1) args.push(`--bot-time-scale=${ts}`); }
  if (profile.fps !== undefined && profile.fps !== '' && profile.fps !== 'profile') args.push(`--bot-fps=${profile.fps}`);

  // ── GPU emulation (ENT Tier2) ──
  if (profile.gpuEmulation === false || profile.gpuEmulation === 'false') args.push('--bot-gpu-emulation=false');

  // ── Custom Headers (PRO) ──
  if (profile.customHeaders && typeof profile.customHeaders === 'object' && Object.keys(profile.customHeaders).length > 0) {
    args.push('--bot-custom-headers=' + JSON.stringify(profile.customHeaders));
  }

  // ── IP Service ──
  if (profile.ipService) args.push(`--bot-ip-service=${profile.ipService}`);

  // ── Mirror mode (ENT Tier3) ──
  if (profile.mirrorController) args.push(`--bot-mirror-controller-endpoint=${profile.mirrorController}`);
  if (profile.mirrorClient) args.push(`--bot-mirror-client-endpoint=${profile.mirrorClient}`);

  // ── Canvas/Audio recording ──
  if (profile.canvasRecordFile) args.push(`--bot-canvas-record-file=${profile.canvasRecordFile}`);
  if (profile.audioRecordFile) args.push(`--bot-audio-record-file=${profile.audioRecordFile}`);

  // ── Bot script ──
  if (profile.botScript) args.push(`--bot-script=${profile.botScript}`);

  // ── Remote debugging port ──
  if (profile.remoteDebuggingPort) args.push(`--remote-debugging-port=${profile.remoteDebuggingPort}`);

  // ── Cookies ──
  if (profile.cookies && profile.cookies.trim()) {
    const cookieVal = profile.cookies.trim();
    if (cookieVal.startsWith('@')) {
      args.push(`--bot-cookies=${cookieVal}`);
    } else {
      try { JSON.parse(cookieVal); args.push('--bot-cookies=' + cookieVal); } catch {; }
    }
  }

  // ── Bookmarks ──
  if (profile.bookmarks && profile.bookmarks.trim()) {
    try { JSON.parse(profile.bookmarks.trim()); args.push('--bot-bookmarks=' + profile.bookmarks.trim()); } catch {; }
  }

  // ── Start URL — must be LAST ──
  if (profile.startUrl && profile.startUrl.trim()) args.push(profile.startUrl.trim());

  return args;
}

// ─── CDP Cookie Save ───────────────────────────────────────────────────────────

async function saveCookiesViaCDP(profileId, port, userDataDir) {
  const cookies = await fetchCookiesViaCDP(port);
  if (!Array.isArray(cookies)) return;

  const savePath = path.join(userDataDir, 'saved-cookies.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(savePath, JSON.stringify(cookies, null, 2), 'utf8');

  const profiles = store.get('profiles', []);
  const idx = profiles.findIndex(p => p.id === profileId);
  if (idx !== -1) {
    profiles[idx].cookieCount = cookies.length;
    profiles[idx].cookiesSavedAt = new Date().toISOString();
    profiles[idx].savedCookiesPath = savePath;
    store.set('profiles', profiles);
  }

  mainWindow?.webContents.send('profile:cookiesSaved', { profileId, count: cookies.length, path: savePath });
}

function fetchCookiesViaCDP(port) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const crypto = require('crypto');
    const timeout = setTimeout(() => reject(new Error('CDP timeout')), 5000);

    const httpClient = net.createConnection({ port, host: '127.0.0.1' }, () => {
      httpClient.write('GET /json/list HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nConnection: close\r\n\r\n');
    });
    let httpData = '';
    httpClient.on('data', d => { httpData += d.toString(); });
    httpClient.on('end', () => {
      try {
        const body = httpData.slice(httpData.indexOf('\r\n\r\n') + 4);
        const tabs = JSON.parse(body);
        const tab = tabs.find(t => t.type === 'page') || tabs[0];
        if (!tab?.webSocketDebuggerUrl) { clearTimeout(timeout); reject(new Error('No debuggable tab')); return; }
        const wsPath = tab.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, '');

        const wsClient = net.createConnection({ port, host: '127.0.0.1' }, () => {
          const key = crypto.randomBytes(16).toString('base64');
          wsClient.write('GET ' + wsPath + ' HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
        });

        let wsHandshakeDone = false, wsBuffer = Buffer.alloc(0);

        function sendWsFrame(payload) {
          const data = Buffer.from(JSON.stringify(payload));
          const maskKey = crypto.randomBytes(4);
          const masked = Buffer.alloc(data.length);
          for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ maskKey[i % 4];
          let header;
          if (data.length < 126) { header = Buffer.alloc(6); header[0] = 0x81; header[1] = 0x80 | data.length; maskKey.copy(header, 2); }
          else if (data.length < 65536) { header = Buffer.alloc(8); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(data.length, 2); maskKey.copy(header, 4); }
          else { header = Buffer.alloc(14); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(data.length), 2); maskKey.copy(header, 10); }
          wsClient.write(Buffer.concat([header, masked]));
        }

        function parseWsFrames(buf) {
          const messages = []; let offset = 0;
          while (offset + 2 <= buf.length) {
            const b1 = buf[offset + 1]; const isMasked = (b1 & 0x80) !== 0;
            let payloadLen = b1 & 0x7f, headerLen = 2;
            if (payloadLen === 126) { if (offset + 4 > buf.length) break; payloadLen = buf.readUInt16BE(offset + 2); headerLen = 4; }
            else if (payloadLen === 127) { if (offset + 10 > buf.length) break; payloadLen = Number(buf.readBigUInt64BE(offset + 2)); headerLen = 10; }
            const maskLen = isMasked ? 4 : 0;
            const frameEnd = offset + headerLen + maskLen + payloadLen;
            if (frameEnd > buf.length) break;
            let payload = buf.slice(offset + headerLen + maskLen, frameEnd);
            if (isMasked) { const mask = buf.slice(offset + headerLen, offset + headerLen + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]; }
            messages.push(payload.toString('utf8')); offset = frameEnd;
          }
          return { messages, remaining: buf.slice(offset) };
        }

        wsClient.on('data', (chunk) => {
          if (!wsHandshakeDone) {
            if (chunk.indexOf('\r\n\r\n') !== -1) {
              wsHandshakeDone = true;
              const rest = chunk.slice(chunk.indexOf('\r\n\r\n') + 4);
              if (rest.length > 0) wsBuffer = Buffer.concat([wsBuffer, rest]);
              sendWsFrame({ id: 1, method: 'Network.getAllCookies', params: {} });
            }
            return;
          }
          wsBuffer = Buffer.concat([wsBuffer, chunk]);
          const { messages, remaining } = parseWsFrames(wsBuffer);
          wsBuffer = remaining;
          for (const msg of messages) {
            try {
              const parsed = JSON.parse(msg);
              if (parsed.id === 1 && parsed.result?.cookies) {
                clearTimeout(timeout); wsClient.destroy(); resolve(parsed.result.cookies); return;
              }
            } catch {}
          }
        });
        wsClient.on('error', e => { clearTimeout(timeout); reject(e); });
      } catch (e) { clearTimeout(timeout); reject(e); }
    });
    httpClient.on('error', e => { clearTimeout(timeout); reject(e); });
  });
}

// ─── Profile Status ────────────────────────────────────────────────────────────

function updateProfileStatus(profileId, status) {
  const profiles = store.get('profiles', []);
  const idx = profiles.findIndex(p => p.id === profileId);
  if (idx !== -1) {
    profiles[idx].status = status;
    store.set('profiles', profiles);
    mainWindow?.webContents.send('profile:statusChanged', { profileId, status });
  }
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';

  // ── Reset stale "running" status from a previous force-close ──
  // runningInstances is in-memory only; on relaunch it's empty.
  // Any profile still marked "running" in the store is a ghost — reset it.
  const profiles = store.get('profiles', []);
  const hadStale = profiles.some(p => p.status === 'running');
  if (hadStale) {
    store.set('profiles', profiles.map(p =>
      p.status === 'running' ? { ...p, status: 'stopped' } : p
    ));
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const [, inst] of runningInstances) { try { inst.process.kill(); } catch {} }
  for (const [profileId] of tempFiles) { cleanupTempFile(profileId); }
  if (!IS_MAC) app.quit();
});

app.on('before-quit', () => {
  for (const [, inst] of runningInstances) { try { inst.process.kill(); } catch {} }
  for (const [profileId] of tempFiles) { cleanupTempFile(profileId); }
});