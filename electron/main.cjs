const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// GitHub token for private repo auto-updates
const GH_TOKEN = process.env.GH_TOKEN || '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';
if (GH_TOKEN) {
    autoUpdater.requestHeaders = { Authorization: `token ${GH_TOKEN}` };
    log.info('Auto-updater: Using GitHub token for private repo access.');
} else {
    log.warn('Auto-updater: No GH_TOKEN found. Updates from private repos will fail.');
}

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

ipcMain.on('silent-print', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.print({ silent: true, printBackground: true });
    }
});

// ─── Logo as base64 for receipts ─────────────────────────
const fs = require('fs');
ipcMain.handle('get-logo-base64', () => {
    // In production: dist/logo.png sits next to index.html (one level up from dist-electron)
    // In dev: public/logo.png
    const candidates = [
        path.join(__dirname, '../dist/logo.png'),
        path.join(__dirname, '../public/logo.png'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            const data = fs.readFileSync(p);
            return 'data:image/png;base64,' + data.toString('base64');
        }
    }
    return '';
});

// ─── Silent Thermal Receipt Printing ───────────────────
ipcMain.handle('get-printers', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return await mainWindow.webContents.getPrintersAsync();
    }
    return [];
});

ipcMain.handle('print-receipt', async (_event, html, printerName, options) => {
    return new Promise((resolve) => {
        // Create a hidden off-screen window to render & print the receipt
        const printWin = new BrowserWindow({
            width: 600,
            height: 900,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        printWin.webContents.once('did-finish-load', () => {
            const printOptions = {
                silent: true,
                printBackground: true,
                color: false,
                margins: { marginType: 'none' },
            };

            // Only set a fixed pageSize when a width is explicitly supplied (receipts = 80mm).
            // For barcode labels, omit pageSize so the printer driver uses its own configured
            // paper size (i.e. whatever label is loaded in the XP-T451B).
            if (options && options.pageWidthMm) {
                printOptions.pageSize = {
                    width: Math.round(options.pageWidthMm * 1000),
                    height: 2970000, // tall enough for any receipt
                };
            }

            // Attach printer name only when one is configured
            if (printerName && printerName.trim()) {
                printOptions.deviceName = printerName.trim();
            }

            printWin.webContents.print(printOptions, (success, errorType) => {
                printWin.destroy();
                resolve({ success, errorType: errorType || null });
            });
        });

        // Safety timeout — destroy window if it hangs
        setTimeout(() => {
            if (!printWin.isDestroyed()) {
                printWin.destroy();
                resolve({ success: false, errorType: 'timeout' });
            }
        }, 15000);
    });
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
