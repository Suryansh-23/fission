import { 
  SDK as CrossChainSDK,
  Quote,
  OrderParams,
  OrderStatusResponse,
  CrossChainSDKConfigParams,
  QuoteParams
} from '@1inch/cross-chain-sdk';
import { SuiOrder, CreateOrderParams } from './sui-order';
import { ERC20Service } from './erc20';
import suiClientService from './sui-client';

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
  private fillPreferences = { allowPartialFills: true, allowMultipleFills: true };

  constructor() {
    // Don't initialize immediately to avoid blocking the UI
    console.log('[CrossChainSDK] Cross-chain SDK service created, will initialize on first use');
  }

  setFillPreferences(preferences: { allowPartialFills: boolean; allowMultipleFills: boolean }): void {
    this.fillPreferences = preferences;
    console.log('[CrossChainSDK] Fill preferences set:', preferences);
  }

  private mapTokenToCoinType(tokenAddress: string): string {
    // Convert EVM token address to Sui coin type
    const addressStr = tokenAddress.toLowerCase();
    
    console.log('[CrossChainSDK] Mapping token address to Sui coin type:', addressStr);
    
    // For now, map everything to SUI. In production, this would need proper mapping
    if (addressStr === '0x0000000000000000000000000000000000000000' || 
        addressStr === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      console.log('[CrossChainSDK] Mapped to SUI (native token)');
      return SuiOrder.SUI_TYPE;
    }
    
    // TODO: Add USDC mapping and other tokens
    // For testing, default to SUI
    console.log('[CrossChainSDK] Using default SUI coin type for token:', addressStr);
    return SuiOrder.SUI_TYPE;
  }

  private mapTokenAddressToCoinType(tokenAddress: string): string {
    // Map from UI selected token address to Sui coin type
    console.log('[CrossChainSDK] Mapping token address to coin type:', tokenAddress);
    
    if (tokenAddress === '0x2::sui::SUI') {
      return SuiOrder.SUI_TYPE;
    } else if (tokenAddress === '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC') {
      return SuiOrder.USDC_TYPE;
    }
    
    // Default to SUI for unknown tokens
    console.log('[CrossChainSDK] Using default SUI type for unknown token:', tokenAddress);
    return SuiOrder.SUI_TYPE;
  }

  private convertToUint8Array(address: string): Uint8Array {
    // Convert token address to Uint8Array
    if (address.startsWith('0x')) {
      // EVM-style hex address
      return new Uint8Array(Buffer.from(address.replace('0x', ''), 'hex'));
    } else {
      // Sui-style address - convert to UTF8 bytes
      return new Uint8Array(Buffer.from(address, 'utf8'));
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.sdk) {
      return;
    }

    try {
      console.log('🔗 Initializing Cross-chain SDK...');
      const config: CrossChainSDKConfigParams = {
        url: import.meta.env.VITE_FUSION_API_URL || 'https://api.1inch.dev',
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
    console.log('[CrossChainSDK] Creating order with params:', params);
    console.log('[CrossChainSDK] Quote properties:', Object.keys(quote));
    
    // Extract token addresses from the quote context (these come from our mock quote)
    const srcTokenAddress = (quote as any).srcTokenAddress || '0x0000000000000000000000000000000000000000';
    const dstTokenAddress = (quote as any).dstTokenAddress || '0x0000000000000000000000000000000000000000';
    
    console.log('[CrossChainSDK] Extracted token addresses from quote:');
    console.log('[CrossChainSDK]   Source token address:', srcTokenAddress);
    console.log('[CrossChainSDK]   Destination token address:', dstTokenAddress);
    
    // Mock implementation for testing
    const mockOrder = {
      salt: '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join(''),
      maker: params.walletAddress,
      receiver: params.walletAddress,
      makingAmount: BigInt(quote.srcTokenAmount),
      takingAmount: BigInt(quote.dstTokenAmount),
      makerAsset: srcTokenAddress, // Use actual token addresses
      takerAsset: dstTokenAddress, // Use actual token addresses
    };
    
    const orderHash = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('[CrossChainSDK] Mock order created with real token addresses');
    console.log('[CrossChainSDK] Order hash:', orderHash);
    console.log('[CrossChainSDK] Salt:', mockOrder.salt);
    console.log('[CrossChainSDK] Maker asset (source token):', mockOrder.makerAsset);
    console.log('[CrossChainSDK] Taker asset (destination token):', mockOrder.takerAsset);
    
    return {
      hash: orderHash,
      quoteId: quote.quoteId || 'mock-quote-id',
      order: mockOrder
    };
  }

  async submitOrder(
    srcChainId: number,
    order: any,
    quoteId: string,
    _secretHashes: string[],
    receiverAddress?: string,
    selectedTokens?: { payToken: any, receiveToken: any },
    suiWallet?: any, // Add wallet parameter for Sui signing
    evmClients?: { walletClient: any, publicClient: any, account: string } // Add EVM clients for approval
  ): Promise<any> {
    console.log('[CrossChainSDK] Submitting order for chain:', srcChainId);
    console.log('[CrossChainSDK] Quote ID:', quoteId);
    console.log('[CrossChainSDK] Receiver address:', receiverAddress);
    console.log('[CrossChainSDK] Selected tokens:', selectedTokens);
    console.log('[CrossChainSDK] Sui wallet provided:', !!suiWallet);
    console.log('[CrossChainSDK] EVM clients provided:', !!evmClients);
    
    // Check if source chain is Sui (chainId 0)
    if (srcChainId === 0) {
      console.log('[CrossChainSDK] Source chain is Sui, creating Sui order...');
      return await this.createSuiOrder(order, quoteId, receiverAddress, selectedTokens, suiWallet);
    } else {
      console.log('[CrossChainSDK] Source chain is EVM, handling EVM approval and submission...');
      return await this.createEvmOrder(order, quoteId, receiverAddress, selectedTokens, evmClients);
    }
  }

  private async createSuiOrder(order: any, _quoteId: string, receiverAddress?: string, selectedTokens?: { payToken: any, receiveToken: any }, suiWallet?: any): Promise<any> {
    try {
      console.log('[CrossChainSDK] Creating Sui order with order data:', order);
      console.log('[CrossChainSDK] Receiver address provided:', receiverAddress);
      
      // Get Sui client and package ID
      // const suiClient = await suiClientService.getClient();
      const packageId = suiClientService.getPackageId();
      
      console.log('[CrossChainSDK] Sui package ID:', packageId);
      
      // Create SuiOrder instance (we'll need a keypair, using mock for now)
      // In real implementation, this would come from the connected wallet
      // const mockKeypair = null; // Will be replaced with actual wallet integration
      // const suiOrder = new SuiOrder(suiClient, mockKeypair as any);
      
      // Map token addresses using UI selected tokens if available
      let coinType: string;
      let makerAssetBytes: Uint8Array;
      let takerAssetBytes: Uint8Array;

      if (selectedTokens) {
        console.log('[CrossChainSDK] Using UI selected tokens for mapping:', {
          payToken: selectedTokens.payToken,
          receiveToken: selectedTokens.receiveToken
        });
        
        coinType = this.mapTokenAddressToCoinType(selectedTokens.payToken.address);
        makerAssetBytes = this.convertToUint8Array(selectedTokens.payToken.address);
        takerAssetBytes = this.convertToUint8Array(selectedTokens.receiveToken.address);
      } else {
        console.log('[CrossChainSDK] Using order token addresses (fallback)');
        coinType = this.mapTokenToCoinType(order.makerAsset);
        makerAssetBytes = new Uint8Array(Buffer.from(order.makerAsset.replace('0x', ''), 'hex'));
        takerAssetBytes = new Uint8Array(Buffer.from(order.takerAsset.replace('0x', ''), 'hex'));
      }

      console.log('[CrossChainSDK] Token mapping result:', {
        coinType,
        makerAssetLength: makerAssetBytes.length,
        takerAssetLength: takerAssetBytes.length
      });

      // Convert order data to CreateOrderParams format
      const createOrderParams: CreateOrderParams = {
        receiver: receiverAddress || order.maker, // Use provided EVM address or fallback to maker
        makingAmount: BigInt(order.makingAmount),
        takingAmount: BigInt(order.takingAmount),
        makerAsset: makerAssetBytes,
        takerAsset: takerAssetBytes,
        salt: new Uint8Array(Buffer.from(order.salt.replace('0x', ''), 'hex')),
        isPartialFillAllowed: this.fillPreferences.allowPartialFills,
        isMultipleFillsAllowed: this.fillPreferences.allowMultipleFills,
        depositAmount: BigInt(order.makingAmount), // Same as makingAmount
        coinType: coinType, // Use mapped coin type
        startTime: BigInt(Math.floor(Date.now() / 1000)),
        duration: BigInt(0), // Mock value
        initialRateBump: BigInt(0), // Mock value
        pointsAndTimeDeltas: new Uint8Array([]), // Mock value
      };
      
      console.log('[CrossChainSDK] Sui order params prepared:');
      console.log('[CrossChainSDK]   Receiver (EVM address):', createOrderParams.receiver);
      console.log('[CrossChainSDK]   Making Amount:', createOrderParams.makingAmount.toString());
      console.log('[CrossChainSDK]   Taking Amount:', createOrderParams.takingAmount.toString());
      console.log('[CrossChainSDK]   Coin Type:', createOrderParams.coinType);
      console.log('[CrossChainSDK]   Partial Fills Allowed:', createOrderParams.isPartialFillAllowed);
      console.log('[CrossChainSDK]   Multiple Fills Allowed:', createOrderParams.isMultipleFillsAllowed);
      console.log('[CrossChainSDK]   Salt length:', createOrderParams.salt.length, 'bytes');
      console.log('[CrossChainSDK]   Start Time:', createOrderParams.startTime.toString());
      console.log('[CrossChainSDK]   Fill preferences from service:', this.fillPreferences);
      
      // For production: Build transaction preview for testing, but prepare for wallet signing
      console.log('[CrossChainSDK] [PRODUCTION] Preparing Sui order with wallet integration...');
      
      // Get Sui client for the actual function call
      const suiClient = await suiClientService.getClient();
      
      // Create a SuiOrder instance for production (will use connected wallet when available)
      const suiOrder = new SuiOrder(suiClient, suiWallet || null);
      
      console.log('[CrossChainSDK] SuiOrder created with wallet:', !!suiWallet);
      console.log('[CrossChainSDK] Wallet type:', suiWallet ? typeof suiWallet : 'null');
      console.log('[CrossChainSDK] Wallet has signAndExecuteTransaction:', suiWallet && 'signAndExecuteTransaction' in suiWallet);
      
      // Build transaction for preview/validation
      const transaction = suiOrder.buildTransaction(createOrderParams, packageId);
      console.log('[CrossChainSDK] Built Sui transaction for preview');
      
      // For production, attempt to create the actual order
      try {
        console.log('[CrossChainSDK] Attempting to create order with wallet signing...');
        const result = await suiOrder.createOrder(createOrderParams, packageId);
        console.log('[CrossChainSDK] SuiOrder.createOrder completed successfully:', result);
        return result;
      } catch (error) {
        console.log('[CrossChainSDK] Error in SuiOrder.createOrder:', error);
        
        if (suiWallet) {
          // If wallet is provided, this is a real error
          throw error;
        } else {
          // No wallet provided, return mock result for testing
          const mockResult = {
            digest: 'mock-sui-tx-digest-' + Date.now(),
            effects: { status: { status: 'success' } },
            objectChanges: [],
            events: [],
            transaction: transaction // Include built transaction for reference
          };
          
          console.log('[CrossChainSDK] Returning mock result (no wallet provided):', mockResult.digest);
          return mockResult;
        }
      }
      
    } catch (error) {
      console.error('[CrossChainSDK] Failed to create Sui order:', error);
      throw error;
    }
  }

  private async createEvmOrder(
    order: any, 
    quoteId: string, 
    receiverAddress?: string, 
    selectedTokens?: { payToken: any, receiveToken: any },
    evmClients?: { walletClient: any, publicClient: any, account: string }
  ): Promise<any> {
    try {
      console.log('[CrossChainSDK] === EVM SOURCE CHAIN ORDER CREATION ===');
      
      // Log comprehensive swap data for EVM source chain
      console.log('[CrossChainSDK] Maker (EVM address):', order.maker);
      console.log('[CrossChainSDK] Receiver address (provided):', receiverAddress || 'Not provided');
      console.log('[CrossChainSDK] Receiver (final):', receiverAddress || order.maker);
      
      // Token addresses
      console.log('[CrossChainSDK] Source token address (EVM):', order.makerAsset);
      console.log('[CrossChainSDK] Destination token address:', order.takerAsset);
      console.log('[CrossChainSDK] Note: These should now show real token addresses, not placeholders');
      
      // Amounts
      console.log('[CrossChainSDK] Making amount (user gives):', order.makingAmount?.toString() || 'N/A');
      console.log('[CrossChainSDK] Taking amount (user receives):', order.takingAmount?.toString() || 'N/A');
      
      // Token details from UI
      if (selectedTokens) {
        console.log('[CrossChainSDK] Pay token (UI selected):', {
          symbol: selectedTokens.payToken.symbol,
          name: selectedTokens.payToken.name,
          address: selectedTokens.payToken.address,
          chainId: selectedTokens.payToken.chainId,
          decimals: selectedTokens.payToken.decimals
        });
        
        console.log('[CrossChainSDK] Receive token (UI selected):', {
          symbol: selectedTokens.receiveToken.symbol,
          name: selectedTokens.receiveToken.name,
          address: selectedTokens.receiveToken.address,
          chainId: selectedTokens.receiveToken.chainId,
          decimals: selectedTokens.receiveToken.decimals
        });
        
        // Convert amounts to human readable
        const payAmountHuman = (Number(order.makingAmount) / Math.pow(10, selectedTokens.payToken.decimals)).toFixed(6);
        const receiveAmountHuman = (Number(order.takingAmount) / Math.pow(10, selectedTokens.receiveToken.decimals)).toFixed(6);
        
        console.log('[CrossChainSDK] Human readable amounts:');
        console.log('[CrossChainSDK]   Pay:', payAmountHuman, selectedTokens.payToken.symbol, 'on EVM');
        console.log('[CrossChainSDK]   Receive:', receiveAmountHuman, selectedTokens.receiveToken.symbol, 'on Sui');
      }
      
      // Fill preferences
      console.log('[CrossChainSDK] Fill preferences:');
      console.log('[CrossChainSDK]   Allow partial fills:', this.fillPreferences.allowPartialFills);
      console.log('[CrossChainSDK]   Allow multiple fills:', this.fillPreferences.allowMultipleFills);
      
      // Order metadata
      console.log('[CrossChainSDK] Order metadata:');
      console.log('[CrossChainSDK]   Salt:', order.salt);
      console.log('[CrossChainSDK]   Quote ID:', quoteId);
      console.log('[CrossChainSDK] =======================================');

      // Step 1: Handle ERC20 approval if needed
      if (evmClients && selectedTokens) {
        console.log('[CrossChainSDK] === DETAILED APPROVAL DEBUG ===');
        console.log('[CrossChainSDK] selectedTokens.payToken:', JSON.stringify(selectedTokens.payToken, null, 2));
        console.log('[CrossChainSDK] Token address:', selectedTokens.payToken.address);
        console.log('[CrossChainSDK] Token symbol:', selectedTokens.payToken.symbol);
        console.log('[CrossChainSDK] Token name:', selectedTokens.payToken.name);
        console.log('[CrossChainSDK] Order makingAmount:', order.makingAmount?.toString());
        console.log('[CrossChainSDK] Order makingAmount type:', typeof order.makingAmount);
        console.log('[CrossChainSDK] Token decimals:', selectedTokens.payToken.decimals);
        console.log('[CrossChainSDK] User account:', evmClients.account);
        console.log('[CrossChainSDK] ================================');
        
        // Ensure we have a valid amount
        const approvalAmount = typeof order.makingAmount === 'bigint' 
          ? order.makingAmount 
          : BigInt(order.makingAmount || '0');
          
        console.log('[CrossChainSDK] Approval amount (bigint):', approvalAmount.toString());
        console.log('[CrossChainSDK] Approval amount in human units:', (Number(approvalAmount) / Math.pow(10, selectedTokens.payToken.decimals)).toFixed(6));
        
        if (approvalAmount === BigInt(0)) {
          throw new Error('Invalid approval amount: cannot approve 0 tokens');
        }
        
        const isApprovalNeeded = await ERC20Service.isApprovalNeeded({
          tokenAddress: selectedTokens.payToken.address,
          ownerAddress: evmClients.account,
          amount: approvalAmount,
          publicClient: evmClients.publicClient
        });

        if (isApprovalNeeded) {
          console.log('[CrossChainSDK] ERC20 approval required - requesting approval...');
          console.log('[CrossChainSDK] About to call ERC20Service.approveToken with:');
          console.log('[CrossChainSDK]   tokenAddress:', selectedTokens.payToken.address);
          console.log('[CrossChainSDK]   amount:', approvalAmount.toString());
          console.log('[CrossChainSDK]   decimals:', selectedTokens.payToken.decimals);
          console.log('[CrossChainSDK]   account:', evmClients.account);
          
          const approvalResult = await ERC20Service.approveToken({
            tokenAddress: selectedTokens.payToken.address,
            amount: approvalAmount,
            decimals: selectedTokens.payToken.decimals,
            walletClient: evmClients.walletClient,
            account: evmClients.account
          });

          if (!approvalResult.success) {
            throw new Error(`ERC20 approval failed: ${approvalResult.error}`);
          }

          console.log('[CrossChainSDK] ERC20 approval successful:', approvalResult.txHash);
        } else {
          console.log('[CrossChainSDK] ERC20 approval not needed - sufficient allowance');
        }
      } else {
        console.log('[CrossChainSDK] No EVM clients provided - skipping approval check');
      }

      // Step 2: Submit the order (mock for now)
      console.log('[CrossChainSDK] Submitting EVM order to LOP...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockResult = {
        success: true,
        txHash: 'mock-evm-order-tx-hash-' + Date.now(),
        approvalTxHash: evmClients ? 'mock-approval-tx-hash' : undefined
      };
      
      console.log('[CrossChainSDK] EVM order submitted successfully (mock):', mockResult.txHash);
      return mockResult;
      
    } catch (error) {
      console.error('[CrossChainSDK] Failed to create EVM order:', error);
      throw error;
    }
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
    console.log('[CrossChainSDK] Getting order status (mock):', orderHash);
    
    // Mock implementation - simulate order execution after a delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockResponse: OrderStatusResponse = {
      status: OrderStatus.Executed,
      // Add other required fields based on OrderStatusResponse interface
    } as OrderStatusResponse;
    
    console.log('[CrossChainSDK] Mock order status:', mockResponse.status);
    return mockResponse;
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
