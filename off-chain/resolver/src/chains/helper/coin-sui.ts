import { SuiClient, SuiTransactionBlockResponse } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

export interface CoinInfo {
  coinObjectId: string;
  balance: bigint;
  coinType: string;
  version: string;
  digest: string;
}

export class SuiCoinHelper {
  private client: SuiClient;
  private keypair: Ed25519Keypair;

  // Standard coin types
  public static readonly SUI_TYPE = "0x2::sui::SUI";
  public static readonly SUI_PACKAGE_ID = "0x2";

  // Common decimal conversions
  public static readonly SUI_DECIMALS = 9;
  public static readonly MIST_PER_SUI = BigInt(
    10 ** SuiCoinHelper.SUI_DECIMALS
  );

  constructor(client: SuiClient, keypair: Ed25519Keypair) {
    this.client = client;
    this.keypair = keypair;
  }

  /**
   * Get all coins of a specific type owned by the keypair's address
   */
  async getCoins(
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<CoinInfo[]> {
    const response = await this.client.getCoins({
      owner: this.keypair.getPublicKey().toSuiAddress(),
      coinType,
    });

    return response.data.map((coin) => ({
      coinObjectId: coin.coinObjectId,
      balance: BigInt(coin.balance),
      coinType: coin.coinType,
      version: coin.version,
      digest: coin.digest,
    }));
  }

  /**
   * Get total balance for a specific coin type
   */
  async getTotalBalance(
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<bigint> {
    const response = await this.client.getBalance({
      owner: this.keypair.getPublicKey().toSuiAddress(),
      coinType,
    });

    return BigInt(response.totalBalance);
  }

  /**
   * Get the largest coin of a specific type (useful for gas coin selection)
   */
  async getLargestCoin(
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<CoinInfo | null> {
    const coins = await this.getCoins(coinType);

    if (coins.length === 0) {
      return null;
    }

    return coins.reduce((largest, current) =>
      current.balance > largest.balance ? current : largest
    );
  }

  /**
   * Select coins that sum up to at least the required amount
   */
  async selectCoinsForAmount(
    amount: bigint,
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<CoinInfo[]> {
    const coins = await this.getCoins(coinType);

    if (coins.length === 0) {
      throw new Error(`No coins of type ${coinType} available`);
    }

    // Sort coins by balance descending to minimize number of coins needed
    coins.sort((a, b) => (b.balance > a.balance ? 1 : -1));

    const selectedCoins: CoinInfo[] = [];
    let totalSelected = BigInt(0);

    for (const coin of coins) {
      selectedCoins.push(coin);
      totalSelected += coin.balance;

      if (totalSelected >= amount) {
        break;
      }
    }

    if (totalSelected < amount) {
      throw new Error(
        `Insufficient balance. Required: ${amount}, Available: ${totalSelected}`
      );
    }

    return selectedCoins;
  }

  /**
   * Split a coin into multiple parts
   */
  async splitCoin(
    coinId: string,
    amounts: bigint[],
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    // Split the coin
    const splitCoins = tx.splitCoins(tx.object(coinId), amounts);

    // Transfer split coins back to the owner
    tx.transferObjects(
      [splitCoins].flat(),
      this.keypair.getPublicKey().toSuiAddress()
    );

    return await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
  }

  /**
   * Merge multiple coins into one
   */
  async mergeCoins(
    primaryCoinId: string,
    coinIdsToMerge: string[],
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<SuiTransactionBlockResponse> {
    if (coinIdsToMerge.length === 0) {
      throw new Error("No coins to merge");
    }

    const tx = new Transaction();

    // Merge coins into the primary coin
    tx.mergeCoins(
      tx.object(primaryCoinId),
      coinIdsToMerge.map((id) => tx.object(id))
    );

    return await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
  }

  /**
   * Prepare coins for a transaction that needs a specific amount
   * This will merge/split coins as needed to get the exact amount
   */
  async prepareCoinsForTransaction(
    amount: bigint,
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<{ coinId: string; needsPreparation: boolean }> {
    const coins = await this.selectCoinsForAmount(amount, coinType);

    // If we have exactly one coin with the exact amount, no preparation needed
    if (coins.length === 1 && coins[0].balance === amount) {
      return {
        coinId: coins[0].coinObjectId,
        needsPreparation: false,
      };
    }

    // If we have exactly one coin with more than needed, we can split it
    if (coins.length === 1 && coins[0].balance > amount) {
      // We'll split in the actual transaction, so return the coin ID
      return {
        coinId: coins[0].coinObjectId,
        needsPreparation: false, // We can handle splitting in the transaction
      };
    }

    // If we have multiple coins, merge them first
    const primaryCoin = coins[0];
    const coinsToMerge = coins.slice(1).map((coin) => coin.coinObjectId);

    await this.mergeCoins(primaryCoin.coinObjectId, coinsToMerge, coinType);

    return {
      coinId: primaryCoin.coinObjectId,
      needsPreparation: true,
    };
  }

  /**
   * Transfer coins to another address
   */
  async transferCoins(
    recipient: string,
    amount: bigint,
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    if (coinType === SuiCoinHelper.SUI_PACKAGE_ID) {
      // For SUI, we can use gas coin
      const [coin] = tx.splitCoins(tx.gas, [amount]);
      tx.transferObjects([coin], recipient);
    } else {
      // For other tokens, we need to select and prepare coins
      const selectedCoins = await this.selectCoinsForAmount(amount, coinType);

      if (selectedCoins.length === 1 && selectedCoins[0].balance === amount) {
        // Transfer the entire coin
        tx.transferObjects(
          [tx.object(selectedCoins[0].coinObjectId)],
          recipient
        );
      } else {
        // Need to merge and/or split
        const primaryCoin = selectedCoins[0];
        const coinsToMerge = selectedCoins
          .slice(1)
          .map((coin) => coin.coinObjectId);

        if (coinsToMerge.length > 0) {
          tx.mergeCoins(
            tx.object(primaryCoin.coinObjectId),
            coinsToMerge.map((id) => tx.object(id))
          );
        }

        const [coinToTransfer] = tx.splitCoins(
          tx.object(primaryCoin.coinObjectId),
          [amount]
        );
        tx.transferObjects([coinToTransfer], recipient);
      }
    }

    return await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });
  }

  /**
   * Convert SUI to MIST (smallest unit)
   */
  static suiToMist(suiAmount: number | string): bigint {
    const sui =
      typeof suiAmount === "string" ? parseFloat(suiAmount) : suiAmount;
    return BigInt(Math.floor(sui * 10 ** SuiCoinHelper.SUI_DECIMALS));
  }

  /**
   * Convert MIST to SUI
   */
  static mistToSui(mistAmount: bigint): string {
    const divisor = BigInt(10 ** SuiCoinHelper.SUI_DECIMALS);
    const suiWhole = mistAmount / divisor;
    const suiFraction = mistAmount % divisor;

    if (suiFraction === BigInt(0)) {
      return suiWhole.toString();
    }

    const fractionStr = suiFraction
      .toString()
      .padStart(SuiCoinHelper.SUI_DECIMALS, "0");
    const trimmedFraction = fractionStr.replace(/0+$/, "");

    return `${suiWhole}.${trimmedFraction}`;
  }

  /**
   * Get coin metadata for a given coin type
   */
  async getCoinMetadata(coinType: string) {
    return await this.client.getCoinMetadata({ coinType });
  }

  /**
   * Validate that we have sufficient balance for a transaction
   */
  async validateSufficientBalance(
    amount: bigint,
    coinType: string = SuiCoinHelper.SUI_PACKAGE_ID
  ): Promise<boolean> {
    const totalBalance = await this.getTotalBalance(coinType);
    return totalBalance >= amount;
  }
}
