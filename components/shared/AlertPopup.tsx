import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface AlertPopupProps {
  message: string;
  type?: 'error' | 'warning';
  title?: string;
  onClose: () => void;
}

const AlertPopup: React.FC<AlertPopupProps> = ({ message, type = 'error', title, onClose }) => {
  const defaultTitle = type === 'error' ? 'Stock Limit Reached' : 'Warning';
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className={`p-4 flex items-center gap-3 ${type === 'error' ? 'bg-red-50' : 'bg-amber-50'}`}>
          <div className={`p-2 rounded-full ${type === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h4 className={`font-bold text-sm ${type === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
              {title ?? defaultTitle}
            </h4>
            <p className="text-sm text-slate-600 mt-0.5">{message}</p>
          </div>
        </div>
        <div className="p-3 flex justify-end bg-white border-t border-slate-100">
          <button
            onClick={onClose}
            className={`px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors ${type === 'error' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertPopup;
