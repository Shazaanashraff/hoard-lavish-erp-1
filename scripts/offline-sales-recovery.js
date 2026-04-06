(() => {
  const STORAGE_KEY = "hoard_data_v2";
  const TARGET_BRANCH = "Ethul Kotte";
  const TARGET_DATE = "2026-04-05"; // YYYY-MM-DD (Asia/Colombo local business date)

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    console.error("No local storage data found for key:", STORAGE_KEY);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse local storage JSON:", e);
    return;
  }

  const sales = Array.isArray(parsed?.salesHistory) ? parsed.salesHistory : [];
  if (sales.length === 0) {
    console.warn("No salesHistory found in local storage.");
    return;
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const sqlText = (v) => {
    if (v === null || v === undefined) return "NULL";
    return "'" + String(v).replace(/'/g, "''") + "'";
  };

  const sqlNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : String(fallback);
  };

  const sqlUuidOrNull = (v) => {
    if (!v) return "NULL";
    const s = String(v).trim();
    return uuidRe.test(s) ? sqlText(s) + "::uuid" : "NULL";
  };

  const getBusinessDate = (dateValue) => {
    if (!dateValue) return "";
    const s = String(dateValue);
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(d);
  };

  const filtered = sales.filter((s) => {
    const branchOk = String(s?.branchName || "").trim() === TARGET_BRANCH;
    const dateOk = getBusinessDate(s?.date) === TARGET_DATE;
    return branchOk && dateOk;
  });

  if (filtered.length === 0) {
    console.warn("No matching offline sales found for branch/date.", {
      TARGET_BRANCH,
      TARGET_DATE
    });
    return;
  }

  const statements = filtered.map((sale) => {
    const items = Array.isArray(sale?.items) ? sale.items : [];

    const payloadItems = items.map((item) => ({
      product_id: item?.id ?? null,
      product_name: item?.name ?? "",
      quantity: Number(item?.quantity ?? 0),
      price: Number(item?.price ?? 0),
      cost_price: Number(item?.costPrice ?? 0),
      discount: Number(item?.discount ?? 0),
      sku: item?.sku ?? "",
      size: item?.size ?? "",
      color: item?.color ?? "",
      barcode: item?.barcode ?? "",
      barcode2: item?.barcode2 ?? ""
    }));

    const itemsJsonEscaped = JSON.stringify(payloadItems).replace(/'/g, "''");

    const invoice = sqlText(sale?.invoiceNumber);
    const saleDate = sqlText(sale?.date) + "::timestamptz";
    const subtotal = sqlNum(sale?.subtotal);
    const discount = sqlNum(sale?.discount);
    const tax = sqlNum(sale?.tax);
    const totalAmount = sqlNum(sale?.totalAmount);
    const totalCost = sqlNum(sale?.totalCost);
    const paymentMethod = sqlText(sale?.paymentMethod || "Cash") + "::payment_method";
    const customerId = sqlUuidOrNull(sale?.customerId);
    const customerName = sqlText(sale?.customerName);
    const branchId = sqlUuidOrNull(sale?.branchId);
    const branchName = sqlText(sale?.branchName);
    const cashAmount = sale?.cashAmount === undefined || sale?.cashAmount === null ? "NULL" : sqlNum(sale.cashAmount);
    const cardAmount = sale?.cardAmount === undefined || sale?.cardAmount === null ? "NULL" : sqlNum(sale.cardAmount);

    return [
      "DO $$",
      "BEGIN",
      `  IF NOT EXISTS (SELECT 1 FROM sales WHERE invoice_number = ${invoice}) THEN`,
      "    PERFORM fn_complete_sale(",
      `      ${invoice},`,
      `      ${saleDate},`,
      `      ${subtotal},`,
      `      ${discount},`,
      `      ${tax},`,
      `      ${totalAmount},`,
      `      ${totalCost},`,
      `      ${paymentMethod},`,
      `      ${customerId},`,
      `      ${customerName},`,
      `      ${branchId},`,
      `      ${branchName},`,
      `      '${itemsJsonEscaped}'::jsonb,`,
      `      ${cashAmount},`,
      `      ${cardAmount}`,
      "    );",
      "  END IF;",
      "END $$;"
    ].join("\n");
  });

  const header = [
    "-- Generated offline recovery SQL",
    `-- Source key: ${STORAGE_KEY}`,
    `-- Filter: branch='${TARGET_BRANCH}', date='${TARGET_DATE}'`,
    `-- Matched sales: ${filtered.length}`,
    ""
  ].join("\n");

  const sql = header + statements.join("\n\n") + "\n";

  console.log("=== OFFLINE RECOVERY SQL START ===");
  console.log(sql);
  console.log("=== OFFLINE RECOVERY SQL END ===");

  window.offlineRecoverySql = sql;
  console.log("Saved to window.offlineRecoverySql");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(sql)
      .then(() => console.log("SQL copied to clipboard."))
      .catch(() => console.warn("Clipboard copy failed. Use window.offlineRecoverySql"));
  }
})();
