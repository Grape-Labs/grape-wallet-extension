export const MOBILE_SETTINGS_CATEGORIES = [
  { id: 'wallet', label: 'General', group: 'Wallet', description: 'Network and balance visibility', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', group: 'Wallet', description: 'Make Grape feel like yours', icon: 'sliders' },
  { id: 'addons', label: 'Add-ons', group: 'Wallet', description: 'Optional tools for your wallet', icon: 'layers' },
  { id: 'connections', label: 'Connections', group: 'Wallet', description: 'Trusted apps and signing approvals', icon: 'link' },
  { id: 'security', label: 'Security', group: 'Wallet', description: 'Unlock methods and wallet protection', icon: 'shield' },
  { id: 'recovery', label: 'Recovery', group: 'Wallet', description: 'Backup, export, and device linking', icon: 'key' },
  { id: 'wallets', label: 'Wallet manager', group: 'Wallet', description: 'Create, import, and manage your wallets', icon: 'briefcase' },
  { id: 'reputation', label: 'Reputation', group: 'Community', description: 'Track points across your communities', icon: 'globe' },
  { id: 'verification', label: 'Verification', group: 'Community', description: 'Manage linked verification spaces', icon: 'check-circle' },
  { id: 'governance', label: 'Governance', group: 'Community', description: 'Choose the DAOs you follow', icon: 'users' },
  { id: 'help', label: 'Help & FAQ', group: 'Support', description: 'Answers and support for your wallet', icon: 'help-circle' },
] as const;
export type MobileSettingsCategory = typeof MOBILE_SETTINGS_CATEGORIES[number]['id'];
const sectionCategories: Record<string, MobileSettingsCategory> = {
  network: 'wallet', privacy: 'wallet', 'current-wallet': 'wallet', appearance: 'appearance', haptics: 'appearance',
  'private-balances': 'addons', rebalancer: 'addons', 'addons-unavailable': 'addons',
  signing: 'connections', adapter: 'connections', 'trusted-apps': 'connections',
  unlock: 'security', session: 'security', backup: 'recovery', 'link-device': 'recovery', 'all-wallets': 'wallets',
  verification: 'verification', reputation: 'reputation', governance: 'governance', help: 'help',
};
export const settingsCategoryForSection = (section: string): MobileSettingsCategory => sectionCategories[section] ?? 'wallet';
/** Use the measured settings canvas: the app's primary tablet rail is already excluded. */
export function getSettingsLayout(width: number, fontScale = 1) {
  const scale = Math.max(1, fontScale);
  const navigation = width / scale >= 1050 ? 'sidebar' : width / scale >= 560 ? 'tabs' : 'picker';
  const contentWidth = Math.max(0, width - (navigation === 'sidebar' ? 204 : 0));
  return { navigation, contentWidth, columns: contentWidth / scale >= 700 ? 2 : 1 } as const;
}

/** Reserve the frame and quiet-zone padding before sizing a restore QR. */
export const settingsQrSize = (width: number) => Math.max(96, Math.min(320, Math.floor(width - 74)));
