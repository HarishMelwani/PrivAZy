import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { loadContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr, Point } from '@aztec/aztec.js/fields';
import { PublicKeys } from '@aztec/aztec.js/keys';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { ContractInstanceWithAddress } from '@aztec/aztec.js/contracts';
import { getDefaultStandardPreloadedContracts } from '@aztec/standard-contracts/preloaded';
import SponsoredFPCArtifactJson from './generated/SponsoredFPC.json' with { type: 'json' };

// Official Sponsored FPC on the public testnet (see aztec docs "Getting started on
// testnet"). The `SPONSORED_FPC_SALT`-derived address no longer matches the deployed
// instance, so we pin the onchain preimage instead.
const SPONSORED_FPC_ADDRESS = AztecAddress.fromStringUnsafe(
  '0x130925fbd734a252e3d8ddff87f6c346052dd5c13314eb96026b32baa1923296',
);

// Public keys of the deployed instance (from aztec_getContract at the address above).
const SPONSORED_FPC_PUBLIC_KEYS = PublicKeys.from({
  npkMHash: Fr.fromString(
    '0x14fbaeaeddaa69be81d404c684e78e9f1a786d225faf8de2ce97c92f67d89a26',
  ),
  ivpkM: Point.fromString(
    '0x00c044b05b6ca83b9c2dbae79cc1135155956a64e136819136e9947fe5e5866c1c1f0ca244c7cd46b682552bff8ae77dea40b966a71de076ec3b7678f2bdb151',
  ),
  ovpkMHash: Fr.fromString(
    '0x0e60ed663a4da5636e2e25a1f1f0c5b27c011c8eaed22bbe61e2a0fd875dd24b',
  ),
  tpkMHash: Fr.fromString(
    '0x082c6d164b0ba073c9dd911100248c8ecd80b03f82f38531856a3c16dadcbef0',
  ),
  mspkMHash: Fr.fromString(
    '0x14a5d4bde495b8c3a9ba4aed0d4870526e46fdff22d341a2f689ac5a50d10356',
  ),
  fbpkMHash: Fr.fromString(
    '0x0f124f07811eebfaaa6d31316a2cc5bf255fa118f720e8ff1f2fc0d4aa46d496',
  ),
});

export async function getSponsoredFPCContract() {
  const artifact = loadContractArtifact(SponsoredFPCArtifactJson as any);
  const instance: ContractInstanceWithAddress = {
    version: 2,
    salt: Fr.ZERO,
    deployer: AztecAddress.ZERO,
    originalContractClassId: Fr.fromString(
      '0x184e81e5c5c27cdc1181dda8c05cdd04a2bf73f133cf568cacdb7f93728673a5',
    ),
    currentContractClassId: Fr.fromString(
      '0x184e81e5c5c27cdc1181dda8c05cdd04a2bf73f133cf568cacdb7f93728673a5',
    ),
    initializationHash: Fr.ZERO,
    immutablesHash: Fr.ZERO,
    publicKeys: SPONSORED_FPC_PUBLIC_KEYS,
    address: SPONSORED_FPC_ADDRESS,
  };
  return { instance, artifact };
}

export async function registerSponsoredFPC(wallet: Wallet) {
  const contract = await getSponsoredFPCContract();
  await wallet.registerContract(contract.instance, contract.artifact);
  for (const standard of await getDefaultStandardPreloadedContracts()) {
    await wallet.registerContract(standard.instance, standard.artifact);
  }
  return contract.instance.address;
}

export async function createSponsoredFeePayment() {
  const contract = await getSponsoredFPCContract();
  return new SponsoredFeePaymentMethod(contract.instance.address);
}
