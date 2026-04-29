import { useState, useEffect } from 'react';
import { getThermalPrinterForBranch } from '../utils/branch';

interface Branch {
  id: string;
  name?: string;
  thermalPrinterName?: string;
  barcodePrinterName?: string;
}

interface UsePrinterReturn {
  availablePrinters: string[];
  thermalPrinter: string;
  barcodePrinter: string;
}

export function usePrinter(currentBranch: Branch): UsePrinterReturn {
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getPrinters) {
      api.getPrinters()
        .then((list: any[]) => setAvailablePrinters(list.map((p: any) => p.name).filter(Boolean)))
        .catch(() => {});
    }
  }, []);

  return {
    availablePrinters,
    thermalPrinter: getThermalPrinterForBranch(currentBranch),
    barcodePrinter: currentBranch.barcodePrinterName || '',
  };
}
