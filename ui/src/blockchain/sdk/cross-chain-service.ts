// Mock SDK implementation for development

// Mock types to replace SDK types
export enum OrderStatus {
  Pending = "pending",
  Executed = "executed",
  Expired = "expired",
  Refunded = "refunded",
  Cancelled = "cancelled",
  Refunding = "refunding"
}

export enum PresetEnum {
  fast = "fast",
  medium = "medium",
  slow = "slow"
}

export interface CrossChainQuote {
  quoteId: string;
  srcTokenAmount: string;
  dstTokenAmount: string;
  presets: {
    [PresetEnum.fast]: {
      secretsCount: number;
      auctionDuration: number;
      startAmount: string;
      costInDstToken: string;
    };
    [PresetEnum.medium]: {
      secretsCount: number;
      auctionDuration: number;
      startAmount: string;
      costInDstToken: string;
    };
    [PresetEnum.slow]: {
      secretsCount: number;
      auctionDuration: number;
      startAmount: string;
      costInDstToken: string;
    };
  };
  recommendedPreset: string;
}

export interface CreateOrderRequest {
  amount: string;
  srcChainId: number;
  dstChainId: number;
  srcTokenAddress: string;
  dstTokenAddress: string;
  walletAddress: string;
  preset?: PresetEnum;
}

export interface OrderCreationResult {
  hash: string;
  quoteId: string;
  order: any;
  secrets: string[];
  secretHashes: string[];
}

export interface OrderStatusResponse {
  status: OrderStatus;
}

export interface SecretFillsResponse {
  fills: Array<{ idx: number }>;
}

export class CrossChainSDKService {
  private initialized = false;

  constructor() {
    // Mock constructor - no need to store unused values
  }

  /**
   * Initialize SDK with private key (for development/testing)
   */
  public initializeWithPrivateKey(): void {
    try {
      console.log('[CrossChainSDK] Initializing mock SDK for development');
      this.initialized = true;
    } catch (error) {
      console.error('[CrossChainSDK] Failed to initialize:', error);
    }
  }

  /**
   * Check if SDK is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Initialize SDK with wagmi wallet client (for production)
   */
  public initializeWithWallet(_walletClient: any): void {
    console.log('[CrossChainSDK] Initialized with wallet client');
    this.initialized = true;
  }

  /**
   * Get quote for cross-chain swap (mock implementation)
   */
  public async getQuote(params: CreateOrderRequest): Promise<CrossChainQuote> {
    if (!this.initialized) {
      throw new Error('SDK not initialized');
    }

    console.log('[CrossChainSDK] Getting quote:', params);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create mock quote
    const mockQuote: CrossChainQuote = {
      quoteId: `mock-${Date.now()}`,
      srcTokenAmount: params.amount,
      dstTokenAmount: (BigInt(params.amount) * BigInt(98) / BigInt(100)).toString(), // 2% slippage
      presets: {
        [PresetEnum.fast]: {
          secretsCount: 1,
          auctionDuration: 180,
          startAmount: params.amount,
          costInDstToken: "1000000",
        },
        [PresetEnum.medium]: {
          secretsCount: 1,
          auctionDuration: 360,
          startAmount: params.amount,
          costInDstToken: "800000",
        },
        [PresetEnum.slow]: {
          secretsCount: 1,
          auctionDuration: 600,
          startAmount: params.amount,
          costInDstToken: "600000",
        }
      },
      recommendedPreset: PresetEnum.fast,
    };

    console.log('[CrossChainSDK] Mock quote generated:', mockQuote.quoteId);
    return mockQuote;
  }

  /**
   * Create and submit cross-chain order (mock implementation)
   */
  public async createAndSubmitOrder(
    quote: CrossChainQuote,
    _walletAddress: string,
    preset: PresetEnum = PresetEnum.fast
  ): Promise<OrderCreationResult> {
    if (!this.initialized) {
      throw new Error('SDK not initialized');
    }

    console.log('[CrossChainSDK] Creating mock order with preset:', preset);

    // Simulate order creation delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const presetData = quote.presets[preset];
    const secretsCount = presetData.secretsCount;

    const secrets = Array.from({ length: secretsCount }).map(
      () => "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
    );

    const secretHashes = secrets.map(() => "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));

    const orderHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    console.log('[CrossChainSDK] Mock order created:', orderHash);

    return {
      hash: orderHash,
      quoteId: quote.quoteId,
      order: { mock: true },
      secrets,
      secretHashes,
    };
  }

  /**
   * Get orders ready to accept secret fills (mock implementation)
   */
  public async getReadyToAcceptSecretFills(orderHash: string): Promise<SecretFillsResponse> {
    console.log('[CrossChainSDK] Checking for secret fills:', orderHash);
    
    // Randomly return fills to simulate progression
    const shouldFill = Math.random() > 0.5;
    
    return {
      fills: shouldFill ? [{ idx: 0 }] : []
    };
  }

  /**
   * Submit secret for order (mock implementation)
   */
  public async submitSecret(orderHash: string, _secret: string): Promise<void> {
    console.log('[CrossChainSDK] Submitting secret for order:', orderHash);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * Get order status (mock implementation)
   */
  public async getOrderStatus(orderHash: string): Promise<OrderStatusResponse> {
    console.log('[CrossChainSDK] Getting order status:', orderHash);
    
    // Simulate status progression
    const statuses = [OrderStatus.Pending, OrderStatus.Executed];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    return { status: randomStatus };
  }

  /**
   * Monitor order until completion (mock implementation)
   */
  public async monitorOrder(
    orderHash: string,
    _secrets: string[],
    onSecretSubmitted?: (idx: number) => void,
    onStatusUpdate?: (status: OrderStatus) => void
  ): Promise<OrderStatusResponse> {
    console.log('[CrossChainSDK] Starting mock order monitoring:', orderHash);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Simulate monitoring process
    let currentStatus = OrderStatus.Pending;
    onStatusUpdate?.(currentStatus);

    // Simulate secret submission after 2 seconds
    await sleep(2000);
    onSecretSubmitted?.(0);

    // Simulate completion after 5 seconds
    await sleep(3000);
    currentStatus = OrderStatus.Executed;
    onStatusUpdate?.(currentStatus);

    console.log('[CrossChainSDK] Mock order monitoring complete:', currentStatus);
    return { status: currentStatus };
  }
}

// Export singleton instance
export const crossChainSDK = new CrossChainSDKService();
export default crossChainSDK;

// Export types
export type { CrossChainQuote as Quote };
