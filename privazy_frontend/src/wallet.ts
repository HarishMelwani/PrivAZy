import { EmbeddedWallet } from '@aztec/wallets/embedded';
import { Fr, Fq } from '@aztec/aztec.js/fields';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { AztecIndexedDBStore } from '@aztec/kv-store/deprecated/indexeddb';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import { STANDARD_AUTH_REGISTRY_ADDRESS } from '@aztec/standard-contracts/auth-registry/constants';
import { getNodeUrl } from './config';

const WALLET_STORE_NAME = 'privazy-wallet';
const PXE_STORE_NAME = 'privazy-pxe';

export type ProgressFn = (text: string) => void;

/** iPhone / iPad (including iPadOS that reports as Macintosh). */
export function isIosBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return (
    navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1
  );
}

/** bb.js options for the PXE prover on memory-constrained Safari/iOS. */
export function bbProverOptionsForBrowser() {
  if (!isIosBrowser()) return {};
  return {
    threads: 1,
    srsSize: 2 ** 18,
    memory: { initial: 37, maximum: 2 ** 14 },
  };
}

export interface CreateWalletOptions {
  proverEnabled?: boolean;
  onProgress?: ProgressFn;
}

/**
 * Whitelist ONLY the canonical registry contracts for cross-contract utility
 * calls made during private execution (handshake discovery / SingleUseClaim),
 * never arbitrary targets.
 */
const authorizeUtilityCall = async (request: {
  target: AztecAddress;
  functionName?: string;
}) => {
  if (
    request.target.equals(STANDARD_HANDSHAKE_REGISTRY_ADDRESS) ||
    request.target.equals(STANDARD_AUTH_REGISTRY_ADDRESS)
  ) {
    return { authorized: true };
  }
  return {
    authorized: false,
    reason: `Unauthorized utility call to ${request.functionName ?? ''} on ${String(request.target)}`,
  };
};

/**
 * Create a hardened embedded wallet for the browser.
 *
 * Unlike the bare `EmbeddedWallet.create(url)`, this:
 * - uses IndexedDB-backed stores (fixed names, persistent across reloads)
 *   instead of sqlite-opfs WASM workers, which can hang indefinitely in some
 *   Chromium embeds / after COEP;
 * - tunes the proving backend for memory-constrained mobile browsers;
 * - whitelists ONLY the canonical registry contracts for cross-contract
 *   utility calls made during private execution (handshake discovery /
 *   SingleUseClaim), never arbitrary targets.
 */
export async function createWallet({
  proverEnabled = false,
  onProgress,
}: CreateWalletOptions = {}) {
  onProgress?.('Opening local PXE (IndexedDB)...');
  const node = createAztecNodeClient(getNodeUrl());
  const log = createLogger('privazy');
  const pxeStore: AztecAsyncKVStore = await AztecIndexedDBStore.open(
    log.createChild('pxe'),
    PXE_STORE_NAME,
    false,
  );
  const walletStore: AztecAsyncKVStore = await AztecIndexedDBStore.open(
    log.createChild('wallet'),
    WALLET_STORE_NAME,
    false,
  );
  const bbOptions = bbProverOptionsForBrowser();
  onProgress?.(
    bbOptions && bbOptions.threads === 1
      ? 'Starting wallet (iPhone: single-thread prover)...'
      : 'Starting wallet...',
  );
  return EmbeddedWallet.create(node, {
    pxeConfig: { proverEnabled },
    pxeOptions: {
      store: pxeStore,
      proverOrOptions: bbOptions,
      hooks: {
        authorizeUtilityCall,
      },
    },
    walletDb: { store: walletStore },
  });
}

export interface CreateSessionAccountResult {
  address: import('@aztec/aztec.js/addresses').AztecAddress;
}

/**
 * Remember which identity is active so reconnects resume it even when several
 * accounts exist in this browser (e.g. after importing a backup).
 */
const ACTIVE_ACCOUNT_KEY = 'privazy.activeAccount.v1';

export function getActiveAddress(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export function setActiveAddress(address: string) {
  try {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, address);
  } catch {
    /* storage unavailable, ignore */
  }
}

