/** Official dApp icons bundled for offline, reliable Discover rendering. Sources: public/dapp-logos/sources.json. */
export const DISCOVER_LOGOS: Readonly<Record<string, string>> = {
  "www.governance.so": "dapp-logos/www.governance.so.png",
  "round-trip.ai.studio": "dapp-logos/round-trip.ai.studio.svg",
  "jup.ag": "dapp-logos/jup.ag.png",
  "app.kamino.finance": "dapp-logos/app.kamino.finance.png",
  "app.sanctum.so": "dapp-logos/app.sanctum.so.png",
  "www.tensor.trade": "dapp-logos/www.tensor.trade.ico",
  "raydium.io": "dapp-logos/raydium.io.ico",
  "www.orca.so": "dapp-logos/www.orca.so.png",
  "app.drift.trade": "dapp-logos/app.drift.trade.png",
  "app.meteora.ag": "dapp-logos/app.meteora.ag.png",
  "app.marginfi.com": "dapp-logos/app.marginfi.com.ico",
  "marinade.finance": "dapp-logos/marinade.finance.png",
  "www.jito.network": "dapp-logos/www.jito.wtf.png",
  "magiceden.us": "dapp-logos/magiceden.us.png",
  "www.metaplex.com": "dapp-logos/www.metaplex.com.png",
  "birdeye.so": "dapp-logos/birdeye.so.ico",
  "solscan.io": "dapp-logos/solscan.io.png",
  "solana.fm": "dapp-logos/solana.fm.png",
  "v4.squads.so": "dapp-logos/squads.so.png",
  "verification.governance.so": "dapp-logos/verification.governance.so.ico",
  "access.governance.so": "dapp-logos/access.governance.so.png",
  "app.cetus.zone": "dapp-logos/app.cetus.zone.ico",
  "app.naviprotocol.io": "dapp-logos/app.naviprotocol.io.png",
  "app.suilend.fi": "dapp-logos/suilend.fi.png",
  "trade.bluefin.io": "dapp-logos/trade.bluefin.io.png",
  "app.scallop.io": "dapp-logos/app.scallop.io.png",
  "aftermath.finance": "dapp-logos/aftermath.finance.png",
  "app.turbos.finance": "dapp-logos/app.turbos.finance.ico",
  "suins.io": "dapp-logos/suins.io.png",
  "suivision.xyz": "dapp-logos/suivision.xyz.png",
  "suiscan.xyz": "dapp-logos/suiscan.xyz.png",
  "www.sui.io": "dapp-logos/www.sui.io.png",
  "app.monad.xyz": "dapp-logos/app.monad.xyz.ico",
  "app.kuru.io": "dapp-logos/kuru.io.png",
  "app.uniswap.org": "dapp-logos/app.uniswap.org.png",
  "pancakeswap.finance": "dapp-logos/pancakeswap.finance.png",
  "lfj.gg": "dapp-logos/lfj.gg.png",
  "stake.apr.io": "dapp-logos/stake.apr.io.svg",
  "www.magmastaking.xyz": "dapp-logos/www.magmastaking.xyz.ico",
  "app.curvance.com": "dapp-logos/app.curvance.com.png",
  "nad.fun": "dapp-logos/nad.fun.ico",
  "monadscan.com": "dapp-logos/monadscan.com.ico",
  "monadvision.com": "dapp-logos/monadvision.com.png",
  "app.aave.com": "dapp-logos/app.aave.com.png",
  "stake.lido.fi": "dapp-logos/stake.lido.fi.png",
  "app.safe.global": "dapp-logos/app.safe.global.png",
  "curve.finance": "dapp-logos/curve.finance.png",
  "swap.cow.fi": "dapp-logos/swap.cow.fi.png",
  "app.1inch.io": "dapp-logos/app.1inch.io.png",
  "opensea.io": "dapp-logos/opensea.io.png",
  "app.ens.domains": "dapp-logos/app.ens.domains.png",
  "snapshot.box": "dapp-logos/snapshot.box.svg",
  "app.across.to": "dapp-logos/app.across.to.png",
  "etherscan.io": "dapp-logos/etherscan.io.ico",
  "houdiniswap.com": "dapp-logos/app.houdini.com.ico",
  "changenow.io": "dapp-logos/changenow.io.png",
  "www.zexplorer.app": "dapp-logos/www.zexplorer.app.ico",
  "zcash.me": "dapp-logos/zcash.me.png",
  "zechub.wiki": "dapp-logos/zechub.wiki.png",
  "z.cash": "dapp-logos/z.cash.png",
  "forum.zcashcommunity.com": "dapp-logos/forum.zcashcommunity.com.png",
  "vine.governance.so": "dapp-logos/vine.governance.so.ico",
  "www.bitrefill.com": "dapp-logos/www.bitrefill.com.png",
  "zebec.io": "dapp-logos/zebec.io.png",
  "www.moonpay.com": "dapp-logos/www.moonpay.com.png",
  "transak.com": "dapp-logos/transak.com.png",
  "governance.so": "dapp-logos/www.governance.so.png",
  "magiceden.io": "dapp-logos/magiceden.us.png",
  "houdini.com": "dapp-logos/app.houdini.com.ico",
  "www.kuru.io": "dapp-logos/kuru.io.png",
  "squads.xyz": "dapp-logos/squads.so.png"
};

export function getDiscoverIconCandidates(url: string, faviconUrl?: string): string[] {
  try {
    const site = new URL(url);
    if (!['https:', 'http:'].includes(site.protocol)) return [];
    const host = site.hostname;
    const bundled = DISCOVER_LOGOS[host] ?? (host.endsWith('.governance.so') ? DISCOVER_LOGOS['governance.so'] : undefined);
    const candidates = bundled ? [bundled] : [];
    if (faviconUrl) {
      try { const favicon = new URL(faviconUrl); if (['https:', 'http:'].includes(favicon.protocol)) candidates.push(favicon.href); } catch { /* Ignore malformed site metadata. */ }
    }
    candidates.push(`${site.origin}/apple-touch-icon.png`, `${site.origin}/favicon.png`, `${site.origin}/favicon.ico`);
    return [...new Set(candidates)];
  } catch { return []; }
}
