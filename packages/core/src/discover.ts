/** Shared Zcash directory for extension Discover and the mobile browser.
 * These are ecosystem links, not claims of Grape wallet-provider compatibility.
 * Sources: https://z.cash/ecosystem/ and the linked projects' official sites.
 */
export const ZCASH_DISCOVER_APPS = [
  { name: 'Houdini Swap', description: 'Swap ZEC through deposit-address exchange routes', category: 'DeFi', url: 'https://houdiniswap.com', featured: true },
  { name: 'ChangeNOW', description: 'Exchange native ZEC using a recipient address', category: 'DeFi', url: 'https://changenow.io/currencies/zcash', featured: true },
  { name: 'Zexplorer', description: 'Explore Zcash blocks and transparent transactions', category: 'Explorer', url: 'https://www.zexplorer.app', featured: true },
  { name: 'Zcash.me', description: 'Browse community profiles and Zcash identities', category: 'Community', url: 'https://zcash.me', featured: true },
  { name: 'ZecHub', description: 'Community guides to wallets, privacy, and using ZEC', category: 'Tools', url: 'https://zechub.wiki' },
  { name: 'Zcash Ecosystem', description: 'Official directory of Zcash apps and services', category: 'Tools', url: 'https://z.cash/ecosystem/' },
  { name: 'Zcash Forum', description: 'Discuss Zcash development and community proposals', category: 'Community', url: 'https://forum.zcashcommunity.com' }
] as const;

export const ZCASH_DISCOVER_NOTE = 'Explore ZEC exchanges, tools, and community sites. Direct Grape wallet connection depends on the site; Grape currently supports transparent Zcash addresses.';
