import React from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import Inventory from './components/Inventory';
import SalesHistory from './components/SalesHistory';
import Branches from './components/Branches';
import Suppliers from './components/Suppliers';
import Accounting from './components/Accounting';
import Customers from './components/Customers';
import Settings from './components/Settings';
import LoginPage from './components/LoginPage';

// Main Layout Component handling the view switching
const Layout: React.FC = () => {
  const { currentView, currentUser } = useStore();
  const role = currentUser?.role || 'CASHIER';

  const renderView = () => {
    // Role-based view guards
    if (currentView === 'SETTINGS' && role !== 'ADMIN') return <Dashboard />;
    if (currentView === 'BRANCHES' && role !== 'ADMIN') return <Dashboard />;
    if (currentView === 'SUPPLIERS' && role === 'CASHIER') return <Dashboard />;
    if (currentView === 'ACCOUNTING' && role === 'CASHIER') return <Dashboard />;

    switch (currentView) {
      case 'DASHBOARD':
        return <Dashboard />;
      case 'POS':
        return <POS />;
      case 'INVENTORY':
        return <Inventory />;
      case 'CUSTOMERS':
        return <Customers />;
      case 'SUPPLIERS':
        return <Suppliers />;
      case 'ACCOUNTING':
        return <Accounting />;
      case 'HISTORY':
        return <SalesHistory />;
      case 'BRANCHES':
        return <Branches />;
      case 'SETTINGS':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden relative">
        {renderView()}
      </main>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { currentUser } = useStore();

  if (!currentUser) {
    return <LoginPage />;
  }

  return <Layout />;
};

const App: React.FC = () => {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
};

export default App;

