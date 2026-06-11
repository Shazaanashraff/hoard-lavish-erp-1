import { supabase } from '../supabaseClient';
import type { SalesRecord, ExchangeRecord } from '../../types';
import { asUuidOrNull } from './shared';

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

    if (!isLegacySignatureMismatch) throw error;

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
    cashAmount: r.cash_amount != null ? Number(r.cash_amount) : undefined,
    cardAmount: r.card_amount != null ? Number(r.card_amount) : undefined,
    customerId: r.customer_id ?? undefined,
    customerName: r.customer_name ?? undefined,
    branchId: r.branch_id,
    branchName: r.branch_name,
});

export interface FetchSalesOptions {
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
    paymentMethod?: string;
    limit?: number;
}

export async function fetchSales(options: FetchSalesOptions = {}): Promise<SalesRecord[]> {
    let query = supabase
        .from('sales')
        .select('*, sale_items(*, products(id, name, sku, size, color, barcode, barcode2))')
        .order('date', { ascending: false });
    if (options.branchId) query = query.eq('branch_id', options.branchId);
    if (options.dateFrom) query = query.gte('date', options.dateFrom);
    if (options.dateTo) query = query.lte('date', options.dateTo);
    if (options.paymentMethod) query = query.eq('payment_method', options.paymentMethod);
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapSale);
}

const mapExchangeItem = (i: any) => ({
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
    manualReturnUnitPrice: i.manual_return_unit_price != null ? Number(i.manual_return_unit_price) : undefined,
    unitItemDiscount: Number(i.unit_item_discount ?? 0),
    unitBillDiscountShare: Number(i.unit_bill_discount_share ?? 0),
    effectiveUnitPrice: Number(i.effective_unit_price ?? 0),
    lineEffectiveTotal: Number(i.line_effective_total ?? 0),
});

export const mapExchange = (r: any): ExchangeRecord => {
    const items = r.exchange_items ?? [];
    return {
        id: r.id,
        exchangeNumber: r.exchange_number,
        date: r.date,
        originalSaleId: r.original_sale_id ?? undefined,
        originalInvoiceNumber: r.original_invoice_number ?? undefined,
        returnedItems: items.filter((i: any) => i.item_type === 'RETURN').map(mapExchangeItem),
        newItems: items.filter((i: any) => i.item_type === 'NEW').map(mapExchangeItem),
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

export interface FetchExchangesOptions {
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
    originalSaleId?: string;
}

export async function fetchExchanges(options: FetchExchangesOptions = {}): Promise<ExchangeRecord[]> {
    let query = supabase
        .from('exchanges')
        .select('*, exchange_items(*)')
        .order('date', { ascending: false });
    if (options.branchId) query = query.eq('branch_id', options.branchId);
    if (options.dateFrom) query = query.gte('date', options.dateFrom);
    if (options.dateTo) query = query.lte('date', options.dateTo);
    if (options.originalSaleId) query = query.eq('original_sale_id', options.originalSaleId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapExchange);
}

export async function insertExchange(exchange: ExchangeRecord): Promise<string> {
    const { data, error } = await supabase.from('exchanges').insert({
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
    }).select('id').single();
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

export interface SalesDailyTotal {
    date: string;        // YYYY-MM-DD
    branchId: string;
    sumAmount: number;
    sumCost: number;
    txCount: number;
}

export interface FetchSalesDailyTotalsOptions {
    branchId?: string;   // omitted/undefined → all branches grouped by branch
    dateFrom: string;
    dateTo: string;
}

export async function fetchSalesDailyTotals(
    options: FetchSalesDailyTotalsOptions
): Promise<SalesDailyTotal[]> {
    const { data, error } = await supabase.rpc('fn_sales_daily_totals', {
        p_branch_id: options.branchId ?? null,
        p_date_from: options.dateFrom,
        p_date_to: options.dateTo,
    });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
        date: r.date,
        branchId: r.branch_id,
        sumAmount: Number(r.sum_amount),
        sumCost: Number(r.sum_cost),
        txCount: Number(r.tx_count),
    }));
}
