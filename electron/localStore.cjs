// Main-process-only persistent key/value store, backed by electron-store.
// Must run here (not in the renderer) because contextIsolation + nodeIntegration:false
// mean `require('electron-store')` never works inside the renderer bundle.
const Store = require('electron-store');

const store = new Store({
    name: 'hoard_app_data',
    defaults: {
        categories: { records: [], lastSyncedAt: null },
        brands: { records: [], lastSyncedAt: null },
    },
});

function getNamespace(namespace) {
    return store.get(namespace);
}

function setNamespace(namespace, value) {
    store.set(namespace, value);
}

module.exports = { getNamespace, setNamespace, storePath: store.path };
