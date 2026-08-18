import Solana from '@ledgerhq/hw-app-solana';
import TransportBLE from '@ledgerhq/react-native-hw-transport-ble';
import { Buffer } from 'buffer';
import { PermissionsAndroid, Platform } from 'react-native';
import type { Transaction } from '@solana/web3.js';

import { getMobileSolanaRpcUrl } from './config';

export type MobileLedgerDevice = {
  id: string;
  name: string;
};

export type MobileLedgerAccount = {
  index: number;
  address: string;
  derivationPath: string;
  lamports: number;
  balanceLabel: string;
};

export async function requestMobileLedgerPermissions(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 31) return;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
  ]);
  if (
    result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] !== PermissionsAndroid.RESULTS.GRANTED ||
    result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] !== PermissionsAndroid.RESULTS.GRANTED
  ) {
    throw new Error('Bluetooth permission is required to connect to Ledger.');
  }
}

export async function scanMobileLedgerDevices(
  onDevice: (device: MobileLedgerDevice) => void
): Promise<() => void> {
  await requestMobileLedgerPermissions();
  const supported = await TransportBLE.isSupported();
  if (!supported) throw new Error('Bluetooth Ledger connections are not supported on this device.');

  const subscription = TransportBLE.listen({
    next: (event) => {
      if (event.type !== 'add' || !event.descriptor?.id) return;
      onDevice({
        id: String(event.descriptor.id),
        name: String(event.descriptor.name ?? event.deviceModel?.productName ?? 'Ledger')
      });
    },
    error: (error) => {
      console.warn('[Grape mobile] Ledger scan failed', error);
    },
    complete: () => undefined
  });
  return () => subscription.unsubscribe();
}

export async function scanMobileLedgerAccounts(deviceId: string, count = 10): Promise<MobileLedgerAccount[]> {
  const transport = await TransportBLE.open(deviceId, 15_000);
  try {
    const ledger = new Solana(transport);
    const web3 = await import('@solana/web3.js');
    const connection = new web3.Connection(getMobileSolanaRpcUrl('mainnet-beta'), 'confirmed');
    const pathCandidates = Array.from({ length: count }, (_value, index) => [
      { index, derivationPath: `44'/501'/${index}'` },
      { index, derivationPath: `44'/501'/${index}'/0'` }
    ]).flat();
    const accounts: Array<Omit<MobileLedgerAccount, 'lamports' | 'balanceLabel'>> = [];
    const seenAddresses = new Set<string>();
    for (const candidate of pathCandidates) {
      const { index, derivationPath } = candidate;
      const result = await ledger.getAddress(derivationPath, false);
      const address = new web3.PublicKey(result.address).toBase58();
      if (seenAddresses.has(address)) continue;
      seenAddresses.add(address);
      accounts.push({
        index,
        address,
        derivationPath
      });
    }
    const infos = await connection.getMultipleAccountsInfo(accounts.map((account) => new web3.PublicKey(account.address)));
    return accounts.map((account, index) => {
      const lamports = infos[index]?.lamports ?? 0;
      return {
        ...account,
        lamports,
        balanceLabel: `${(lamports / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
      };
    }).sort((left, right) => right.lamports - left.lamports || left.index - right.index || left.derivationPath.localeCompare(right.derivationPath));
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function signAndSendMobileLedgerTransaction(input: {
  deviceId: string;
  derivationPath: string;
  publicKey: string;
  transaction: Transaction;
}): Promise<string> {
  const transport = await TransportBLE.open(input.deviceId, 15_000);
  try {
    const ledger = new Solana(transport);
    const result = await ledger.signTransaction(input.derivationPath, Buffer.from(input.transaction.serializeMessage()));
    const web3 = await import('@solana/web3.js');
    input.transaction.addSignature(new web3.PublicKey(input.publicKey), result.signature);
    const connection = new web3.Connection(getMobileSolanaRpcUrl('mainnet-beta'), 'confirmed');
    return await connection.sendRawTransaction(input.transaction.serialize());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Ledger signing failed. Unlock the device, open the Solana app, and try again. ${message}`);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function signMobileLedgerMessage(input: {
  deviceId: string;
  derivationPath: string;
  message: Uint8Array;
}): Promise<Buffer> {
  const transport = await TransportBLE.open(input.deviceId, 15_000);
  try {
    const ledger = new Solana(transport);
    return (await ledger.signOffchainMessage(input.derivationPath, Buffer.from(input.message))).signature;
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function signMobileLedgerSerializedTransaction(input: {
  deviceId: string;
  derivationPath: string;
  publicKey: string;
  transaction: string;
}): Promise<string> {
  const transport = await TransportBLE.open(input.deviceId, 15_000);
  try {
    const ledger = new Solana(transport);
    const web3 = await import('@solana/web3.js');
    const bytes = Buffer.from(input.transaction, 'base64');
    let versionedTransaction: InstanceType<typeof web3.VersionedTransaction> | null = null;
    try {
      versionedTransaction = web3.VersionedTransaction.deserialize(bytes);
    } catch {
      versionedTransaction = null;
    }
    if (versionedTransaction) {
      const signature = (await ledger.signTransaction(input.derivationPath, Buffer.from(versionedTransaction.message.serialize()))).signature;
      versionedTransaction.addSignature(new web3.PublicKey(input.publicKey), signature);
      return Buffer.from(versionedTransaction.serialize()).toString('base64');
    }
    const transaction = web3.Transaction.from(bytes);
    const signature = (await ledger.signTransaction(input.derivationPath, Buffer.from(transaction.serializeMessage()))).signature;
    transaction.addSignature(new web3.PublicKey(input.publicKey), signature);
    return transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function signAndSendMobileLedgerSerializedTransaction(input: {
  deviceId: string;
  derivationPath: string;
  publicKey: string;
  transaction: string;
}): Promise<string> {
  const signed = await signMobileLedgerSerializedTransaction(input);
  const web3 = await import('@solana/web3.js');
  const connection = new web3.Connection(getMobileSolanaRpcUrl('mainnet-beta'), 'confirmed');
  return connection.sendRawTransaction(Buffer.from(signed, 'base64'));
}
