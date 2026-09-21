declare module '@exodus/bitcoinjs-lib-zcash' {
  import { Buffer } from 'buffer';

  export type ZcashJsNetwork = {
    messagePrefix: string;
    bip32: { public: number; private: number };
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
  };

  export class Transaction {
    static DEFAULT_SEQUENCE: number;
    static V5_VERSION_GROUP_ID: number;
    static V6_VERSION_GROUP_ID: number;
    static V6_VERSION_NUMBER: number;
    static SIGHASH_ALL: number;
    version: number;
    nVersionGroupId: number;
    locktime: number;
    expiryHeight: number;
    consensusBranchId: number | null;
    addInput(hash: Buffer, index: number, sequence?: number, scriptSig?: Buffer): number;
    addOutput(scriptPubKey: Buffer, value: number): number;
    hashForZcashV5V6(
      inIndex: number,
      prevOuts: Array<{ script: Buffer; value: number }>,
      hashType: number
    ): Buffer;
    setInputScript(index: number, scriptSig: Buffer): void;
    toHex(): string;
    getId(): string;
  }

  export const address: {
    fromBase58Check(value: string): { version: number; hash: Buffer };
    toBase58Check(hash: Buffer, version: number): string;
    toOutputScript(value: string, network: ZcashJsNetwork): Buffer;
  };

  export const script: {
    compile(chunks: Array<number | Buffer>): Buffer;
  };

  const bitcoinjsZcash: {
    Transaction: typeof Transaction;
    address: typeof address;
    script: typeof script;
  };
  export default bitcoinjsZcash;
}
