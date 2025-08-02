import { 
  SDK as CrossChainSDK,
  Quote,
  OrderParams,
  OrderStatusResponse,
  CrossChainSDKConfigParams,
  QuoteParams,
  PreparedOrder
} from '@1inch/cross-chain-sdk';

// Define PresetEnum locally if not exported
export enum PresetEnum {
  fast = 'fast',
  medium = 'medium',
  slow = 'slow',
}

// Define OrderStatus locally if not exported  
export enum OrderStatus {
  Pending = 'pending',
  Executed = 'executed',
  Expired = 'expired',
  Refunded = 'refunded',
  Cancelled = 'cancelled',
}

class CrossChainSDKService {
  private sdk: CrossChainSDK | null = null;
  private initialized = false;

  constructor() {
    // Don't initialize immediately to avoid blocking the UI
    console.log('🔗 Cross-chain SDK service created, will initialize on first use');
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.sdk) {
      return;
    }

    try {
      console.log('🔗 Initializing Cross-chain SDK...');
      const config: CrossChainSDKConfigParams = {
        url: process.env.VITE_FUSION_API_URL || 'https://api.1inch.dev',
        authKey: process.env.VITE_FUSION_AUTH_KEY || '',
        blockchainProvider: {
          signTypedData: async () => '0x',
          ethCall: async () => '0x'
        }
      };
      
      this.sdk = new CrossChainSDK(config);
      this.initialized = true;
      console.log('✅ Cross-chain SDK initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Cross-chain SDK:', error);
      throw error;
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
    await this.ensureInitialized();
    console.log('📊 Getting quote for cross-chain swap:', params);
    
    const quoteParams: QuoteParams = {
      amount: params.amount,
      srcChainId: params.srcChainId,
      dstChainId: params.dstChainId,
      srcTokenAddress: params.srcTokenAddress,
      dstTokenAddress: params.dstTokenAddress,
      walletAddress: params.walletAddress,
      enableEstimate: params.enableEstimate || false
    };

    const quote = await this.sdk!.getQuote(quoteParams);
    console.log('✅ Quote received:', quote.quoteId);
    return quote;
  }

  generateSecrets(count: number): string[] {
    console.log(`🔐 Generating ${count} secrets`);
    // Generate random secrets using browser-compatible crypto
    return Array.from({ length: count }, () => {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return '0x' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    });
  }

  createHashLock(secrets: string[]): any {
    console.log('🔒 Creating hash lock for secrets');
    // Implement hash lock creation logic
    return { type: secrets.length === 1 ? 'single' : 'multiple', secrets };
  }

  hashSecrets(secrets: string[]): string[] {
    console.log('🔗 Hashing secrets');
    // Generate hash placeholders using browser-compatible crypto
    return secrets.map(() => {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return '0x' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    });
  }

  async createOrder(quote: Quote, params: OrderParams): Promise<{ hash: string; quoteId: string; order: any }> {
    await this.ensureInitialized();
    console.log('📝 Creating order:', params);
    
    const preparedOrder: PreparedOrder = await this.sdk!.createOrder(quote, params);
    console.log('✅ Order created');
    
    // Convert to expected OrderInfo format
    return {
      hash: 'order-hash-placeholder', // Will need proper implementation
      quoteId: quote.quoteId || '',
      order: preparedOrder.order
    };
  }

  async submitOrder(
    srcChainId: number,
    order: any,
    quoteId: string,
    secretHashes: string[]
  ): Promise<any> {
    await this.ensureInitialized();
    console.log('📤 Submitting order:', { srcChainId, quoteId });
    
    const result = await this.sdk!.submitOrder(srcChainId, order, quoteId, secretHashes);
    console.log('✅ Order submitted successfully');
    return result;
  }

  async getReadyToAcceptSecretFills(orderHash: string): Promise<{ fills: Array<{ idx: number }> }> {
    await this.ensureInitialized();
    console.log('🔍 Getting ready secret fills:', orderHash);
    const response = await this.sdk!.getReadyToAcceptSecretFills(orderHash);
    return { fills: response.fills || [] };
  }

  async submitSecret(orderHash: string, secret: string): Promise<void> {
    await this.ensureInitialized();
    console.log('🔓 Submitting secret for order:', orderHash);
    return await this.sdk!.submitSecret(orderHash, secret);
  }

  async getOrderStatus(orderHash: string): Promise<OrderStatusResponse> {
    await this.ensureInitialized();
    console.log('📊 Getting order status:', orderHash);
    return await this.sdk!.getOrderStatus(orderHash);
  }

  async waitForOrderCompletion(
    orderHash: string,
    _secrets: string[],
    onProgress?: (status: OrderStatus) => void
  ): Promise<OrderStatusResponse> {
    console.log('⏳ Waiting for order completion:', orderHash);
    
    // Poll for order completion
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const status = await this.getOrderStatus(orderHash);
          onProgress?.(status.status as OrderStatus);
          
          if (status.status === 'executed' || status.status === 'cancelled' || status.status === 'expired') {
            resolve(status);
          } else {
            setTimeout(checkStatus, 2000); // Check every 2 seconds
          }
        } catch (error) {
          reject(error);
        }
      };
      
      checkStatus();
    });
  }
}

// Export singleton instance
export const crossChainSDKInstance = new CrossChainSDKService();
export default crossChainSDKInstance;
