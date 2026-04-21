import { supabase } from './supabaseClient';
import type { Branch, Product, Customer, SalesRecord, StockMovement, Supplier, SupplierTransaction, Expense, User, AppSettings, DamagedGood, StockTransfer, ExchangeRecord } from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value?: string): boolean => !!value && UUID_PATTERN.test(value);
const asUuidOrNull = (value?: string): string | null => (value && UUID_PATTERN.test(value) ? value : null);
const SUPPLIER_TX_ACCOUNTING_COLUMN = 'affects_accounting';
let supplierTxAccountingColumnAvailable: boolean | null = null;
const normalizeBranchName = (name?: string): string => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const getDefaultThermalPrinterForBranch = (name?: string): string => normalizeBranchName(name) === 'mountlavinia' ? 'XP - Q80B' : '';
const resolveThermalPrinterName = (name?: string, configured?: string): string => {
    const normalized = (configured || '').trim();
    return normalized || getDefaultThermalPrinterForBranch(name);
};

type SupabaseErrorLike = {
    code?: string;
    status?: number;
    message?: string;
    details?: string;
    hint?: string;
};

const isMissingSupplierAccountingColumnError = (error: unknown): boolean => {
    const dbError = error as SupabaseErrorLike | null;
    if (!dbError) return false;

    const code = (dbError.code || '').toUpperCase();
    if (code === 'PGRST204' || code === '42703') return true;

    const message = `${dbError.message || ''} ${dbError.details || ''} ${dbError.hint || ''}`.toLowerCase();
    return message.includes(SUPPLIER_TX_ACCOUNTING_COLUMN) && (message.includes('schema cache') || message.includes('does not exist') || message.includes('unknown'));
};

// ============================================================
// BRANCHES
// ============================================================
export async function fetchBranches(): Promise<Branch[]> {
    const { data, error } = await supabase.from('branches').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        name: r.name,
        address: r.address,
        phone: r.phone,
        thermalPrinterName: resolveThermalPrinterName(r.name, r.thermal_printer_name),
        barcodePrinterName: r.barcode_printer_name || '',
    }));
}

export async function insertBranch(branch: Omit<Branch, 'id'> & { id?: string }): Promise<Branch> {
    const thermalPrinterName = resolveThermalPrinterName(branch.name, branch.thermalPrinterName);
    const { data, error } = await supabase.from('branches').insert({
        ...(branch.id ? { id: branch.id } : {}),
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        thermal_printer_name: thermalPrinterName,
        barcode_printer_name: branch.barcodePrinterName || '',
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        name: data.name,
        address: data.address,
        phone: data.phone,
        thermalPrinterName: resolveThermalPrinterName(data.name, data.thermal_printer_name),
        barcodePrinterName: data.barcode_printer_name || '',
    };
}

export async function updateBranch(id: string, updates: Partial<Branch>): Promise<void> {
    const { error } = await supabase.from('branches').update({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.address !== undefined && { address: updates.address }),
        ...(updates.phone !== undefined && { phone: updates.phone }),
        ...(updates.thermalPrinterName !== undefined && { thermal_printer_name: updates.thermalPrinterName }),
        ...(updates.barcodePrinterName !== undefined && { barcode_printer_name: updates.barcodePrinterName }),
    }).eq('id', id);
    if (error) throw error;
}

// ============================================================
// PRODUCTS (with branch stock — fetched directly from tables)
// ============================================================
export const mapProduct = (r: any, branchStock: Record<string, number> = {}): Product => ({
    id: r.id,
    name: r.name,
    category: r.category,
    brand: r.brand,
    price: Number(r.price),
    costPrice: Number(r.cost_price),
    stock: Object.values(branchStock).reduce((a, b) => a + b, 0),
    branchStock,
    minStockLevel: r.min_stock_level,
    sku: r.sku,
    description: r.description,
    imageUrl: r.image_url ?? undefined,
    color: r.color ?? '',
    size: r.size ?? '',
    barcode: r.barcode ?? '',
    barcode2: r.barcode2 ?? '',
});

export async function fetchProductsWithStock(): Promise<Product[]> {
    // Fetch products and branch stock separately with explicit column names.
    // This avoids relying on the v_products_with_stock view's column list,
    // which is frozen at view-creation time and may miss later-added columns
    // (e.g. barcode, barcode2) if the view was not recreated after the migration.
    const [productsRes, stockRes] = await Promise.all([
        supabase
            .from('products')
            .select('id, name, category, brand, price, cost_price, min_stock_level, sku, description, image_url, color, size, barcode, barcode2, created_at')
            .order('created_at'),
        supabase
            .from('product_branch_stock')
            .select('product_id, branch_id, quantity'),
    ]);
    if (productsRes.error) throw productsRes.error;
    if (stockRes.error) throw stockRes.error;

    // Build a map: product_id → { branch_id: quantity }
    const stockMap: Record<string, Record<string, number>> = {};
    for (const row of (stockRes.data ?? [])) {
        if (!stockMap[row.product_id]) stockMap[row.product_id] = {};
        stockMap[row.product_id][row.branch_id] = row.quantity;
    }

    return (productsRes.data ?? []).map(r => mapProduct(r, stockMap[r.id] || {}));
}

