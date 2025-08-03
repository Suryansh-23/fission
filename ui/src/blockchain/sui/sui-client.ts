import { SuiClient } from "@mysten/sui/client";

class SuiClientService {
  private client: SuiClient | null = null;
  private initialized = false;

  constructor() {
    console.log('[SuiClient] Service created, will initialize on first use');
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.client) {
      return;
    }

    try {
      console.log('[SuiClient] Initializing Sui client...');
      const rpcUrl = import.meta.env.VITE_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
      
      this.client = new SuiClient({
        url: rpcUrl
      });
      
      this.initialized = true;
      console.log('[SuiClient] Sui client initialized successfully');
      console.log('[SuiClient] RPC URL:', rpcUrl);
    } catch (error) {
      console.error('[SuiClient] Failed to initialize Sui client:', error);
      throw error;
    }
  }

  async getClient(): Promise<SuiClient> {
    await this.ensureInitialized();
    return this.client!;
  }

  getPackageId(): string {
    const packageId = import.meta.env.VITE_SUI_PACKAGE_ID;
    if (!packageId) {
      console.warn('[SuiClient] Package ID not configured, using placeholder');
      return '0x1234567890abcdef1234567890abcdef12345678';
    }
    return packageId;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      // Test connection by getting latest checkpoint
      await this.client!.getLatestCheckpointSequenceNumber();
      return true;
    } catch (error) {
      console.error('[SuiClient] Health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
const suiClientService = new SuiClientService();
export default suiClientService;
