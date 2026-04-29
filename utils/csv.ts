export const CSV_COLUMNS = ['name','category','brand','sku','price','costPrice','initialStock','minStockLevel','description','color','size','barcode','barcode2'];
export const CSV_REQUIRED = ['name','category','brand','sku','price','costPrice'];
export const CSV_SAMPLE = ['White Polo Shirt','Shirts','Polo','SKU-001','1500','900','10','5','Classic white polo shirt','White','M','2001234567890',''];

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
    const vals = values.map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}
