package xyz.grape.wallet

/**
 * Dedicated Android entry point for Solana Mobile Wallet Adapter requests.
 * It renders the same React Native wallet UI while keeping the MWA session in
 * a separate task so control returns naturally to the requesting dApp.
 */
class MobileWalletAdapterActivity : MainActivity()
