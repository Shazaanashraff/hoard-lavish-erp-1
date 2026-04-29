-- Stock Transfers table for inter-branch stock transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_number TEXT NOT NULL UNIQUE,
    date TIMESTAMPTZ NOT NULL DEFAULT now(),
    from_branch_id UUID NOT NULL REFERENCES branches(id),
    from_branch_name TEXT NOT NULL,
    to_branch_id UUID NOT NULL REFERENCES branches(id),
    to_branch_name TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_items INTEGER NOT NULL DEFAULT 0,
    total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by branch
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_branch ON stock_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_branch ON stock_transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_date ON stock_transfers(date DESC);

-- Enable RLS and allow all operations (PIN-auth phase — permissive like other tables)
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON stock_transfers FOR ALL USING (true) WITH CHECK (true);
