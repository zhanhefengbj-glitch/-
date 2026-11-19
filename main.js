const path = require('node:path');
const { readFile } = require('node:fs/promises');
const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Menu,
  Tray,
  nativeImage,
} = require('electron');

app.disableHardwareAcceleration();

const ALLOWED_ASSETS = new Set(['idle.png', 'smile.png', 'cold.png']);
const IMAGE_KEYS = new Set(['idle', 'smile', 'cold']);
const HIT_POLL_INTERVAL = 40;

let dragOffset = null;
let tray = null;
let isQuitting = false;
let hitPollTimer = null;
let interactive = null;
let currentImageKey = 'idle';

// key -> { width, height, alpha: Uint8Array }
const alphaMasks = new Map();

function getPetWindow() {
  return BrowserWindow.getAllWindows()[0];
}

function showPet() {
  const win = getPetWindow();
  if (win) {
    win.show();
    win.focus();
  } else {
    createWindow();
  }
}

function hidePet() {
  const win = getPetWindow();
  if (win) win.hide();
}

function quitPet() {
  isQuitting = true;
  app.quit();
}

function setInteractive(win, next) {
  if (next === interactive) return;

  interactive = next;
  // 穿透时开启 forward，保证渲染进程仍能收到鼠标移动事件
  win.setIgnoreMouseEvents(!next, { forward: true });
}

function getAlphaAt(clientX, clientY, win, mask) {
  const bounds = win.getContentBounds();
  const scale = Math.min(
    bounds.width / mask.width,
    bounds.height / mask.height,
  );

  if (!Number.isFinite(scale) || scale <= 0) return 0;

  const drawWidth = mask.width * scale;
  const drawHeight = mask.height * scale;
  const left = bounds.x + (bounds.width - drawWidth) / 2;
  const top = bounds.y + (bounds.height - drawHeight) / 2;

  if (
    clientX < left ||
    clientX >= left + drawWidth ||
    clientY < top ||
    clientY >= top + drawHeight
  ) {
    return 0;
  }

  const x = Math.floor((clientX - left) / scale);
  const y = Math.floor((clientY - top) / scale);

  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return 0;

  return mask.alpha[y * mask.width + x];
}

function updateHitState() {
  const win = getPetWindow();
  if (!win || !win.isVisible() || dragOffset) return;

  const mask = alphaMasks.get(currentImageKey);

  // 掩码尚未就绪时保持可交互，避免无法点击
  if (!mask) {
    setInteractive(win, true);
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  setInteractive(win, getAlphaAt(cursor.x, cursor.y, win, mask) > 10);
}

function startHitPolling(win) {
  if (hitPollTimer) clearInterval(hitPollTimer);

  hitPollTimer = setInterval(updateHitState, HIT_POLL_INTERVAL);
  win.on('closed', () => {
    if (hitPollTimer) clearInterval(hitPollTimer);
    hitPollTimer = null;
    interactive = null;
  });
}

ipcMain.on('pet-alpha-mask', (_event, key, width, height, alpha) => {
  if (!IMAGE_KEYS.has(key) || !alpha) return;

  alphaMasks.set(key, {
    width,
    height,
    alpha: Uint8Array.from(alpha),
  });

  updateHitState();
});

ipcMain.on('pet-image-key', (_event, key) => {
  if (!IMAGE_KEYS.has(key)) return;

  currentImageKey = key;
  updateHitState();
});

ipcMain.on('pet-drag-start', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  const cursor = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  dragOffset = { x: cursor.x - x, y: cursor.y - y };
  setInteractive(win, true);
});

ipcMain.on('pet-drag-move', (event) => {
  if (!dragOffset) return;

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  const cursor = screen.getCursorScreenPoint();
  win.setPosition(cursor.x - dragOffset.x, cursor.y - dragOffset.y);
});

ipcMain.on('pet-drag-end', () => {
  dragOffset = null;
});

ipcMain.handle('pet-get-asset', async (_event, name) => {
  if (!ALLOWED_ASSETS.has(name)) {
    throw new Error(`不允许读取的图片：${name}`);
  }

  return readFile(path.join(__dirname, 'assets', name));
});

ipcMain.on('pet-context-menu', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  Menu.buildFromTemplate([
    { label: '隐藏桌宠', click: hidePet },
    { label: '退出桌宠', click: quitPet },
  ]).popup({ window: win });
});

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, 'assets', 'idle.png'),
  );

  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('我的桌宠');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示桌宠', click: showPet },
      { label: '隐藏桌宠', click: hidePet },
      { type: 'separator' },
      { label: '退出桌宠', click: quitPet },
    ]),
  );

  tray.on('click', () => {
    const win = getPetWindow();
    if (win && win.isVisible()) {
      hidePet();
    } else {
      showPet();
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 300,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  interactive = false;
  startHitPolling(win);

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', showPet);
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