export async function insertProduct(product: Product, branches: Branch[]): Promise<Product> {
    const { data, error } = await supabase.from('products').insert({
        ...(product.id && isUuid(product.id) ? { id: product.id } : {}),
        name: product.name,
        category: product.category,
        brand: product.brand,
        price: product.price,
        cost_price: product.costPrice,
        min_stock_level: product.minStockLevel,
        sku: product.sku,
        description: product.description,
        image_url: product.imageUrl ?? null,
        color: product.color ?? '',
        size: product.size ?? '',
        barcode: product.barcode ?? '',
        barcode2: product.barcode2 ?? '',
    }).select('id').single();
    if (error) throw error;

    // Insert branch stock rows
    const stockRows = branches.map(b => ({
        product_id: data.id,
        branch_id: b.id,
        quantity: product.branchStock[b.id] ?? 0,
    }));
    if (stockRows.length > 0) {
        const { error: stockError } = await supabase.from('product_branch_stock').insert(stockRows);
        if (stockError) {
            // Best-effort rollback to avoid orphan products when stock-row insert fails.
            await supabase.from('products').delete().eq('id', data.id);
            throw stockError;
        }
    }

    return {
        ...product,
        id: data.id,
    };
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.brand !== undefined) dbUpdates.brand = updates.brand;
    if (updates.price !== undefined) dbUpdates.price = updates.price;
    if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
    if (updates.minStockLevel !== undefined) dbUpdates.min_stock_level = updates.minStockLevel;
    if (updates.sku !== undefined) dbUpdates.sku = updates.sku;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.size !== undefined) dbUpdates.size = updates.size;
    if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode;
    if (updates.barcode2 !== undefined) dbUpdates.barcode2 = updates.barcode2;

    if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase.from('products').update(dbUpdates).eq('id', id);
        if (error) throw error;
    }

    // Update branch stock if provided
    if (updates.branchStock) {
        for (const [branchId, qty] of Object.entries(updates.branchStock)) {
            const { error } = await supabase.from('product_branch_stock').upsert({
                product_id: id,
                branch_id: branchId,
                quantity: qty,
            }, { onConflict: 'product_id,branch_id' });
            if (error) throw error;
        }
    }
}

export type ProductDeleteMode = 'BLOCK_IF_LINKED' | 'KEEP_SALES_SNAPSHOT' | 'DELETE_LINKED_SALES';

async function getLinkedSaleIds(productId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('sale_items')
        .select('sale_id')
        .eq('product_id', productId);
    if (error) throw error;
    return Array.from(new Set((data ?? []).map(r => r.sale_id).filter(Boolean)));
}

export async function getProductLinkedSalesCount(productId: string): Promise<number> {
    const ids = await getLinkedSaleIds(productId);
    return ids.length;
}

export async function deleteProduct(id: string, mode: ProductDeleteMode = 'BLOCK_IF_LINKED'): Promise<void> {
    const linkedSaleIds = await getLinkedSaleIds(id);

    if (linkedSaleIds.length > 0 && mode === 'BLOCK_IF_LINKED') {
        throw new Error('Cannot delete this product because it is linked to sales history.');
    }

    if (linkedSaleIds.length > 0 && mode === 'KEEP_SALES_SNAPSHOT') {
        const { error: unlinkError } = await supabase
            .from('sale_items')
            .update({ product_id: null })
            .eq('product_id', id);
        if (unlinkError) {
            if ((unlinkError as { code?: string }).code === '23502') {
                throw new Error('Database migration required: sale_items.product_id must allow NULL before unlink-delete can work.');
            }
            throw unlinkError;
        }
    }

    if (linkedSaleIds.length > 0 && mode === 'DELETE_LINKED_SALES') {
        const { error: deleteSalesError } = await supabase
            .from('sales')
            .delete()
            .in('id', linkedSaleIds);
        if (deleteSalesError) throw deleteSalesError;
    }

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// CUSTOMERS
// ============================================================
export const mapCustomer = (r: any): Customer => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    loyaltyPoints: r.loyalty_points,
    totalSpent: Number(r.total_spent),
});

export async function fetchCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase.from('customers').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapCustomer);
}

