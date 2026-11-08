**🍇 Grape Wallet v0.5.271**

A new extension build is ready to try!

**Governance inside Grape**
Open your DAO and switch between **Overview** and **Full governance**. The full governance.so interface now sits inside the wallet, with a tighter fullscreen layout that gives proposals more space.

**NFT pricing before you list**
The Tensor panel now shows collection floor price, your NFT's last indexed sale with its date and transaction link, and its on-chain Tensor listing price. Floor and sale history are sourced from Magic Eden; unavailable data is clearly labelled.

**ETH balance and swap fixes**
Fixed missing ETH balances and incorrect swap output estimates. Swaps now show minimum received, preserve failures onscreen, and handle Ethereum token approvals and quoted gas settings. Added the Ledger ETH swap flow with device confirmation.

**More resilient staking**
A rejected RPC authority lookup no longer hides all stake accounts. Grape retains the accounts it can load and clearly flags incomplete discovery.

**Testing notes:** Physical Ledger execution and wallet signing inside embedded governance still need end-to-end verification. Withdraw-only stake accounts may be missing when the RPC's withdrawal-authority index is unavailable.

📦 **Build:** `grape_wallet_extension.0.5.271.zip` (attached)
Update your existing extension installation, then reload the wallet page.

Please share any issues with the chain, action, and error message—never your seed phrase or private key.
