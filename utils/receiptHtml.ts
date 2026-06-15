import { SalesRecord, ExchangeRecord } from '../types';
import { parseBusinessDate } from './dateTime';

export interface ReceiptOptions {
  cashierName: string;
  logoUrl: string;
  withPrintScript?: boolean;
}

// ── shared helpers ──────────────────────────────────────────────────────────

const fmtRs = (n: number) =>
  `Rs. ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function buildFooterDate(): string {
  const now = new Date();
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${now.getFullYear()}.${MONTHS[now.getMonth()]}.${String(now.getDate()).padStart(2,'0')} AD ${now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}`;
}

function buildBarcodeHtml(numericStr: string): string {
  const s = numericStr.replace(/\D/g,'').slice(-4).padStart(4,'0');
  let h = '<div style="display:flex;align-items:flex-end;justify-content:center;gap:0;">';
  h += '<div style="width:3px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div><div style="width:2px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div>';
  for (let i = 0; i < 32; i++) {
    const d = parseInt(s[i % s.length]) || (i % 5);
    h += `<div style="width:${(d%3)+1}px;height:${i%3===0?50:48}px;background:#000;"></div>`;
    h += `<div style="width:${(d%2)+1}px;height:${i%3===0?50:48}px;background:#fff;"></div>`;
  }
  h += '<div style="width:2px;height:50px;background:#000;"></div><div style="width:1px;height:50px;background:#fff;"></div><div style="width:3px;height:50px;background:#000;"></div></div>';
  return h;
}