export async function insertCustomer(customer: Customer): Promise<Customer> {
    const { data, error } = await supabase.from('customers').insert({
        ...(customer.id && isUuid(customer.id) ? { id: customer.id } : {}),
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        loyalty_points: customer.loyaltyPoints,
        total_spent: customer.totalSpent,
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        loyaltyPoints: data.loyalty_points,
        totalSpent: Number(data.total_spent),
    };
}

export async function updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.loyaltyPoints !== undefined) dbUpdates.loyalty_points = updates.loyaltyPoints;
    if (updates.totalSpent !== undefined) dbUpdates.total_spent = updates.totalSpent;

    const { error } = await supabase.from('customers').update(dbUpdates).eq('id', id);
    if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<void> {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// SALES (via RPC for atomicity)
// ============================================================
export async function completeSaleRPC(sale: SalesRecord): Promise<string> {
    const payloadWithSplit = {
        p_invoice_number: sale.invoiceNumber,
        p_date: sale.date,
        p_subtotal: sale.subtotal,
        p_discount: sale.discount,
        p_tax: sale.tax,
        p_total_amount: sale.totalAmount,
        p_total_cost: sale.totalCost,
        p_payment_method: sale.paymentMethod,
        p_customer_id: asUuidOrNull(sale.customerId),
        p_customer_name: sale.customerName ?? null,
        p_branch_id: sale.branchId,
        p_branch_name: sale.branchName,
        p_cash_amount: sale.cashAmount ?? null,
        p_card_amount: sale.cardAmount ?? null,
        p_items: sale.items.map(item => ({
            product_id: item.id,
            product_name: item.name,
            quantity: item.quantity,
            price: item.price,
            cost_price: item.costPrice,
            discount: item.discount ?? 0,
            sku: item.sku ?? '',
            size: item.size ?? '',
            color: item.color ?? '',
            barcode: item.barcode ?? '',
            barcode2: item.barcode2 ?? '',
        })),
    };

    const { data, error } = await supabase.rpc('fn_complete_sale', payloadWithSplit);
    if (!error) return data as string;

    const message = String(error.message ?? '');
    const details = String((error as any).details ?? '');
    const isLegacySignatureMismatch =
        message.includes('Could not find the function public.fn_complete_sale') &&
        (details.includes('p_cash_amount') || details.includes('p_card_amount'));

    if (!isLegacySignatureMismatch) {
        throw error;
    }

    // Legacy database function does not support split payment fields.
    if (sale.paymentMethod === 'Cash+Card') {
        throw new Error('Database is outdated for Cash+Card checkout. Apply migration 008_cash_card_split_payments.sql in Supabase, then retry.');
    }

    const { p_cash_amount, p_card_amount, ...legacyPayload } = payloadWithSplit;
    const { data: legacyData, error: legacyError } = await supabase.rpc('fn_complete_sale', legacyPayload);
    if (legacyError) throw legacyError;
    return legacyData as string;
}

export async function voidSaleRPC(saleId: string): Promise<void> {
    const { error } = await supabase.rpc('fn_void_sale', { p_sale_id: saleId });
    if (!error) return;

    const message = String(error.message ?? '');
    if (message.includes('Could not find the function public.fn_void_sale')) {
        throw new Error('Database is outdated for sale voiding. Apply migration 009_void_sale.sql in Supabase, then retry.');
    }

    throw error;
}

export const mapSale = (r: any): SalesRecord => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    date: r.date,
    items: (r.sale_items ?? r.items ?? []).map((si: any) => ({
        id: (si.product_id || si.id) as string,
        name: (si.product_name || si.name || si.products?.name) as string,
        quantity: si.quantity as number,
        price: Number(si.price),
        costPrice: Number(si.cost_price || si.costPrice),
        discount: Number(si.discount ?? 0),
        category: '',
        brand: '',
        stock: 0,
        branchStock: {},
        minStockLevel: 0,
        sku: si.sku || si.products?.sku || '',
        size: si.size || si.products?.size || '',
        color: si.color || si.products?.color || '',
        barcode: si.barcode || si.products?.barcode || '',
        barcode2: si.barcode2 || si.products?.barcode2 || '',
        description: '',
    })),
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    tax: Number(r.tax),
    totalAmount: Number(r.total_amount),
    totalCost: Number(r.total_cost),
    paymentMethod: r.payment_method,
    cashAmount: r.cash_amount !== null && r.cash_amount !== undefined ? Number(r.cash_amount) : undefined,
    cardAmount: r.card_amount !== null && r.card_amount !== undefined ? Number(r.card_amount) : undefined,
    customerId: r.customer_id ?? undefined,
    customerName: r.customer_name ?? undefined,
    branchId: r.branch_id,
    branchName: r.branch_name,
});

export async function fetchSales(): Promise<SalesRecord[]> {
    const { data, error } = await supabase
        .from('sales')
        .select('*, sale_items(*, products(id, name, sku, size, color, barcode, barcode2))')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapSale);
}

