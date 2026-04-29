import React from 'react';

interface TabButtonProps<T extends string> {
  id: T;
  label: string;
  activeTab: T;
  onSelect: (id: T) => void;
}

function TabButton<T extends string>({ id, label, activeTab, onSelect }: TabButtonProps<T>) {
  return (
    <button
      onClick={() => onSelect(id)}
      className={`px-4 py-2 border-b-2 font-medium text-sm transition-colors ${
        activeTab === id
          ? 'border-slate-900 text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  );
}

export default TabButton;
