export const MOUNT_LAVINIA_DEFAULT_PRINTER = 'XP - Q80B';

export const normalizeBranchName = (name?: string): string =>
  (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const isMountLaviniaBranch = (name?: string): boolean =>
  normalizeBranchName(name) === 'mountlavinia';

export const getThermalPrinterForBranch = (branch: { name?: string; thermalPrinterName?: string }): string => {
  const configured = (branch.thermalPrinterName || '').trim();
  if (configured) return configured;
  return isMountLaviniaBranch(branch.name) ? MOUNT_LAVINIA_DEFAULT_PRINTER : '';
};