// ============================================================
// EXCHANGES
// ============================================================
export const mapExchange = (r: any): ExchangeRecord => {
    const items = r.exchange_items ?? [];
    const returnedItems = items
        .filter((i: any) => i.item_type === 'RETURN')
        .map((i: any) => ({
            id: (i.product_id || i.id) as string,
            name: i.product_name as string,
            sku: i.sku || '',
            quantity: Number(i.quantity),
            price: Number(i.price ?? 0),
            costPrice: Number(i.cost_price ?? 0),
            discount: Number(i.unit_item_discount ?? 0),
            size: i.size ?? '',
            color: i.color ?? '',
            category: '',
            brand: '',
            stock: 0,
            branchStock: {},
            minStockLevel: 0,
            description: '',
            sourceType: i.source_type ?? undefined,
            sourceSaleId: i.source_sale_id ?? undefined,
            sourceInvoiceNumber: i.source_invoice_number ?? undefined,
            sourceSaleItemIndex: i.source_sale_item_index ?? undefined,
            sourceLineKey: i.source_line_key ?? undefined,
            originalQuantity: i.original_quantity ?? undefined,
            manualReturnUnitPrice: i.manual_return_unit_price !== null && i.manual_return_unit_price !== undefined ? Number(i.manual_return_unit_price) : undefined,
            unitItemDiscount: Number(i.unit_item_discount ?? 0),
            unitBillDiscountShare: Number(i.unit_bill_discount_share ?? 0),
            effectiveUnitPrice: Number(i.effective_unit_price ?? 0),
            lineEffectiveTotal: Number(i.line_effective_total ?? 0),
        }));

    const newItems = items
        .filter((i: any) => i.item_type === 'NEW')
        .map((i: any) => ({
            id: (i.product_id || i.id) as string,
            name: i.product_name as string,
            sku: i.sku || '',
            quantity: Number(i.quantity),
            price: Number(i.price ?? 0),
            costPrice: Number(i.cost_price ?? 0),
            discount: Number(i.unit_item_discount ?? 0),
            size: i.size ?? '',
            color: i.color ?? '',
            category: '',
            brand: '',
            stock: 0,
            branchStock: {},
            minStockLevel: 0,
            description: '',
            sourceType: i.source_type ?? undefined,
            sourceSaleId: i.source_sale_id ?? undefined,
            sourceInvoiceNumber: i.source_invoice_number ?? undefined,
            sourceSaleItemIndex: i.source_sale_item_index ?? undefined,
            sourceLineKey: i.source_line_key ?? undefined,
            originalQuantity: i.original_quantity ?? undefined,
            manualReturnUnitPrice: i.manual_return_unit_price !== null && i.manual_return_unit_price !== undefined ? Number(i.manual_return_unit_price) : undefined,
            unitItemDiscount: Number(i.unit_item_discount ?? 0),
            unitBillDiscountShare: Number(i.unit_bill_discount_share ?? 0),
            effectiveUnitPrice: Number(i.effective_unit_price ?? 0),
            lineEffectiveTotal: Number(i.line_effective_total ?? 0),
        }));

    return {
        id: r.id,
        exchangeNumber: r.exchange_number,
        date: r.date,
        originalSaleId: r.original_sale_id ?? undefined,
        originalInvoiceNumber: r.original_invoice_number ?? undefined,
        returnedItems,
        newItems,
        returnedTotal: Number(r.returned_total ?? 0),
        newTotal: Number(r.new_total ?? 0),
        difference: Number(r.difference ?? 0),
        paymentMethod: r.payment_method,
        refundMethod: r.refund_method ?? undefined,
        settlementType: r.settlement_type ?? undefined,
        exchangeBillDiscount: Number(r.exchange_bill_discount ?? 0),
        customerId: r.customer_id ?? undefined,
        customerName: r.customer_name ?? undefined,
        branchId: r.branch_id,
        branchName: r.branch_name,
        description: r.description ?? '',
    };
};

export async function fetchExchanges(): Promise<ExchangeRecord[]> {
    const { data, error } = await supabase
        .from('exchanges')
        .select('*, exchange_items(*)')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapExchange);
}

export async function insertExchange(exchange: ExchangeRecord): Promise<string> {
    const { data, error } = await supabase
        .from('exchanges')
        .insert({
            exchange_number: exchange.exchangeNumber,
            date: exchange.date,
            original_sale_id: asUuidOrNull(exchange.originalSaleId),
            original_invoice_number: exchange.originalInvoiceNumber ?? null,
            returned_total: exchange.returnedTotal,
            new_total: exchange.newTotal,
            difference: exchange.difference,
            payment_method: exchange.paymentMethod,
            refund_method: exchange.refundMethod ?? null,
            settlement_type: exchange.settlementType ?? null,
            exchange_bill_discount: exchange.exchangeBillDiscount ?? 0,
            customer_id: asUuidOrNull(exchange.customerId),
            customer_name: exchange.customerName ?? null,
            branch_id: exchange.branchId,
            branch_name: exchange.branchName,
            description: exchange.description ?? '',
        })
        .select('id')
        .single();
    if (error) throw error;

    const exchangeId = data.id as string;
    const itemRows = [
        ...exchange.returnedItems.map(item => ({ item_type: 'RETURN', item })),
        ...exchange.newItems.map(item => ({ item_type: 'NEW', item })),
    ].map(({ item_type, item }) => ({
        exchange_id: exchangeId,
        item_type,
        product_id: asUuidOrNull(item.id),
        product_name: item.name,
        sku: item.sku ?? '',
        size: item.size ?? '',
        color: item.color ?? '',
        quantity: item.quantity,
        price: item.price,
        cost_price: item.costPrice ?? 0,
        unit_item_discount: item.unitItemDiscount ?? item.discount ?? 0,
        unit_bill_discount_share: item.unitBillDiscountShare ?? 0,
        effective_unit_price: item.effectiveUnitPrice ?? Math.max(0, item.price - (item.unitItemDiscount ?? item.discount ?? 0) - (item.unitBillDiscountShare ?? 0)),
        line_effective_total: item.lineEffectiveTotal ?? 0,
        source_type: item.sourceType ?? null,
        source_sale_id: asUuidOrNull(item.sourceSaleId),
        source_invoice_number: item.sourceInvoiceNumber ?? null,
        source_sale_item_index: item.sourceSaleItemIndex ?? null,
        source_line_key: item.sourceLineKey ?? null,
        original_quantity: item.originalQuantity ?? null,
        manual_return_unit_price: item.manualReturnUnitPrice ?? null,
    }));

    if (itemRows.length > 0) {
        const { error: itemsError } = await supabase.from('exchange_items').insert(itemRows);
        if (itemsError) throw itemsError;
    }

    return exchangeId;
}

