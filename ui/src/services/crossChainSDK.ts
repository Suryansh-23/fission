// Import from local cross-chain-sdk package
import {
  HashLock,
  NetworkEnum,
  PresetEnum,
  SDK,
} from "../../../cross-chain-sdk/src";
import { OrderStatus, ReadyToAcceptSecretFills, OrderStatusResponse } from "../../../cross-chain-sdk/src/api/orders/types";
import { Quote } from "../../../cross-chain-sdk/src/api/quoter/quote/quote";
import { OrderParams, OrderInfo, PreparedOrder } from "../../../cross-chain-sdk/src/sdk/types";

class CrossChainSDKService {
  private sdk: SDK | null = null;
  private initialized = false;

  constructor() {
    this.initializeSDK();
  }

  private async initializeSDK() {
    try {
      // Initialize SDK with environment variables
      this.sdk = new SDK({
        url: import.meta.env.VITE_FUSION_API_URL || 'http://localhost:3000',
        authKey: import.meta.env.VITE_FUSION_AUTH_KEY,
        // TODO: Add blockchain provider when wallet is connected
        // blockchainProvider: new PrivateKeyProviderConnector(
        //   privateKey, // TODO: Get from wallet connection
        //   web3Instance // TODO: Get from wallet connection
        // ),
      });
      
      console.log('🔗 Cross-chain SDK initialized');
      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize Cross-chain SDK:', error);
    }
  }

  async getQuote(params: {
    amount: string;
    srcChainId: number;
    dstChainId: number;
    srcTokenAddress: string;
    dstTokenAddress: string;
    walletAddress: string;
    enableEstimate?: boolean;
  }): Promise<Quote> {
    if (!this.initialized || !this.sdk) {
      throw new Error('SDK not initialized');
    }

    try {
      console.log('📊 Getting quote for cross-chain swap:', params);
      
      // Use real SDK to get quote
      const quote = await this.sdk.getQuote({
        amount: params.amount,
        srcChainId: params.srcChainId,
        dstChainId: params.dstChainId,
        enableEstimate: params.enableEstimate ?? true,
        srcTokenAddress: params.srcTokenAddress,
        dstTokenAddress: params.dstTokenAddress,
        walletAddress: params.walletAddress,
      });

      console.log('✅ Quote received:', quote);
      return quote;
    } catch (error) {
      console.error('❌ Failed to get quote:', error);
      throw error;
    }
  }

  generateSecrets(count: number): string[] {
    console.log(`🔐 Generating ${count} secrets`);
    // Use crypto.getRandomValues for browser compatibility
    return Array.from({ length: count }).map(() => {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return "0x" + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    });
  }

  createHashLock(secrets: string[]): HashLock {
    console.log('🔒 Creating hash lock for secrets');
    return secrets.length === 1
      ? HashLock.forSingleFill(secrets[0])
      : HashLock.forMultipleFills(HashLock.getMerkleLeaves(secrets));
  }

  hashSecrets(secrets: string[]): string[] {
    console.log('🔗 Hashing secrets');
    return secrets.map((s) => HashLock.hashSecret(s));
  }

  async createOrder(
    quote: Quote,
    params: OrderParams
  ): Promise<PreparedOrder> {
    if (!this.initialized || !this.sdk) {
      throw new Error('SDK not initialized');
    }

    try {
      console.log('📝 Creating order:', params);
      
      // Use real SDK to create order
      const orderInfo = await this.sdk.createOrder(quote, params);

      console.log('✅ Order created:', orderInfo.hash);
      return orderInfo;
    } catch (error) {
      console.error('❌ Failed to create order:', error);
      throw error;
    }
  }

  async submitOrder(
    srcChainId: number,
    order: any,
    quoteId: string,
    secretHashes: string[]
  ): Promise<any> {
    if (!this.initialized || !this.sdk) {
      throw new Error('SDK not initialized');
    }

    try {
      console.log('📤 Submitting order:', { srcChainId, quoteId });
      
      // Use real SDK to submit order
      const orderInfo = await this.sdk.submitOrder(srcChainId, order, quoteId, secretHashes);
      
      console.log('✅ Order submitted successfully');
      return orderInfo;
    } catch (error) {
      console.error('❌ Failed to submit order:', error);
      throw error;
    }
  }

  async getReadyToAcceptSecretFills(orderHash: string): Promise<ReadyToAcceptSecretFills> {
    if (!this.initialized || !this.sdk) {
      throw new Error('SDK not initialized');
    }

    try {
      return await this.sdk.getReadyToAcceptSecretFills(orderHash);
    } catch (error) {
      console.error('❌ Failed to get ready secret fills:', error);
      throw error;
    }
  }

  async submitSecret(orderHash: string, secret: string): Promise<void> {
    if (!this.initialized || !this.sdk) {
      throw new Error('SDK not initialized');
    }

    try {
      console.log('🔓 Submitting secret for order:', orderHash);
      await this.sdk.submitSecret(orderHash, secret);
      console.log('✅ Secret submitted successfully');
    } catch (error) {
      console.error('❌ Failed to submit secret:', error);
      throw error;
    }
  }

  async getOrderStatus(orderHash: string): Promise<OrderStatusResponse> {
    if (!this.initialized || !this.sdk) {
      throw new Error('SDK not initialized');
    }

    try {
      return await this.sdk.getOrderStatus(orderHash);
    } catch (error) {
      console.error('❌ Failed to get order status:', error);
      throw error;
    }
  }

  async waitForOrderCompletion(
    orderHash: string,
    secrets: string[],
    onProgress?: (status: OrderStatus) => void
  ): Promise<OrderStatusResponse> {
    console.log('⏳ Waiting for order completion:', orderHash);

    while (true) {
      const secretsToShare = await this.getReadyToAcceptSecretFills(orderHash);

      if (secretsToShare.fills.length) {
        for (const { idx } of secretsToShare.fills) {
          await this.submitSecret(orderHash, secrets[idx]);
          console.log(`🔓 Shared secret ${idx}`);
        }
      }

      const orderStatusResponse = await this.getOrderStatus(orderHash);
      onProgress?.(orderStatusResponse.status);

      if (
        orderStatusResponse.status === OrderStatus.Executed ||
        orderStatusResponse.status === OrderStatus.Expired ||
        orderStatusResponse.status === OrderStatus.Refunded
      ) {
        console.log('🏁 Order completed with status:', orderStatusResponse.status);
        return orderStatusResponse;
      }

      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Export singleton instance
export const crossChainSDK = new CrossChainSDKService();
export default crossChainSDK;

// Export SDK types for use in components
export type { Quote, OrderParams, OrderInfo, OrderStatusResponse, PreparedOrder };
export { OrderStatus, PresetEnum, NetworkEnum };
