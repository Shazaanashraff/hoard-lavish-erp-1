import type { CategoryRecord } from '../types';
import { loadLocalTags, saveLocalTags, activeTagNames, pruneTombstones, findActiveByName, mergeTagsLWW } from './localTagStore';

const NAMESPACE = 'categories';

export const loadLocalCategories = (): Promise<CategoryRecord[]> => loadLocalTags<CategoryRecord>(NAMESPACE);
export const saveLocalCategories = (records: CategoryRecord[]): Promise<void> => saveLocalTags(NAMESPACE, records);
export const activeCategoryNames = (records: CategoryRecord[]): string[] => activeTagNames(records);
export const pruneCategoryTombstones = (records: CategoryRecord[], olderThanDays = 90): CategoryRecord[] =>
    pruneTombstones(records, olderThanDays);
export const findActiveCategoryByName = (records: CategoryRecord[], name: string): CategoryRecord | undefined =>
    findActiveByName(records, name);
export const mergeCategoriesLWW = (local: CategoryRecord[], remote: CategoryRecord[]): CategoryRecord[] =>
    mergeTagsLWW(local, remote);