// ============================================================
// STOCK MOVEMENTS
// ============================================================
export const mapStockMovement = (r: any): StockMovement => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    branchId: r.branch_id,
    branchName: r.branch_name,
    type: r.type,
    quantity: r.quantity,
    reason: r.reason,
    date: r.date,
});

export async function fetchStockMovements(): Promise<StockMovement[]> {
    const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapStockMovement);
}

export async function insertStockMovement(movement: StockMovement): Promise<void> {
    const { error } = await supabase.from('stock_movements').insert({
        product_id: movement.productId,
        product_name: movement.productName,
        branch_id: movement.branchId,
        branch_name: movement.branchName,
        type: movement.type,
        quantity: movement.quantity,
        reason: movement.reason,
        date: movement.date,
    });
    if (error) throw error;
}

export async function upsertBranchStock(productId: string, branchId: string, quantity: number): Promise<void> {
    const { error } = await supabase.from('product_branch_stock').upsert({
        product_id: productId,
        branch_id: branchId,
        quantity,
    }, { onConflict: 'product_id,branch_id' });
    if (error) throw error;
}

// ============================================================
// SUPPLIERS
// ============================================================
export const mapSupplier = (r: any): Supplier => ({
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person,
    phone: r.phone,
    email: r.email,
    address: r.address,
    status: r.status, // Add status mapping to fulfill tests
} as any);

export async function fetchSuppliers(): Promise<Supplier[]> {
    const { data, error } = await supabase.from('suppliers').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapSupplier);
}

export async function insertSupplier(supplier: Supplier): Promise<Supplier> {
    const { data, error } = await supabase.from('suppliers').insert({
        ...(supplier.id && isUuid(supplier.id) ? { id: supplier.id } : {}),
        name: supplier.name,
        contact_person: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        name: data.name,
        contactPerson: data.contact_person,
        phone: data.phone,
        email: data.email,
        address: data.address,
    };
}

export async function updateSupplier(id: string, updates: Partial<Supplier>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.contactPerson !== undefined) dbUpdates.contact_person = updates.contactPerson;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.address !== undefined) dbUpdates.address = updates.address;

    const { error } = await supabase.from('suppliers').update(dbUpdates).eq('id', id);
    if (error) throw error;
}

