import type { BrandRecord } from '../types';
import { loadLocalTags, saveLocalTags, activeTagNames, pruneTombstones, findActiveByName, mergeTagsLWW } from './localTagStore';

const NAMESPACE = 'brands';

export const loadLocalBrands = (): Promise<BrandRecord[]> => loadLocalTags<BrandRecord>(NAMESPACE);
export const saveLocalBrands = (records: BrandRecord[]): Promise<void> => saveLocalTags(NAMESPACE, records);
export const activeBrandNames = (records: BrandRecord[]): string[] => activeTagNames(records);
export const pruneBrandTombstones = (records: BrandRecord[], olderThanDays = 90): BrandRecord[] =>
    pruneTombstones(records, olderThanDays);
export const findActiveBrandByName = (records: BrandRecord[], name: string): BrandRecord | undefined =>
    findActiveByName(records, name);
export const mergeBrandsLWW = (local: BrandRecord[], remote: BrandRecord[]): BrandRecord[] =>
    mergeTagsLWW(local, remote);
