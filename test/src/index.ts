import {
  EvmCrossChainOrder,
  HashLock,
  NetworkEnum,
  OrderStatus,
  PresetEnum,
  PrivateKeyProviderConnector,
  SDK,
  SuiAddress,
  SuiCrossChainOrder,
} from "@1inch/cross-chain-sdk";
import { SuiClient } from "@mysten/sui/client";
import { fromBase64, toHex } from "@mysten/sui/utils";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { randomBytes } from "crypto";
import { createWalletClient, Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { createOrderMoveCall } from "./createOrder";

const evmPrivateKey = "<EVM_PRIV_KEY>";
const suiPrivateKey = "<SUI_PRIV_KEY>";

const suiKeyPair = Ed25519Keypair.fromSecretKey(suiPrivateKey);
const suiClient = new SuiClient({
  url: "https://fullnode.testnet.sui.io:443",
});

const rpc =
  "https://virtual.mainnet.eu.rpc.tenderly.co/7376d706-10d6-4d07-a8fd-c16c404805cc";
const authKey = "<1INCH_AUTH_KEY>";
const source = "sdk-tutorial";
// const url = "https://api.1inch.dev/fusion-plus";
const url = "http://localhost:3500"; // relayer address

const base64ToHex = (base64: string): Hex => {
  return `0x${Buffer.from(base64, "base64").toString("hex")}`;
};

// const web3 = new Web3(rpc);
// const walletAddress = web3.eth.accounts.privateKeyToAccount(privateKey).address;

// @ts-ignore
const account = privateKeyToAccount(evmPrivateKey);
const walletClient = createWalletClient({
  account,
  transport: http(rpc),
  chain: mainnet,
});

interface TransactionConfig {
  data?: string;
  to?: string;
}

interface Web3Like {
  eth: {
    call(transactionConfig: TransactionConfig): Promise<string>;
  };
  extend(extension: unknown): any;
}

class Web3LikeImpl implements Web3Like {
  extend(extension: unknown) {
    throw new Error("Method not implemented.");
  }
  eth = {
    call: async (transactionConfig: TransactionConfig): Promise<string> => {
      console.log("ethCall", {
        to: transactionConfig.to,
        data: transactionConfig.data,
      });

      const [account] = await walletClient.getAddresses();
      return await walletClient.sendTransaction({
        account,
        to: transactionConfig.to as Hex,
        data: transactionConfig.data as Hex,
      });
    },
  };
}

const sdk = new SDK({
  url,
  authKey,
  blockchainProvider: new PrivateKeyProviderConnector(
    evmPrivateKey,
    new Web3LikeImpl()
  ), // only required for order creation
});

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  // 10 USDT (Polygon) -> BNB (BSC)
  // estimate

  // SUI -> ETH
  const srcChainId = NetworkEnum.SUI;
  const dstChainId = NetworkEnum.ETHEREUM;

  // // ETH -> SUI [working]
  // const srcChainId = NetworkEnum.ETHEREUM;
  // const dstChainId = NetworkEnum.SUI;

  const walletAddress =
    // @ts-ignore
    srcChainId === NetworkEnum.SUI
      ? suiKeyPair.getPublicKey().toSuiAddress()
      : account.address;
  console.log("walletAddress:", walletAddress);

  const quote = await sdk.getQuote({
    amount: "100000",
    srcChainId,
    dstChainId,
    enableEstimate: true,
    srcTokenAddress:
      //@ts-ignore
      srcChainId === NetworkEnum.SUI
        ? "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29"
        : "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    dstTokenAddress:
      // @ts-ignore
      dstChainId === NetworkEnum.SUI
        ? "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29"
        : "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    walletAddress,
  });
  console.log("quote:", quote);

  const preset = PresetEnum.fast;

  console.log("secret count:", quote.presets[preset].secretsCount);
  // generate secrets
  const secrets = Array.from({
    length: quote.presets[preset].secretsCount,
  }).map(() => "0x" + randomBytes(32).toString("hex"));
  console.log("secrets:", secrets);

  const hashLock =
    secrets.length === 1
      ? HashLock.forSingleFill(secrets[0])
      : HashLock.forMultipleFills(HashLock.getMerkleLeaves(secrets));

  const secretHashes = secrets.map((s) => HashLock.hashSecret(s));
  console.log("secretHashes:", secretHashes);

  console.log(
    new SuiAddress(
      "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29"
    ),
    new SuiAddress(
      "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29"
    ).splitToParts()
  );

  // create order
  const { hash, quoteId, order } = await sdk.createOrder(quote, {
    walletAddress,
    hashLock,
    preset,
    source,
    secretHashes,
    nonce: BigInt(Math.floor(Math.random() * 1000000)),
    receiver:
      // @ts-ignore
      dstChainId === NetworkEnum.SUI
        ? "0xe82193fea2f65ff1e1a89934cf39215fc369ff7d46ee1d0e5864471c930794b2"
        : "0xCC42e700ae461bDf5b560e781110a965A8d43935",
  });
  console.log({ hash }, "order created");
  console.log("order:", order);
  console.log(
    "salt:",
    (order as EvmCrossChainOrder | SuiCrossChainOrder).salt.toString(16)
  );

  let suiOrderSignature: `0x${string}` | undefined;
  // @ts-ignore
  if (srcChainId === NetworkEnum.SUI) {
    suiOrderSignature = toHex(
      fromBase64(
        (
          await suiKeyPair.signPersonalMessage(
            new Uint8Array(Buffer.from(hash, "hex"))
          )
        )["signature"]
      )
    ) as `0x${string}`;
    console.log("suiOrderSignature:", suiOrderSignature);

    const res = await createOrderMoveCall(suiClient, suiKeyPair, {
      packageId:
        "0x3326bde934d5b06f176923554fff1f1ff2fff217fdd8daa81525a9a7dc7d67b4",
      coinType:
        "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC",
      receiverEvmHex: "0xCC42e700ae461bDf5b560e781110a965A8d43935",
      takingAmount: quote.dstTokenAmount,
      makerAsset:
        "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29",
      takerAsset: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      saltHex: `0x${(order as SuiCrossChainOrder).salt.toString(16)}`,
      orderHash: hash as `0x${string}`,
      isPartialFillAllowed: quote.presets[preset].allowPartialFills,
      isMultipleFillsAllowed: quote.presets[preset].allowMultipleFills,
      depositAmount: quote.srcTokenAmount,
      startTime:
        BigInt(Date.now()) +
        quote.presets[preset].startAuctionIn * BigInt(1000),
      duration: quote.presets[preset].auctionDuration * BigInt(1000),
      initialRateBump: BigInt(quote.presets[preset].initialRateBump),
      pointsAndTimeDeltasHex: `0x`,
    });

    console.log("createOrderMoveCall response:", res);
  }

  // submit order
  const _orderInfo = await sdk.submitOrder(
    quote.srcChainId,
    order,
    quoteId,
    secretHashes,
    // @ts-ignore
    srcChainId === NetworkEnum.SUI
      ? base64ToHex(suiKeyPair.getPublicKey().toBase64())
      : undefined,
    suiOrderSignature!
  );
  console.log({ hash }, "order submitted");

  // submit secrets for deployed escrows
  while (true) {
    const secretsToShare = await sdk.getReadyToAcceptSecretFills(hash);

    if (secretsToShare.fills.length) {
      for (const { idx } of secretsToShare.fills) {
        await sdk.submitSecret(hash, secrets[idx]);

        console.log({ idx }, "shared secret");
      }
    }

    // check if order finished
    const { status } = await sdk.getOrderStatus(hash);

    if (
      status === OrderStatus.Executed ||
      status === OrderStatus.Expired ||
      status === OrderStatus.Refunded
    ) {
      break;
    }

    await sleep(1000);
  }

  const statusResponse = await sdk.getOrderStatus(hash);
  console.log(statusResponse);
}

main();