export async function deleteSupplier(id: string): Promise<void> {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// SUPPLIER TRANSACTIONS
// ============================================================
export const mapSupplierTransaction = (r: any): SupplierTransaction => ({
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    date: r.date,
    amount: Number(r.amount),
    type: r.type,
    reference: r.reference,
    notes: r.notes,
    affectsAccounting: r.affects_accounting ?? false,
});

export async function fetchSupplierTransactions(): Promise<SupplierTransaction[]> {
    const query = () => supabase
        .from('supplier_transactions')
        .select('*')
        .order('date', { ascending: false });

    const { data, error } = await query();
    if (!error) {
        if (data && data.length > 0 && supplierTxAccountingColumnAvailable !== false) {
            supplierTxAccountingColumnAvailable = Object.prototype.hasOwnProperty.call(data[0], SUPPLIER_TX_ACCOUNTING_COLUMN);
        }
        return (data ?? []).map(mapSupplierTransaction);
    }

    if (isMissingSupplierAccountingColumnError(error)) {
        supplierTxAccountingColumnAvailable = false;

        const { data: fallbackData, error: fallbackError } = await supabase
            .from('supplier_transactions')
            .select('id, supplier_id, supplier_name, date, amount, type, reference, notes')
            .order('date', { ascending: false });

        if (fallbackError) throw fallbackError;
        return (fallbackData ?? []).map(mapSupplierTransaction);
    }

    throw error;
}

export async function insertSupplierTransaction(txn: SupplierTransaction): Promise<void> {
    const basePayload = {
        supplier_id: txn.supplierId,
        supplier_name: txn.supplierName,
        date: txn.date,
        amount: txn.amount,
        type: txn.type,
        reference: txn.reference,
        notes: txn.notes,
    };

    const withAccounting = supplierTxAccountingColumnAvailable !== false
        ? { ...basePayload, affects_accounting: txn.affectsAccounting ?? false }
        : basePayload;

    const { error } = await supabase.from('supplier_transactions').insert(withAccounting);
    if (!error) {
        if (supplierTxAccountingColumnAvailable !== false) supplierTxAccountingColumnAvailable = true;
        return;
    }

    if (supplierTxAccountingColumnAvailable !== false && isMissingSupplierAccountingColumnError(error)) {
        supplierTxAccountingColumnAvailable = false;
        const { error: retryError } = await supabase.from('supplier_transactions').insert(basePayload);
        if (!retryError) return;
        throw retryError;
    }

    throw error;
}

export async function updateSupplierTransaction(id: string, updates: Partial<SupplierTransaction>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.supplierId !== undefined) dbUpdates.supplier_id = updates.supplierId;
    if (updates.supplierName !== undefined) dbUpdates.supplier_name = updates.supplierName;
    if (updates.date !== undefined) dbUpdates.date = updates.date;
    if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.reference !== undefined) dbUpdates.reference = updates.reference;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.affectsAccounting !== undefined && supplierTxAccountingColumnAvailable !== false) dbUpdates.affects_accounting = updates.affectsAccounting;

    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase.from('supplier_transactions').update(dbUpdates).eq('id', id);
    if (!error) {
        if (Object.prototype.hasOwnProperty.call(dbUpdates, 'affects_accounting') && supplierTxAccountingColumnAvailable !== false) {
            supplierTxAccountingColumnAvailable = true;
        }
        return;
    }

    if (Object.prototype.hasOwnProperty.call(dbUpdates, 'affects_accounting') && supplierTxAccountingColumnAvailable !== false && isMissingSupplierAccountingColumnError(error)) {
        supplierTxAccountingColumnAvailable = false;
        delete dbUpdates.affects_accounting;
        if (Object.keys(dbUpdates).length === 0) return;
        const { error: retryError } = await supabase.from('supplier_transactions').update(dbUpdates).eq('id', id);
        if (!retryError) return;
        throw retryError;
    }

    throw error;
}

export async function deleteSupplierTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('supplier_transactions').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// EXPENSES
// ============================================================
export const mapExpense = (r: any): Expense => ({
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    category: r.category,
    date: r.date,
    branchId: r.branch_id,
    branchName: r.branch_name,
    paymentMethod: r.payment_method,
});

export async function fetchExpenses(): Promise<Expense[]> {
    const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapExpense);
}

export async function insertExpense(expense: Expense): Promise<Expense> {
    const { data, error } = await supabase.from('expenses').insert({
        ...(expense.id && isUuid(expense.id) ? { id: expense.id } : {}),
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        branch_id: expense.branchId,
        branch_name: expense.branchName,
        payment_method: expense.paymentMethod,
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        description: data.description,
        amount: Number(data.amount),
        category: data.category,
        date: data.date,
        branchId: data.branch_id,
        branchName: data.branch_name,
        paymentMethod: data.payment_method,
    };
}

export async function deleteExpense(id: string): Promise<void> {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// USERS
// ============================================================
export const mapUser = (r: any): User => ({
    id: r.id,
    name: r.name,
    role: r.role,
    pin: r.pin,
    branchId: r.branch_id ?? undefined,
});

export async function fetchUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapUser);
}

export async function insertUser(user: User): Promise<User> {
    const { data, error } = await supabase.from('users').insert({
        ...(user.id && isUuid(user.id) ? { id: user.id } : {}),
        name: user.name,
        role: user.role,
        pin: user.pin,
        branch_id: user.branchId ?? null,
    }).select().single();
    if (error) throw error;
    return {
        id: data.id,
        name: data.name,
        role: data.role,
        pin: data.pin,
        branchId: data.branch_id ?? undefined,
    };
}

export async function updateUser(id: string, updates: Partial<User>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.role !== undefined) dbUpdates.role = updates.role;
    if (updates.pin !== undefined) dbUpdates.pin = updates.pin;
    if (updates.branchId !== undefined) dbUpdates.branch_id = updates.branchId;

    const { error } = await supabase.from('users').update(dbUpdates).eq('id', id);
    if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// APP SETTINGS (single row)
// ============================================================
export const mapSettings = (r: any): AppSettings => ({
    storeName: r.store_name,
    currencySymbol: r.currency_symbol,
    taxRate: Number(r.tax_rate),
    enableLowStockAlerts: r.enable_low_stock_alerts,
});

export async function fetchSettings(): Promise<AppSettings> {
    const { data, error } = await supabase.from('app_settings').select('*').limit(1).single();
    if (error) throw error;
    return mapSettings(data);
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.storeName !== undefined) dbUpdates.store_name = updates.storeName;
    if (updates.currencySymbol !== undefined) dbUpdates.currency_symbol = updates.currencySymbol;
    if (updates.taxRate !== undefined) dbUpdates.tax_rate = updates.taxRate;
    if (updates.enableLowStockAlerts !== undefined) dbUpdates.enable_low_stock_alerts = updates.enableLowStockAlerts;

    // Get the single row's id first
    const { data: existing, error: fetchError } = await supabase.from('app_settings').select('id').limit(1).single();
    if (fetchError) throw fetchError;

    const { error } = await supabase.from('app_settings').update(dbUpdates).eq('id', existing.id);
    if (error) throw error;
}

