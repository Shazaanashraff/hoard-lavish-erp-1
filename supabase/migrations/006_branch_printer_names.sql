-- Add per-branch printer name columns
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS thermal_printer_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS barcode_printer_name TEXT NOT NULL DEFAULT '';
