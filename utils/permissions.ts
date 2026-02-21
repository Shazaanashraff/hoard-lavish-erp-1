import { Role } from '../types';

export const isAdmin = (role?: Role): boolean => {
    return role === 'ADMIN';
};

export const isManager = (role?: Role): boolean => {
    return role === 'MANAGER';
};

export const canManageSuppliers = (role?: Role): boolean => {
    // Only Admin can manage suppliers according to the current setup in Suppliers.tsx
    return role === 'ADMIN';
};

export const canViewSettings = (role?: Role): boolean => {
    // Usually both ADMIN and MANAGER can view settings, but ADMIN has more control
    // Let's rely on standard logic where CASHIER typically cannot view settings
    return role === 'ADMIN' || role === 'MANAGER';
};

export const canManageUsers = (role?: Role): boolean => {
    // Only Admins can create or delete other users
    return role === 'ADMIN';
};

export const canDeleteSales = (role?: Role): boolean => {
    return role === 'ADMIN';
};

export const canManageRoles = (targetRole: Role, assignerRole?: Role): boolean => {
    // Only Admin can assign Admin or Manager roles
    if (assignerRole === 'ADMIN') return true;
    // Others cannot
    return false;
};
