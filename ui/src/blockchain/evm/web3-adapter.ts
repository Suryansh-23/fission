import { createWalletClient, Hex, http, WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface TransactionConfig {
  data?: string;
  to?: string;
}

export interface Web3Like {
  eth: {
    call(transactionConfig: TransactionConfig): Promise<string>;
  };
  extend(extension: unknown): any;
}

export class Web3LikeImpl implements Web3Like {
  private walletClient: WalletClient;

  constructor(walletClient: WalletClient) {
    this.walletClient = walletClient;
  }

  extend(_extension: unknown) {
    // Method not implemented - required by interface
    throw new Error("Method not implemented.");
  }

  eth = {
    call: async (transactionConfig: TransactionConfig): Promise<string> => {
      console.log('[Web3LikeImpl] ethCall:', {
        to: transactionConfig.to,
        data: transactionConfig.data,
      });

      const [account] = await this.walletClient.getAddresses();
      
      const txHash = await this.walletClient.sendTransaction({
        account,
        to: transactionConfig.to as Hex,
        data: transactionConfig.data as Hex,
        chain: null, // Let the client determine the chain
      });

      console.log('[Web3LikeImpl] Transaction sent:', txHash);
      return txHash;
    },
  };
}

/**
 * Create a Web3Like instance from private key
 * @param privateKey - Private key as hex string
 * @param rpcUrl - RPC URL for the blockchain
 * @param chain - Viem chain object
 * @returns Web3Like instance
 */
export function createWeb3LikeFromPrivateKey(
  privateKey: string,
  rpcUrl: string,
  chain: any
): Web3Like {
  const account = privateKeyToAccount(privateKey as Hex);
  
  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
    chain,
  });

  return new Web3LikeImpl(walletClient);
}

/**
 * Create a Web3Like instance from wagmi wallet client
 * @param walletClient - Wagmi wallet client
 * @returns Web3Like instance
 */
export function createWeb3LikeFromWagmi(walletClient: WalletClient): Web3Like {
  return new Web3LikeImpl(walletClient);
}
