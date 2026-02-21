import { describe, it, expect } from 'vitest';
import {
    isAdmin,
    isManager,
    canManageSuppliers,
    canViewSettings,
    canManageUsers,
    canDeleteSales,
    canManageRoles,
} from './permissions';
import { Role } from '../types';

describe('Permissions Utility', () => {
    describe('ADMIN Role', () => {
        const role: Role = 'ADMIN';

        it('should have correct basic role checks', () => {
            expect(isAdmin(role)).toBe(true);
            expect(isManager(role)).toBe(false);
        });

        it('should be able to perform admin actions', () => {
            expect(canManageSuppliers(role)).toBe(true);
            expect(canViewSettings(role)).toBe(true);
            expect(canManageUsers(role)).toBe(true);
            expect(canDeleteSales(role)).toBe(true);

            expect(canManageRoles('ADMIN', role)).toBe(true);
            expect(canManageRoles('MANAGER', role)).toBe(true);
            expect(canManageRoles('CASHIER', role)).toBe(true);
        });
    });

    describe('MANAGER Role', () => {
        const role: Role = 'MANAGER';

        it('should have correct basic role checks', () => {
            expect(isAdmin(role)).toBe(false);
            expect(isManager(role)).toBe(true);
        });

        it('should be able to perform manager actions but not admin actions', () => {
            // Typically managers cannot manage suppliers, users, or delete sales
            expect(canManageSuppliers(role)).toBe(false);
            expect(canManageUsers(role)).toBe(false);
            expect(canDeleteSales(role)).toBe(false);

            // Managers usually can view settings though
            expect(canViewSettings(role)).toBe(true);

            // Managers cannot assign roles according to our simple logic
            expect(canManageRoles('ADMIN', role)).toBe(false);
            expect(canManageRoles('CASHIER', role)).toBe(false);
        });
    });

    describe('CASHIER Role', () => {
        const role: Role = 'CASHIER';

        it('should have correct basic role checks', () => {
            expect(isAdmin(role)).toBe(false);
            expect(isManager(role)).toBe(false);
        });

        it('should not be able to perform elevated actions', () => {
            expect(canManageSuppliers(role)).toBe(false);
            expect(canViewSettings(role)).toBe(false);
            expect(canManageUsers(role)).toBe(false);
            expect(canDeleteSales(role)).toBe(false);
            expect(canManageRoles('CASHIER', role)).toBe(false);
        });
    });

    describe('Undefined/Null User', () => {
        it('should default to deny for permission checks', () => {
            expect(isAdmin(undefined)).toBe(false);
            expect(canViewSettings(undefined)).toBe(false);
            expect(canManageUsers(undefined)).toBe(false);
        });
    });
});
