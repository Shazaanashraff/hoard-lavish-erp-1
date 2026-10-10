import React, { useMemo, useRef, useState } from 'react';
import { Search, Camera } from 'lucide-react';
import { Product } from '../../types';
import CameraScanner from '../POS/CameraScanner';

interface ProductScanSearchProps {
  products: Product[];
  onSelect: (product: Product) => void;
  placeholder?: string;
  /** Minimum pause between two accepted scans (USB gun or camera), in ms. */
  scanCooldownMs?: number;
}

type Feedback = { text: string; tone: 'success' | 'error' };

const MAX_SUGGESTIONS = 8;

export const findProductByCode = (products: Product[], code: string): Product | undefined => {
  const v = code.trim().toLowerCase();
  if (!v) return undefined;
  return products.find(p =>
    p.sku?.toLowerCase() === v ||
    (p.barcode && p.barcode.toLowerCase() === v) ||
    (p.barcode2 && p.barcode2.toLowerCase() === v)
  );
};

const describe = (p: Product) =>
  `${p.name}${p.size || p.color ? ` (${[p.size, p.color].filter(Boolean).join(', ')})` : ''}`;

/**
 * Search-by-typing OR scan-by-code (QR / barcode) product picker.
 * USB scanners type into the box and press Enter; phones/tablets can use the camera button.
 * Both paths share one scan cooldown so a double-read of the same label can't add an item twice.
 */
const ProductScanSearch: React.FC<ProductScanSearchProps> = ({ products, onSelect, placeholder = 'Search or scan item (name, SKU, barcode / QR)…', scanCooldownMs = 1500 }) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const lastScanRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.barcode2 && p.barcode2.toLowerCase().includes(q))
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [products, query]);

  const show = (text: string, tone: Feedback['tone']) => setFeedback({ text, tone });

  // Returns true if the scan was accepted (cooldown passed).
  const handleScan = (code: string): boolean => {
    const now = Date.now();
    if (now - lastScanRef.current < scanCooldownMs) {
      show('Scanning too fast — wait a moment…', 'error');
      return false;
    }
    lastScanRef.current = now;
    const product = findProductByCode(products, code);
    if (!product) {
      show(`No product found for "${code}"`, 'error');
      return true;
    }
    onSelect(product);
    show(`Added: ${describe(product)}`, 'success');
    return true;
  };

  const handlePick = (product: Product) => {
    onSelect(product);
    show(`Added: ${describe(product)}`, 'success');
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // never submit the surrounding form from the search box
    const value = query.trim();
    if (!value) return;
    if (findProductByCode(products, value)) {
      handleScan(value);
      setQuery('');
    } else if (suggestions.length > 0) {
      handlePick(suggestions[0]);
    } else {
      handleScan(value); // reports "no product found"
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setFeedback(null); }}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={placeholder}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />
          {focused && suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
              {suggestions.map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handlePick(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex justify-between gap-3"
                  >
                    <span className="truncate text-slate-800">{describe(p)}</span>
                    <span className="shrink-0 text-xs text-slate-400">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setFeedback(null); setCameraOpen(true); }}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
          title="Scan item QR code / barcode with the camera"
        >
          <Camera size={14} /> Scan
        </button>
      </div>
      {feedback && (
        <p className={`mt-1 text-xs font-medium ${feedback.tone === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>{feedback.text}</p>
      )}
      {cameraOpen && (
        <CameraScanner
          title="Scan Item QR / Barcode"
          continuous
          cooldownMs={Math.max(0, scanCooldownMs - 200)}
          message={feedback}
          onDetect={code => { handleScan(code); }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
};

export default ProductScanSearch;
