(() => {
  // Run in browser DevTools on the ERP app page.
  // It generates SQL to insert ONE missing supplier transaction
  // and never writes stock tables.

  const STORAGE_KEY = 'hoard_data_v2';

  const CONFIG = {
    branchName: 'Ethul Kotte',
    supplierName: 'REPLACE_WITH_SUPPLIER_NAME',
    supplierId: '', // optional; leave blank to auto-resolve from local suppliers by name
    transactionDateIso: '2026-04-06T00:00:00.000Z',
    reference: 'RECOVERY-SUPPLIER-2026-04-06-ETHULKOTTE-01',
    notesPrefix: 'Recovered supplier expense from historical stock adjustments. No stock was re-applied.',
    affectsAccounting: false,
  };

  // If unitPrice is null, script tries to resolve from local products costPrice.
  const RECOVERY_ITEMS = [
    { productName: 'ZYT - XL', quantity: 6, unitPrice: null, detail: 'Size: XL' },
    { productName: 'KNITTED -XXL', quantity: 17, unitPrice: null, detail: 'Size: XXL' },
    { productName: 'KNITTED -L', quantity: 10, unitPrice: null, detail: 'Size: L' },
    { productName: 'HST POLO-XL', quantity: 9, unitPrice: null, detail: 'Size: XL' },
    { productName: 'HST POLO -L', quantity: 9, unitPrice: null, detail: 'Size: L' },
    { productName: 'KNITTED -XL', quantity: 18, unitPrice: null, detail: 'Size: XL' },
    { productName: 'HST POLO -XXL', quantity: 9, unitPrice: null, detail: 'Size: XXL' },
    { productName: 'ZYT - L', quantity: 3, unitPrice: null, detail: 'Size: L' },
    { productName: 'HST POLO-M', quantity: 11, unitPrice: null, detail: 'Size: M' },
    { productName: 'ZYT -XXXL', quantity: 13, unitPrice: null, detail: 'Size: XXXL' },
    { productName: 'ZYT -XXL', quantity: 7, unitPrice: null, detail: 'Size: XXL' },
    { productName: 'KNITTED -XXXL', quantity: 13, unitPrice: null, detail: 'Size: XXXL' },
  ];

  const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[-_]/g, '');
  const money = (v) => Number(v || 0).toFixed(2);
  const esc = (s) => String(s || '').replace(/'/g, "''");

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    console.error('No local storage found for key:', STORAGE_KEY);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse local storage JSON:', e);
    return;
  }

  const products = Array.isArray(parsed?.products) ? parsed.products : [];
  const suppliers = Array.isArray(parsed?.suppliers) ? parsed.suppliers : [];

  const supplier = CONFIG.supplierId
    ? suppliers.find((s) => s?.id === CONFIG.supplierId)
    : suppliers.find((s) => normalize(s?.name) === normalize(CONFIG.supplierName));

  const resolvedSupplierId = CONFIG.supplierId || supplier?.id || '';
  const resolvedSupplierName = supplier?.name || CONFIG.supplierName;

  if (!resolvedSupplierId || !resolvedSupplierName || resolvedSupplierName === 'REPLACE_WITH_SUPPLIER_NAME') {
    console.error('Supplier not resolved. Set CONFIG.supplierName (or CONFIG.supplierId) first.');
    return;
  }

  const missingPrice = [];

  const resolvedItems = RECOVERY_ITEMS.map((item) => {
    if (item.unitPrice !== null && Number.isFinite(Number(item.unitPrice))) {
      return { ...item, unitPrice: Number(item.unitPrice) };
    }

    const product = products.find((p) => normalize(p?.name) === normalize(item.productName));
    const unitPrice = Number(product?.costPrice ?? product?.cost_price ?? NaN);

    if (!Number.isFinite(unitPrice)) {
      missingPrice.push(item.productName);
      return { ...item, unitPrice: 0 };
    }

    return { ...item, unitPrice };
  });

  if (missingPrice.length > 0) {
    console.warn('Could not auto-resolve costPrice for:', missingPrice);
    console.warn('Set those RECOVERY_ITEMS[].unitPrice manually, then run again.');
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const itemLines = resolvedItems.map((i) => {
    const lineTotal = i.quantity * i.unitPrice;
    const detailPart = i.detail ? ` (${i.detail})` : '';
    return `- ${i.productName}${detailPart} | Qty: ${i.quantity} | Stock In: +${i.quantity} | Unit: LKR ${money(i.unitPrice)} | Line: LKR ${money(lineTotal)}`;
  });

  const notes = [
    CONFIG.notesPrefix,
    'Items Added:',
    ...itemLines,
  ].join('\n');

  const sql = [
    '-- Supplier expense recovery SQL',
    '-- Safe: inserts only into supplier_transactions (no stock updates).',
    `-- Reference: ${CONFIG.reference}`,
    '',
    'DO $$',
    'BEGIN',
    `  IF NOT EXISTS (SELECT 1 FROM supplier_transactions WHERE reference = '${esc(CONFIG.reference)}') THEN`,
    '    INSERT INTO supplier_transactions (',
    '      supplier_id, supplier_name, date, amount, type, reference, notes, affects_accounting',
    '    ) VALUES (',
    `      '${esc(resolvedSupplierId)}'::uuid,`,
    `      '${esc(resolvedSupplierName)}',`,
    `      '${esc(CONFIG.transactionDateIso)}'::timestamptz,`,
    `      ${money(total)}::numeric,`,
    "      'PAYMENT'::supplier_txn_type,",
    `      '${esc(CONFIG.reference)}',`,
    `      '${esc(notes)}',`,
    `      ${CONFIG.affectsAccounting ? 'TRUE' : 'FALSE'}`,
    '    );',
    '  END IF;',
    'END $$;',
    '',
    `-- Computed total: LKR ${money(total)}`,
  ].join('\n');

  console.log('=== SUPPLIER EXPENSE RECOVERY SQL START ===');
  console.log(sql);
  console.log('=== SUPPLIER EXPENSE RECOVERY SQL END ===');

  window.supplierExpenseRecoverySql = sql;
  window.supplierExpenseRecoverySummary = {
    supplierId: resolvedSupplierId,
    supplierName: resolvedSupplierName,
    transactionDateIso: CONFIG.transactionDateIso,
    reference: CONFIG.reference,
    items: resolvedItems,
    total,
    missingPrice,
  };

  console.log('Saved SQL to window.supplierExpenseRecoverySql');
  console.log('Saved summary to window.supplierExpenseRecoverySummary');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(sql)
      .then(() => console.log('SQL copied to clipboard.'))
      .catch(() => console.warn('Clipboard copy failed. Use window.supplierExpenseRecoverySql'));
  }
})();