/**
 * Recover the persistent account, or mint a fresh one on first run.
 *
 * The account address is derived purely from random keys (no on-chain
 * deployment). Keys are stored in the persistent wallet DB, so the same
 * identity and inbox survive reloads.
 */
export async function createSessionAccount(
  wallet: EmbeddedWallet,
): Promise<CreateSessionAccountResult> {
  const existing = await wallet.getAccounts();
  if (existing.length > 0) {
    const active = getActiveAddress();
    const found = active
      ? existing.find((a) => a.item.toString() === active)
      : undefined;
    return { address: (found ?? existing[0]).item };
  }
  const account = await wallet.createSchnorrInitializerlessAccount(
    Fr.random(),
    Fr.random(),
    Fq.random(),
  );
  setActiveAddress(account.address.toString());
  return { address: account.address };
}

/** Portable backup file: everything needed to recreate the same wallet anywhere. */
export interface WalletBackup {
  format: 'privazy-backup';
  version: 1;
  app: 'PrivAZy';
  createdAt: string;
  /** Aztec address this backup restores (informational; derived from keys). */
  address: string;
  secretKey: string;
  salt: string;
  signingKey: string;
}

/**
 * Export an account's keys from the persistent wallet DB as a portable backup.
 *
 * WARNING: the returned file IS the identity — anyone holding it can read that
 * inbox and send as that address.
 */
export async function exportAccountBackup(
  wallet: EmbeddedWallet,
  address: import('@aztec/aztec.js/addresses').AztecAddress,
): Promise<WalletBackup> {
  type RetrieveShape = {
    retrieveAccount: (a: import('@aztec/aztec.js/addresses').AztecAddress) => Promise<{
      secretKey: Fr;
      salt: Fr;
      signingKey: Buffer;
    }>;
  };
  const walletDB = (wallet as unknown as { walletDB?: RetrieveShape }).walletDB;
  if (!walletDB?.retrieveAccount) {
    throw new Error('Wallet database is not available for export.');
  }
  const account = await walletDB.retrieveAccount(address);
  return {
    format: 'privazy-backup',
    version: 1,
    app: 'PrivAZy',
    createdAt: new Date().toISOString(),
    address: address.toString(),
    secretKey: account.secretKey.toString(),
    salt: account.salt.toString(),
    signingKey: `0x${Buffer.from(account.signingKey).toString('hex')}`,
  };
}

/** Parse + validate backup file text. Throws with a user-friendly message. */
export function parseWalletBackup(text: string): WalletBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid backup file (invalid JSON).');
  }
  const b = data as Partial<WalletBackup>;
  const isHex = (v: unknown) =>
    typeof v === 'string' && /^0x[0-9a-fA-F]{2,}$/.test(v);
  if (b.format !== 'privazy-backup' || b.version !== 1) {
    throw new Error('This file is not a PrivAZy wallet backup.');
  }
  if (!isHex(b.secretKey) || !isHex(b.salt) || !isHex(b.signingKey)) {
    throw new Error('Backup file is missing valid account keys.');
  }
  return b as WalletBackup;
}

/**
 * Recreate the exact wallet described by a backup file in this browser.
 *
 * Address is deterministic from (secretKey, salt, signingKey), so restoring on
 * any device yields the same identity. Re-importing into the same browser is a
 * no-op (storeAccount overwrites silently). After restore, re-syncing the PXE
 * rediscovers the note history via handshake tags — give it a moment.
 */
export async function importAccountFromBackup(
  wallet: EmbeddedWallet,
  backup: WalletBackup,
): Promise<import('@aztec/aztec.js/addresses').AztecAddress> {
  const existing = await wallet.getAccounts();
  const match =
    backup.address &&
    existing.find((a) => a.item.toString() === backup.address);
  if (match) {
    setActiveAddress(match.item.toString());
    return match.item;
  }
  const account = await wallet.createSchnorrInitializerlessAccount(
    Fr.fromString(backup.secretKey),
    Fr.fromString(backup.salt),
    new Fq(Buffer.from(backup.signingKey.slice(2), 'hex')),
  );
  setActiveAddress(account.address.toString());
  return account.address;
}