const SHARED_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,Helvetica,sans-serif; width:70mm; margin:0 auto; padding:0; background:#fff; color:#000; font-size:12px; }
.wrap { width:100%; padding:2mm 4mm 8mm 2mm; }
.logo-wrap { text-align:center; margin:2px 0 4px; }
.logo-wrap img { width:52mm; max-width:100%; height:auto; display:block; margin:0 auto; }
.store-info { text-align:center; font-size:11.5px; line-height:1.6; margin-bottom:6px; }
.receipt-fields { font-size:12px; line-height:1.8; margin-bottom:4px; }
.receipt-fields span { font-weight:700; }
table.items { width:100%; border-collapse:collapse; }
table.items thead th { font-size:11px; font-weight:700; padding:4px 0; border-top:2px solid #000; border-bottom:2px solid #000; }
.th-item { text-align:left; width:42%; }
.th-price { text-align:right; width:22%; }
.th-qty { text-align:center; width:8%; }
.th-total { text-align:right; width:22%; }
table.totals { width:100%; border-collapse:collapse; }
table.totals td { font-size:12px; padding:3px 0; }
table.totals .lbl { text-align:right; padding-right:8px; }
table.totals .val { text-align:right; white-space:nowrap; }
.grand td { font-size:14px; font-weight:900; padding:4px 0; }
.divider { border-top:2px solid #000; margin:5px 0; }
.divider-dot { border-top:1px dotted #999; margin:5px 0; }
.tender { font-size:12px; padding:2px 0; }
.total-items { font-size:12px; padding:3px 0; }
.disc-total { text-align:center; font-weight:700; font-size:13px; padding:5px 0; }
.footer-note { text-align:center; font-size:10px; color:#111; line-height:1.5; margin:5px 0; }
.footer-box { background:#1c1c1c; color:#fff; text-align:center; font-size:15px; font-weight:700; padding:8px 4px; margin:8px 0 5px; }
.barcode-wrap { text-align:center; margin-top:6px; }
.barcode-num { font-size:11px; letter-spacing:2px; margin-top:4px; font-family:'Courier New',monospace; }
.credit { text-align:center; font-size:10px; color:#444; margin-top:7px; line-height:1.6; }
@media print { body { margin:0 auto; padding:0; } .wrap { padding:2mm 4mm 7mm 2mm; } @page { size:70mm auto; margin:0; } }
`.trim();

const STORE_HEADER = (logoUrl: string) => `
<div class="logo-wrap"><img src="${logoUrl}" alt="Hoard Lavish"/></div>
<div class="store-info">
  Veediya Bandara Rd, EthulKotte<br>
  Tel : 074 177 4321<br>
  Web : www.hoardlavish.com
</div>`;

const EXCHANGE_POLICY = `
<div class="footer-note">
  For any exchange please produce the bill the<br>
  garment within original tag intact within 07 days<br>
  <strong>NO EXCHANGE OR RETURN ACCEPTED FOR<br>
  ITEM SOLD IN OFFERS AND SALE</strong>
</div>`;

// ── sale receipt ─────────────────────────────────────────────────────────────

export function buildSaleReceiptHtml(sale: SalesRecord, opts: ReceiptOptions): string {
  const { cashierName, logoUrl, withPrintScript = false } = opts;

  const sd = parseBusinessDate(sale.date);
  const metaDate = `${String(sd.getDate()).padStart(2,'0')}/${String(sd.getMonth()+1).padStart(2,'0')}/${sd.getFullYear()} ${sd.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}`;

  const discountPercent = sale.subtotal > 0 ? ((sale.discount / sale.subtotal) * 100).toFixed(2) : '0.00';
  const totalSavings = sale.items.reduce((s, i) => s + (i.discount || 0) * i.quantity, 0) + sale.discount;
  const totalItems = sale.items.reduce((s, i) => s + i.quantity, 0);

  const barcodeStr = sale.invoiceNumber.replace(/\D/g,'').slice(-4).padStart(4,'0');

  const itemsHtml = sale.items.map(item => {
    const discountedTotal = (item.price - (item.discount || 0)) * item.quantity;
    const variantLine = [item.size, item.color].filter(Boolean).join(' / ');
    return `<tr>
      <td style="padding:7px 0;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;line-height:1.4;"><strong>${item.name}</strong>${variantLine ? `<br><span style="font-size:11px;color:#555;">${variantLine}</span>` : ''}</td>
      <td style="padding:7px 3px;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.price.toFixed(2)}</td>
      <td style="padding:7px 3px;text-align:center;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.quantity}</td>
      <td style="padding:7px 0;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${discountedTotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head>
<title>Receipt ${sale.invoiceNumber}</title>
<meta charset="utf-8"/>
<style>${SHARED_CSS}</style>
</head><body>
<div class="wrap">
${STORE_HEADER(logoUrl)}

<div class="divider-dot"></div>

<div class="receipt-fields">
  <div><span>Date &amp; Time :</span> ${metaDate}</div>
  <div><span>Invoice No&nbsp;&nbsp;&nbsp;:</span> ${sale.invoiceNumber}</div>
  ${sale.customerName ? `<div><span>Customer&nbsp;&nbsp;&nbsp;&nbsp;:</span> ${sale.customerName}</div>` : ''}
  <div><span>Cashier&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</span> ${cashierName}</div>
</div>

<div class="divider-dot"></div>

<table class="items">
  <thead>
    <tr>
      <th class="th-item">Product</th>
      <th class="th-price">Org Price<br>Rs.</th>
      <th class="th-qty">Qty</th>
      <th class="th-total">Amount<br>Rs.</th>
    </tr>
  </thead>
  <tbody>${itemsHtml}</tbody>
</table>

<div class="divider"></div>

<table class="totals">
  <tr><td class="lbl">Sub Total</td><td class="val">${fmtRs(sale.subtotal)}</td></tr>
  <tr><td class="lbl">Discount ${discountPercent}%</td><td class="val">${fmtRs(sale.discount)}</td></tr>
</table>

<div class="divider"></div>

<table class="totals">
  <tr class="grand"><td class="lbl">TOTAL AMOUNT</td><td class="val">${fmtRs(sale.totalAmount)}</td></tr>
</table>

<div class="divider"></div>

<div class="tender">Payment Type : ${sale.paymentMethod}</div>
${sale.paymentMethod === 'Cash+Card'
  ? `<div class="tender">Cash: ${fmtRs(sale.cashAmount || 0)}</div><div class="tender">Card: ${fmtRs(sale.cardAmount || 0)}</div>`
  : ''}
<div class="total-items">Total Items : ${totalItems}</div>

<div class="divider-dot"></div>

<div class="disc-total">Total Savings: ${fmtRs(totalSavings)}</div>

<div class="divider-dot"></div>

${EXCHANGE_POLICY}

<div class="footer-box">*** Thank You, Come Again ***</div>

<div class="barcode-wrap">
  ${buildBarcodeHtml(barcodeStr)}
  <div class="barcode-num">${barcodeStr}</div>
</div>

<div class="credit">
  Hoard Lavish Pvt Ltd<br>
  ${buildFooterDate()}
</div>
</div>
${withPrintScript ? '<script>window.onload=function(){window.print();};<\/script>' : ''}
</body></html>`;
}

// ── exchange receipt ──────────────────────────────────────────────────────────

export function buildExchangeReceiptHtml(exchange: ExchangeRecord, opts: ReceiptOptions): string {
  const { cashierName, logoUrl, withPrintScript = false } = opts;

  const sd = parseBusinessDate(exchange.date);
  const metaDate = `${String(sd.getDate()).padStart(2,'0')}/${String(sd.getMonth()+1).padStart(2,'0')}/${sd.getFullYear()} ${sd.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}`;

  const discountPercent = exchange.returnedTotal > 0
    ? (((exchange.exchangeBillDiscount || 0) / exchange.returnedTotal) * 100).toFixed(2)
    : '0.00';

  const barcodeStr = exchange.exchangeNumber.replace(/\D/g,'').slice(-4).padStart(4,'0');

  const makeItemRow = (item: ExchangeRecord['returnedItems'][number]) => {
    const variantLine = [item.size, item.color].filter(Boolean).join(' / ');
    const price = item.effectiveUnitPrice ?? item.price;
    const total = item.lineEffectiveTotal ?? (price * item.quantity);
    return `<tr>
      <td style="padding:7px 0;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;line-height:1.4;"><strong>${item.name}</strong>${variantLine ? `<br><span style="font-size:11px;color:#555;">${variantLine}</span>` : ''}</td>
      <td style="padding:7px 3px;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${price.toFixed(2)}</td>
      <td style="padding:7px 3px;text-align:center;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${item.quantity}</td>
      <td style="padding:7px 0;text-align:right;font-size:13px;border-bottom:1px dotted #bbb;vertical-align:top;">${fmtRs(total)}</td>
    </tr>`;
  };

  const returnedItemsHtml = exchange.returnedItems.map(makeItemRow).join('');
  const newItemsHtml = exchange.newItems.map(makeItemRow).join('');

  const itemTableHeaders = `<thead><tr>
    <th class="th-item">Product</th>
    <th class="th-price">Price<br>Rs.</th>
    <th class="th-qty">Qty</th>
    <th class="th-total">Amount<br>Rs.</th>
  </tr></thead>`;

  return `<!DOCTYPE html>
<html><head>
<title>Exchange ${exchange.exchangeNumber}</title>
<meta charset="utf-8"/>
<style>${SHARED_CSS}</style>
</head><body>
<div class="wrap">
${STORE_HEADER(logoUrl)}

<div class="divider-dot"></div>

<div class="receipt-fields">
  <div><span>Date &amp; Time :</span> ${metaDate}</div>
  <div><span>Exch. No&nbsp;&nbsp;&nbsp;&nbsp;:</span> ${exchange.exchangeNumber}</div>
  <div><span>Orig. Invoice:</span> ${exchange.originalInvoiceNumber || 'N/A'}</div>
  ${exchange.customerName ? `<div><span>Customer&nbsp;&nbsp;&nbsp;&nbsp;:</span> ${exchange.customerName}</div>` : ''}
  <div><span>Cashier&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</span> ${cashierName}</div>
</div>

<div class="divider-dot"></div>

${exchange.returnedItems.length > 0 ? `
<table class="items">
  ${itemTableHeaders}
  <tbody>${returnedItemsHtml}</tbody>
</table>
<div class="tender" style="text-align:right;font-weight:700;color:#b91c1c;">Returned Total: -${fmtRs(exchange.returnedTotal)}</div>
<div class="divider"></div>
` : ''}

${exchange.newItems.length > 0 ? `
<table class="items">
  ${itemTableHeaders.replace('Product','New Item')}
  <tbody>${newItemsHtml}</tbody>
</table>
<div class="tender" style="text-align:right;font-weight:700;color:#166534;">New Items Total: ${fmtRs(exchange.newTotal)}</div>
<div class="divider"></div>
` : ''}

<table class="totals">
  <tr><td class="lbl">Returned Value</td><td class="val">-${fmtRs(exchange.returnedTotal)}</td></tr>
  <tr><td class="lbl">New Items Value</td><td class="val">${fmtRs(exchange.newTotal)}</td></tr>
  ${exchange.exchangeBillDiscount ? `<tr><td class="lbl">Exchange Discount</td><td class="val">-${fmtRs(exchange.exchangeBillDiscount)}</td></tr>` : ''}
</table>

<div class="divider"></div>

<table class="totals">
  <tr class="grand"><td class="lbl">EXCHANGE TOTAL</td><td class="val">${fmtRs(Math.abs(exchange.difference))}</td></tr>
</table>

<div class="tender">${exchange.difference >= 0 ? 'Customer Pays' : 'Customer Credit'}: ${fmtRs(Math.abs(exchange.difference))}</div>
${exchange.settlementType ? `<div class="tender">Settlement: ${exchange.settlementType}</div>` : ''}
<div class="tender">Payment: ${exchange.paymentMethod}${exchange.refundMethod ? ` | Refund: ${exchange.refundMethod}` : ''}</div>

<div class="divider-dot"></div>

<div class="disc-total">Exchange Discount: ${fmtRs(exchange.exchangeBillDiscount || 0)} (${discountPercent}%)</div>

<div class="divider-dot"></div>

${EXCHANGE_POLICY}

<div class="footer-box">*** Thank You, Come Again ***</div>

<div class="barcode-wrap">
  ${buildBarcodeHtml(barcodeStr)}
  <div class="barcode-num">${barcodeStr}</div>
</div>

<div class="credit">
  Hoard Lavish Pvt Ltd<br>
  ${buildFooterDate()}
</div>
</div>
${withPrintScript ? '<script>window.onload=function(){window.print();};<\/script>' : ''}
</body></html>`;
}

// ── open in print window (web fallback) ──────────────────────────────────────

export function openReceiptWindow(html: string): boolean {
  const win = window.open('', '_blank', 'width=400,height=700');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}
