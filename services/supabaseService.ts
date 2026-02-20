import { supabase } from './supabaseClient';
import type { Branch, Product, Customer, SalesRecord, StockMovement, Supplier, SupplierTransaction, Expense, User, AppSettings, DamagedGood } from '../types';

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
    }));
}

export async function insertBranch(branch: Omit<Branch, 'id'> & { id?: string }): Promise<Branch> {
    const { data, error } = await supabase.from('branches').insert({
        ...(branch.id ? { id: branch.id } : {}),
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
    }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, address: data.address, phone: data.phone };
}

export async function updateBranch(id: string, updates: Partial<Branch>): Promise<void> {
    const { error } = await supabase.from('branches').update({
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.address !== undefined && { address: updates.address }),
        ...(updates.phone !== undefined && { phone: updates.phone }),
    }).eq('id', id);
    if (error) throw error;
}

// ============================================================
// PRODUCTS (with branch stock via the view)
// ============================================================
export async function fetchProductsWithStock(): Promise<Product[]> {
    const { data, error } = await supabase.from('v_products_with_stock').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        brand: r.brand,
        price: Number(r.price),
        costPrice: Number(r.cost_price),
        stock: r.total_stock,
        branchStock: r.branch_stock as Record<string, number>,
        minStockLevel: r.min_stock_level,
        sku: r.sku,
        description: r.description,
        imageUrl: r.image_url ?? undefined,
        color: r.color ?? '',
        size: r.size ?? '',
    }));
}

export async function insertProduct(product: Product, branches: Branch[]): Promise<void> {
    const { data, error } = await supabase.from('products').insert({
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
        if (stockError) throw stockError;
    }
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

export async function deleteProduct(id: string): Promise<void> {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// CUSTOMERS
// ============================================================
export async function fetchCustomers(): Promise<Customer[]> {
    const { data, error } = await supabase.from('customers').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        loyaltyPoints: r.loyalty_points,
        totalSpent: Number(r.total_spent),
    }));
}

export async function insertCustomer(customer: Customer): Promise<Customer> {
    const { data, error } = await supabase.from('customers').insert({
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
    const { data, error } = await supabase.rpc('fn_complete_sale', {
        p_invoice_number: sale.invoiceNumber,
        p_date: sale.date,
        p_subtotal: sale.subtotal,
        p_discount: sale.discount,
        p_tax: sale.tax,
        p_total_amount: sale.totalAmount,
        p_total_cost: sale.totalCost,
        p_payment_method: sale.paymentMethod,
        p_customer_id: sale.customerId ?? null,
        p_customer_name: sale.customerName ?? null,
        p_branch_id: sale.branchId,
        p_branch_name: sale.branchName,
        p_items: sale.items.map(item => ({
            product_id: item.id,
            product_name: item.name,
            quantity: item.quantity,
            price: item.price,
            cost_price: item.costPrice,
        })),
    });
    if (error) throw error;
    return data as string;
}

export async function fetchSales(): Promise<SalesRecord[]> {
    const { data, error } = await supabase
        .from('sales')
        .select('*, sale_items(*)')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        date: r.date,
        items: (r.sale_items ?? []).map((si: Record<string, unknown>) => ({
            id: si.product_id as string,
            name: si.product_name as string,
            quantity: si.quantity as number,
            price: Number(si.price),
            costPrice: Number(si.cost_price),
            // Fill in other Product fields with defaults for CartItem compatibility
            category: '',
            brand: '',
            stock: 0,
            branchStock: {},
            minStockLevel: 0,
            sku: '',
            description: '',
        })),
        subtotal: Number(r.subtotal),
        discount: Number(r.discount),
        tax: Number(r.tax),
        totalAmount: Number(r.total_amount),
        totalCost: Number(r.total_cost),
        paymentMethod: r.payment_method,
        customerId: r.customer_id ?? undefined,
        customerName: r.customer_name ?? undefined,
        branchId: r.branch_id,
        branchName: r.branch_name,
    }));
}

// ============================================================
// STOCK MOVEMENTS
// ============================================================
export async function fetchStockMovements(): Promise<StockMovement[]> {
    const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
        branchId: r.branch_id,
        branchName: r.branch_name,
        type: r.type,
        quantity: r.quantity,
        reason: r.reason,
        date: r.date,
    }));
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
export async function fetchSuppliers(): Promise<Supplier[]> {
    const { data, error } = await supabase.from('suppliers').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        name: r.name,
        contactPerson: r.contact_person,
        phone: r.phone,
        email: r.email,
        address: r.address,
    }));
}

export async function insertSupplier(supplier: Supplier): Promise<Supplier> {
    const { data, error } = await supabase.from('suppliers').insert({
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
export async function fetchSupplierTransactions(): Promise<SupplierTransaction[]> {
    const { data, error } = await supabase
        .from('supplier_transactions')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        date: r.date,
        amount: Number(r.amount),
        type: r.type,
        reference: r.reference,
        notes: r.notes,
    }));
}

export async function insertSupplierTransaction(txn: SupplierTransaction): Promise<void> {
    const { error } = await supabase.from('supplier_transactions').insert({
        supplier_id: txn.supplierId,
        supplier_name: txn.supplierName,
        date: txn.date,
        amount: txn.amount,
        type: txn.type,
        reference: txn.reference,
        notes: txn.notes,
    });
    if (error) throw error;
}

// ============================================================
// EXPENSES
// ============================================================
export async function fetchExpenses(): Promise<Expense[]> {
    const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        description: r.description,
        amount: Number(r.amount),
        category: r.category,
        date: r.date,
        branchId: r.branch_id,
        branchName: r.branch_name,
    }));
}

export async function insertExpense(expense: Expense): Promise<Expense> {
    const { data, error } = await supabase.from('expenses').insert({
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        branch_id: expense.branchId,
        branch_name: expense.branchName,
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
    };
}

export async function deleteExpense(id: string): Promise<void> {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================
// USERS
// ============================================================
export async function fetchUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('users').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(r => ({
        id: r.id,
        name: r.name,
        role: r.role,
        pin: r.pin,
        branchId: r.branch_id ?? undefined,
    }));
}

export async function insertUser(user: User): Promise<User> {
    const { data, error } = await supabase.from('users').insert({
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
export async function fetchSettings(): Promise<AppSettings> {
    const { data, error } = await supabase.from('app_settings').select('*').limit(1).single();
    if (error) throw error;
    return {
        storeName: data.store_name,
        currencySymbol: data.currency_symbol,
        taxRate: Number(data.tax_rate),
        enableLowStockAlerts: data.enable_low_stock_alerts,
    };
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
        quantity: r.quantity,
        unitPrice: Number(r.unit_price),
        totalLoss: Number(r.total_loss),
        reason: r.reason,
        date: r.date,
    }));
}

export async function insertDamagedGood(record: DamagedGood): Promise<void> {
    const { error } = await supabase.from('damaged_goods').insert({
        product_id: record.productId,
        product_name: record.productName,
        supplier_id: record.supplierId,
        supplier_name: record.supplierName,
        quantity: record.quantity,
        unit_price: record.unitPrice,
        total_loss: record.totalLoss,
        reason: record.reason,
        date: record.date,
    });
    if (error) throw error;
}

export async function deleteDamagedGood(id: string): Promise<void> {
    const { error } = await supabase.from('damaged_goods').delete().eq('id', id);
    if (error) throw error;
}
