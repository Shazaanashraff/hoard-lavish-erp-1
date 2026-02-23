const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

const isDev = !app.isPackaged;
let mainWindow = null;

function sendToRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 600,
        title: 'Hoard Lavish ERP',
        icon: path.join(__dirname, '../public/icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        autoHideMenuBar: true,
        show: false,
    });

    // Show window when ready to avoid visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        // Open DevTools in dev mode
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    // Check for updates in production only
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

// ─── Auto-Updater Events ───────────────────────────────
autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    sendToRenderer('update-available', { version: info.version });
});

autoUpdater.on('update-not-available', () => {
    log.info('App is up to date.');
    sendToRenderer('update-not-available', {});
});

autoUpdater.on('download-progress', (progress) => {
    log.info(`Download speed: ${progress.bytesPerSecond} - ${Math.round(progress.percent)}%`);
    sendToRenderer('update-download-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
    });
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    sendToRenderer('update-downloaded', { version: info.version });
});

autoUpdater.on('error', (err) => {
    log.error('AutoUpdater error:', err);
    sendToRenderer('update-error', { message: err.message || String(err) });
});

// ─── IPC Handlers ──────────────────────────────────────
ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
