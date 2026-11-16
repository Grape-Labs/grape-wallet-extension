/** User-facing guide for Grape's current SOL Privacy Rings integration. */
export const PRIVACY_GUIDE = {
  title: 'How private balances work',
  intro: 'Hold and send SOL with encrypted balances on Solana, using Helius Privacy Rings. Your existing wallet controls the private balance; your address stays the same.',
  steps: [
    { id: 'setup', title: 'Create your private balance', label: 'No deposit yet', body: 'Setup registers this account’s public privacy keys on-chain. No SOL moves into the private balance until you choose Add.' },
    { id: 'deposit', title: 'Add SOL', label: 'Public → private', body: 'Move SOL from your public balance into the Ring. This deposit exposes the source, asset, and amount on-chain.' },
    { id: 'send', title: 'Send privately', label: 'Private → private', body: 'Pay another wallet with a compatible private setup. The payment’s asset and amount are encrypted; both addresses and the transaction remain visible.' },
    { id: 'withdraw', title: 'Withdraw SOL', label: 'Private → public', body: 'Move SOL to your own public balance or another public address. The destination, asset, and amount become visible on-chain.' },
  ],
  visibility: [
    { action: 'Private holdings', public: 'Your wallet and its private registration', hidden: 'Balance and asset holdings' },
    { action: 'Private send', public: 'Sender, recipient, and transaction activity', hidden: 'Payment amount and asset' },
    { action: 'Add or withdraw', public: 'Entry or exit address, amount, and asset', hidden: 'Other private holdings' },
  ],
  limit: 'This provides confidentiality, not full anonymity. Public deposits, withdrawals, and timing can still allow observers to make inferences.',
  questions: [
    { id: 'proofs', title: 'What happens behind the scenes?', body: 'Encrypted records live on Solana. Cryptographic proofs let the network check a valid spend without publishing its hidden values. Grape decrypts your balance locally. Proof generation uses Helius’s attested remote proving service, whose protected environment processes private transaction inputs. Spending still requires your wallet signature, and transfers depend on the service being available.' },
    { id: 'recovery', title: 'Do I need another wallet or recovery phrase?', body: 'Grape derives privacy keys from the selected Solana account. Restoring that same account in a compatible Grape wallet preserves its privacy identity. Back up the account’s recovery phrase or private key; your app password alone is not a backup.' },
    { id: 'recipient', title: 'What if the recipient has no private balance?', body: 'Grape stops the private send. It does not silently turn it into a public payment. Choose Withdraw explicitly if you want to send to a public address.' },
    { id: 'costs', title: 'What does setup cost? Can I reclaim it?', body: 'The review shows the network fee and estimated public-wallet debit, including setup costs. Keep public SOL available for fees. Grape currently offers no way to close the private registration or reclaim its rent. Hiding the card or disabling the add-on does not move funds or remove the setup.' },
    { id: 'modes', title: 'How is this different from Privacy mode or Private Send?', body: 'Privacy mode and the eye icon mask values on your screen. Private balances encrypt on-chain holdings through Helius Privacy Rings. Houdini Private Send is a separate exchange-routing flow. This private-balance integration currently supports SOL transactions.' },
  ],
  sources: [
    { title: 'Helius privacy overview', url: 'https://www.helius.dev/docs/privacy' },
    { title: 'Encryption and visibility', url: 'https://www.helius.dev/docs/privacy/concepts/encryption' },
  ],
} as const;
