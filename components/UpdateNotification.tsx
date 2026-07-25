import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, X, CheckCircle, AlertCircle } from 'lucide-react';

type UpdateStage = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

const UpdateNotification: React.FC = () => {
  const [stage, setStage] = useState<UpdateStage>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return; // Not running in Electron

    api.onUpdateAvailable((data) => {
      setVersion(data.version);
      setStage('available');
      setDismissed(false);
    });

    api.onUpdateDownloadProgress((data) => {
      setStage('downloading');
      setProgress(data.percent);
    });

    api.onUpdateDownloaded((data) => {
      setVersion(data.version);
      setStage('downloaded');
      setDismissed(false);
    });

    api.onUpdateError((data) => {
      setErrorMsg(data.message);
      setStage('error');
      setDismissed(false);
    });

    api.onUpdateNotAvailable(() => {
      setStage('idle');
    });

    return () => {
      api.removeUpdateListeners();
    };
  }, []);

  if (stage === 'idle' || dismissed) return null;

  const handleInstall = () => {
    window.electronAPI?.installUpdate();
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  return (
    <div
      className="fixed bottom-6 right-6 left-6 sm:left-auto z-[9999] animate-slide-up"
      style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full sm:w-96 overflow-hidden">
        {/* Header */}
        <div className={`px-4 py-3 flex items-center justify-between ${
          stage === 'error' ? 'bg-red-50' : 
          stage === 'downloaded' ? 'bg-green-50' : 'bg-blue-50'
        }`}>
          <div className="flex items-center gap-2">
            {stage === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-600" />
            ) : stage === 'downloaded' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : stage === 'downloading' ? (
              <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
            ) : (
              <Download className="w-5 h-5 text-blue-600" />
            )}
            <span className={`font-semibold text-sm ${
              stage === 'error' ? 'text-red-800' : 
              stage === 'downloaded' ? 'text-green-800' : 'text-blue-800'
            }`}>
              {stage === 'available' && 'Update Available'}
              {stage === 'downloading' && 'Downloading Update'}
              {stage === 'downloaded' && 'Update Ready'}
              {stage === 'error' && 'Update Error'}
            </span>
          </div>
          {stage !== 'downloading' && (
            <button onClick={handleDismiss} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {stage === 'available' && (
            <p className="text-sm text-slate-600">
              A new version <span className="font-semibold text-slate-800">v{version}</span> is available and downloading in the background.
            </p>
          )}

          {stage === 'downloading' && (
            <div>
              <p className="text-sm text-slate-600 mb-2">
                Downloading version <span className="font-semibold text-slate-800">v{version}</span>...
              </p>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1 text-right">{progress}%</p>
            </div>
          )}

          {stage === 'downloaded' && (
            <div>
              <p className="text-sm text-slate-600 mb-3">
                Version <span className="font-semibold text-slate-800">v{version}</span> has been downloaded. Restart the application to apply the update.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Restart &amp; Update
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <p className="text-sm text-red-600">
              Failed to check for updates: {errorMsg}
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default UpdateNotification;