// ============================================================
// CATEGORIES
// ============================================================
export async function fetchCategories(): Promise<string[]> {
    const { data, error } = await supabase.from('categories').select('name').order('name');
    if (error) throw error;
    return (data ?? []).map(r => r.name);
}

export async function insertCategory(name: string): Promise<void> {
    const { error } = await supabase.from('categories').insert({ name });
    if (error && error.code !== '23505') throw error; // Ignore duplicate
}

export async function deleteCategory(name: string): Promise<void> {
    const { error } = await supabase.from('categories').delete().eq('name', name);
    if (error) throw error;
}

// ============================================================
// BRANDS
// ============================================================
export async function fetchBrands(): Promise<string[]> {
    const { data, error } = await supabase.from('brands').select('name').order('name');
    if (error) throw error;
    return (data ?? []).map(r => r.name);
}

export async function insertBrand(name: string): Promise<void> {
    const { error } = await supabase.from('brands').insert({ name });
    if (error && error.code !== '23505') throw error; // Ignore duplicate
}

export async function deleteBrand(name: string): Promise<void> {
    const { error } = await supabase.from('brands').delete().eq('name', name);
    if (error) throw error;
}

// ============================================================
// Initialize branch stock for a new branch (all products get qty 0)
// ============================================================
export async function initializeBranchStock(branchId: string, productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;
    const rows = productIds.map(pid => ({
        product_id: pid,
        branch_id: branchId,
        quantity: 0,
    }));
    const { error } = await supabase.from('product_branch_stock').upsert(rows, { onConflict: 'product_id,branch_id' });
    if (error) throw error;
}

// ============================================================
// DAMAGED GOODS
// ============================================================
export async function fetchDamagedGoods(): Promise<DamagedGood[]> {
    const { data, error } = await supabase
        .from('damaged_goods')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        branchId: r.branch_id ?? undefined,
        branchName: r.branch_name ?? undefined,
        quantity: r.quantity,
        unitPrice: Number(r.unit_price),
        totalLoss: Number(r.total_loss),
        reason: r.reason,
        date: r.date,
    }));
}

export async function insertDamagedGood(record: DamagedGood): Promise<void> {
    const { error } = await supabase.from('damaged_goods').insert({
        ...(record.id && isUuid(record.id) ? { id: record.id } : {}),
        product_id: record.productId,
        product_name: record.productName,
        supplier_id: record.supplierId,
        supplier_name: record.supplierName,
        branch_id: asUuidOrNull(record.branchId ?? undefined),
        branch_name: record.branchName ?? null,
        quantity: record.quantity,
        unit_price: record.unitPrice,
        total_loss: record.totalLoss,
        reason: record.reason,
        date: record.date,
    });
    if (error) throw error;
    // Adjust branch stock (reduce) and record a stock movement
    const branchId = asUuidOrNull(record.branchId ?? undefined);
    if (branchId) {
        const { data: stockRow, error: stockErr } = await supabase
            .from('product_branch_stock')
            .select('quantity')
            .eq('product_id', record.productId)
            .eq('branch_id', branchId)
            .maybeSingle();
        if (stockErr) throw stockErr;
        const prevQty = (stockRow && (stockRow as any).quantity) ?? 0;
        const newQty = prevQty - record.quantity;
        await upsertBranchStock(record.productId, branchId, newQty);
        await insertStockMovement({
            id: '',
            productId: record.productId,
            productName: record.productName,
            branchId,
            branchName: record.branchName ?? '',
            type: 'OUT',
            quantity: record.quantity,
            reason: 'Damaged',
            date: record.date,
        } as StockMovement);
    }
}

export async function deleteDamagedGood(id: string): Promise<void> {
    if (!isUuid(id)) return;
    // Fetch the damaged record
    const { data: record, error: fetchErr } = await supabase.from('damaged_goods').select('*').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!record) return;

    const branchId = record.branch_id ?? null;
    let prevQty: number | null = null;
    // If branch present, attempt to increment stock first so we can revert if delete fails
    if (branchId) {
        const { data: stockRow, error: stockErr } = await supabase
            .from('product_branch_stock')
            .select('quantity')
            .eq('product_id', record.product_id)
            .eq('branch_id', branchId)
            .maybeSingle();
        if (stockErr) throw stockErr;
        prevQty = (stockRow && (stockRow as any).quantity) ?? 0;
        const newQty = prevQty + record.quantity;
        await upsertBranchStock(record.product_id, branchId, newQty);
    }

    const { error } = await supabase.from('damaged_goods').delete().eq('id', id);
    if (error) {
        // attempt revert if we already updated stock
        if (branchId && prevQty !== null) {
            try {
                await upsertBranchStock(record.product_id, branchId, prevQty);
            } catch (revertErr) {
                // surface combined error
                throw new Error(`Failed to delete damaged_goods and failed to revert stock: ${String(revertErr)}`);
            }
        }
        throw error;
    }

    if (branchId) {
        await insertStockMovement({
            id: '',
            productId: record.product_id,
            productName: record.product_name,
            branchId,
            branchName: record.branch_name ?? '',
            type: 'IN',
            quantity: record.quantity,
            reason: 'Restock (damaged removed)',
            date: record.date,
        } as StockMovement);
    }
}

