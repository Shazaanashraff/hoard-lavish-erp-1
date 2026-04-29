/// <reference types="vite/client" />

export interface ElectronAPI {
  platform: string;
  onUpdateAvailable: (callback: (data: { version: string }) => void) => void;
  onUpdateNotAvailable: (callback: (data: object) => void) => void;
  onUpdateDownloadProgress: (callback: (data: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
  onUpdateDownloaded: (callback: (data: { version: string }) => void) => void;
  onUpdateError: (callback: (data: { message: string }) => void) => void;
  installUpdate: () => void;
  checkForUpdates: () => void;
  removeUpdateListeners: () => void;
  silentPrint: () => void;
}

declare global {
  const __APP_VERSION__: string;
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
