import { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { hexToBytes } from "viem";

export async function resolveCoinTypeFromPkg(
  client: SuiClient,
  owner: string,
  pkgId: string
): Promise<string> {
  // List all balances you own, then pick the ones from this package.
  const balances = await client.getAllBalances({ owner });
  const matches = balances
    .map((b) => b.coinType)
    .filter((t) => t.startsWith(`${pkgId}::`));
  if (!matches.length)
    throw new Error(`No coins from package ${pkgId} found for ${owner}`);

  // If multiple coins live under the same package, prefer symbol USDC:
  for (const t of matches) {
    const meta = await client.getCoinMetadata({ coinType: t });
    if (meta?.symbol === "USDC") return t;
  }
  return matches[0];
}

type CreateOrderArgs = {
  packageId: string; // e.g. '0x...'
  module?: string; // default 'order'
  coinType: string; // T, e.g. '0x2::sui::SUI' or some coin
  receiverEvmHex: `0x${string}`; // 20-byte EVM address as hexs
  takingAmount: bigint;
  makerAsset: string; // Move address (0x..)
  takerAsset: `0x${string}`; // vector<u8>
  saltHex: `0x${string}`;
  orderHash: `0x${string}`;
  isPartialFillAllowed: boolean;
  isMultipleFillsAllowed: boolean;
  depositAmount: bigint; // in the coin's smallest unit
  startTime: bigint;
  duration: bigint;
  initialRateBump: bigint;
  pointsAndTimeDeltasHex: `0x${string}`; // vector<u8>
  functionName?: string; // default 'create_order'
};

/**
 * Calls create_order<T> with a Coin<T> deposit produced via coinWithBalance.
 */
export async function createOrderMoveCall(
  client: SuiClient,
  signer: Ed25519Keypair,
  args: CreateOrderArgs
) {
  const {
    packageId,
    module = "order",
    functionName = "create_order",
    coinType,
    receiverEvmHex,
    takingAmount,
    makerAsset,
    takerAsset,
    saltHex,
    orderHash,
    isPartialFillAllowed,
    isMultipleFillsAllowed,
    depositAmount,
    startTime,
    duration,
    initialRateBump,
  } = args;

  const receiverBytes = hexToBytes(receiverEvmHex);
  if (receiverBytes.length !== 20)
    throw new Error("receiverEvmHex must be 20 bytes");

  const takerAssetBytes = hexToBytes(takerAsset);
  if (takerAssetBytes.length === 0)
    throw new Error("takerAsset must not be empty");

  const tx = new Transaction();
  // Required so coinWithBalance can resolve owned coins when not using the gas coin:
  tx.setSender(signer.getPublicKey().toSuiAddress());

  // Produce Coin<T> for the deposit amount:
  const depositCoin = coinWithBalance({
    balance: depositAmount,
    type: coinType,
  });

  tx.moveCall({
    target: `${packageId}::${module}::${functionName}`,
    typeArguments: [coinType],
    arguments: [
      // receiver: vector<u8>
      tx.pure.vector("u8", receiverBytes),
      // taking_amount
      tx.pure.u64(takingAmount),
      // maker_asset, taker_asset
      tx.pure.address(makerAsset),
      tx.pure.vector("u8", takerAssetBytes),
      // salt: vector<u8>
      tx.pure.vector("u8", hexToBytes(saltHex)),
      // order_hash: vector<u8>
      tx.pure.vector("u8", hexToBytes(orderHash)),
      // bool flags
      tx.pure("bool", isPartialFillAllowed),
      tx.pure("bool", isMultipleFillsAllowed),
      // deposit: Coin<T>
      depositCoin,
      // start_time, duration, initial_rate_bump
      tx.pure.u64(startTime),
      tx.pure.u64(duration),
      tx.pure.u64(initialRateBump),
      // points_and_time_deltas: vector<u8>
      tx.pure.vector("u8", hexToBytes("0x")),
    ],
  });

  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });

  if (res.errors) {
    throw new Error(`Failed to create order: ${JSON.stringify(res.errors)}`);
  }

  // (Optional) Wait until effects are indexable in subsequent RPC reads:
  await client.waitForTransaction({ digest: res.digest });

  return res;
}