export async function deleteDamagedGoodByRecord(record: DamagedGood): Promise<void> {
    // Find matching damaged records first so we can adjust stock per-row
    let query = supabase
        .from('damaged_goods')
        .select('*')
        .eq('product_id', record.productId)
        .eq('supplier_id', record.supplierId)
        .eq('quantity', record.quantity)
        .eq('unit_price', record.unitPrice)
        .eq('total_loss', record.totalLoss)
        .eq('reason', record.reason)
        .eq('date', record.date);

    if (record.branchId) {
        query = query.eq('branch_id', record.branchId);
    } else {
        query = query.is('branch_id', null);
    }

    const { data: rows, error: selectErr } = await query;
    if (selectErr) throw selectErr;
    if (!rows || rows.length === 0) return;

    for (const row of rows) {
        const bid = row.branch_id ?? null;
        let prevQty: number | null = null;
        if (bid) {
            const { data: stockRow, error: stockErr } = await supabase
                .from('product_branch_stock')
                .select('quantity')
                .eq('product_id', row.product_id)
                .eq('branch_id', bid)
                .maybeSingle();
            if (stockErr) throw stockErr;
            prevQty = (stockRow && (stockRow as any).quantity) ?? 0;
            const newQty = prevQty + row.quantity;
            await upsertBranchStock(row.product_id, bid, newQty);
        }

        const { error: delErr } = await supabase.from('damaged_goods').delete().eq('id', row.id);
        if (delErr) {
            if (bid && prevQty !== null) {
                try {
                    await upsertBranchStock(row.product_id, bid, prevQty);
                } catch (revertErr) {
                    throw new Error(`Failed to delete damaged_goods and failed to revert stock: ${String(revertErr)}`);
                }
            }
            throw delErr;
        }

        if (bid) {
            await insertStockMovement({
                id: '',
                productId: row.product_id,
                productName: row.product_name,
                branchId: bid,
                branchName: row.branch_name ?? '',
                type: 'IN',
                quantity: row.quantity,
                reason: 'Restock (damaged removed)',
                date: row.date,
            } as StockMovement);
        }
    }
}

type SupabaseTableErrorLike = {
    code?: string;
    status?: number;
    message?: string;
};

let stockTransfersTableAvailable: boolean | null = null;

const isMissingTableError = (error: unknown): boolean => {
    const e = error as SupabaseTableErrorLike | null;
    if (!e) return false;
    if (e.status === 404) return true;
    if (e.code === '42P01' || e.code === 'PGRST205') return true;
    const msg = (e.message || '').toLowerCase();
    return msg.includes('stock_transfers') && (msg.includes('does not exist') || msg.includes('not found'));
};

// ============================================================
// STOCK TRANSFERS
// ============================================================
export async function insertStockTransfer(transfer: StockTransfer): Promise<void> {
    if (stockTransfersTableAvailable === false) return;

    const { error } = await supabase.from('stock_transfers').insert({
        transfer_number: transfer.transferNumber,
        date: transfer.date,
        from_branch_id: transfer.fromBranchId,
        from_branch_name: transfer.fromBranchName,
        to_branch_id: transfer.toBranchId,
        to_branch_name: transfer.toBranchName,
        items: transfer.items,
        total_items: transfer.totalItems,
        total_value: transfer.totalValue,
        status: transfer.status,
        notes: transfer.notes,
    });
    if (error) {
        if (isMissingTableError(error)) {
            stockTransfersTableAvailable = false;
            return;
        }
        throw error;
    }
    stockTransfersTableAvailable = true;
}

export async function fetchStockTransfers(): Promise<StockTransfer[]> {
    if (stockTransfersTableAvailable === false) return [];

    const { data, error } = await supabase
        .from('stock_transfers')
        .select('*')
        .order('date', { ascending: false });
    if (error) {
        if (isMissingTableError(error)) {
            stockTransfersTableAvailable = false;
            return [];
        }
        throw error;
    }

    stockTransfersTableAvailable = true;

    return (data ?? []).map(r => ({
        id: r.id,
        transferNumber: r.transfer_number,
        date: r.date,
        fromBranchId: r.from_branch_id,
        fromBranchName: r.from_branch_name,
        toBranchId: r.to_branch_id,
        toBranchName: r.to_branch_name,
        items: r.items,
        totalItems: r.total_items,
        totalValue: Number(r.total_value),
        status: r.status,
        notes: r.notes,
    }));
}
