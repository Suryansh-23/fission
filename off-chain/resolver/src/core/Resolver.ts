import { ResolverWebSocketClient } from '../communication/ws';
import { OrderManager } from './OrderManager';
import { ConfigManager } from '../config/ConfigManager';
import { EVMClient } from '../chains/evm/evm-client';
import { SuiClient } from '../chains/sui/sui-client';

export class Resolver {
    private configManager: ConfigManager;
    private wsClient: ResolverWebSocketClient;
    private orderManager: OrderManager;
    private evmClient: EVMClient;
    private suiClient: SuiClient;
    private isRunning: boolean = false;

    constructor() {
        // Initialize configuration
        this.configManager = new ConfigManager();
        const config = this.configManager.getConfig();
        
        // Initialize chain clients first (required by OrderManager)
        const chainConfig = this.configManager.getChainConfig();
        
        this.evmClient = new EVMClient({
            rpcUrl: chainConfig.evmRpcUrl || 'http://localhost:8545',
            chainId: 1, 
            privateKey: process.env.EVM_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
            relayerContractAddress: chainConfig.evmResolverContract || '0x0000000000000000000000000000000000000000',
            escrowFactoryAddress: process.env.EVM_ESCROW_FACTORY || '0x0000000000000000000000000000000000000000'
        });
        
        this.suiClient = new SuiClient({
            network: 'testnet',
            rpcUrl: chainConfig.suiRpcUrl || 'https://fullnode.testnet.sui.io',
            privateKey: process.env.SUI_PRIVATE_KEY || '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            packageId: chainConfig.suiResolverPackage || '0x0000000000000000000000000000000000000000000000000000000000000000',
            registryObjectId: process.env.SUI_REGISTRY_OBJECT_ID || '0x0000000000000000000000000000000000000000000000000000000000000000',
            relayerPackageId: chainConfig.suiResolverPackage || '0x0000000000000000000000000000000000000000000000000000000000000000',
            escrowFactoryAddress: process.env.SUI_ESCROW_FACTORY || '0x0000000000000000000000000000000000000000000000000000000000000000',
            gasBudget: 10000000
        });
        
        // Initialize OrderManager with chain clients
        this.orderManager = new OrderManager(this.evmClient, this.suiClient);
        
        // Initialize WebSocket client
        const wsConfig = this.configManager.getWebSocketConfig();
        this.wsClient = new ResolverWebSocketClient(
            wsConfig.relayerWsUrl || 'ws://localhost:8080', 
            wsConfig.resolverId || 'resolver-1'
        );

        // Bidirectional communication setup
        this.wsClient.setOrderManager(this.orderManager);
        this.orderManager.setWebSocketClient(this.wsClient);
        
        console.log(`Resolver initialized with ID: ${wsConfig.resolverId}`);
    }

    public async start(): Promise<void> {
        if (this.isRunning) {
            console.log('Resolver is already running');
            return;
        }

        try {
            console.log('Starting Resolver...');
            
            // Check chain client health
            console.log('Checking chain client connectivity...');
            const evmHealthy = await this.evmClient.isHealthy();
            const suiHealthy = await this.suiClient.isHealthy();
            
            console.log(`EVM Client Health: ${evmHealthy ? 'Connected' : 'Failed'}`);
            console.log(`Sui Client Health: ${suiHealthy ? 'Connected' : 'Failed'}`);
            
            // Start WebSocket connection
            console.log('Connecting to relayer...');
            this.wsClient.connect();
            
            this.isRunning = true;
            console.log('Resolver started successfully \n');
            
        } catch (error) {
            console.error('Failed to start resolver:', error);
            throw error;
        }
    }

    public async stop(): Promise<void> {
        if (!this.isRunning) {
            console.log('Resolver is not running');
            return;
        }

        try {
            console.log('Stopping Resolver...');
            
            // Disconnect WebSocket
            this.wsClient.disconnect();
            
            this.isRunning = false;
            console.log('Resolver stopped successfully');
            
        } catch (error) {
            console.error('Error stopping resolver:', error);
            throw error;
        }
    }

    public isReady(): boolean {
        return this.isRunning && this.wsClient.isReady();
    }

    public getStatus() {
        return {
            running: this.isRunning,
            wsConnected: this.wsClient.isReady(),
            resolverId: this.configManager.getWebSocketConfig().resolverId,
        };
    }

    // Graceful shutdown handler
    public setupGracefulShutdown(): void {
        const shutdownHandler = async (signal: string) => {
            console.log(`Received ${signal}, shutting down gracefully...`);
            try {
                await this.stop();
                process.exit(0);
            } catch (error) {
                console.error('Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGINT', () => shutdownHandler('SIGINT'));
        process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    }

    /**
     * Test function to send mock execution data to relayer
     */
    public testSendExecutionData(): void {
        console.log('[Resolver] Testing execution data send...');
        
        const mockOrderHash = '0xabcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab';
        const mockSrcHash = '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
        const mockDstHash = '0x9999888877776666555544443333222211110000ffffeeeedddcccbbbaaa999';
        
        this.orderManager.sendExecutionDataToRelayer(mockOrderHash, mockSrcHash, mockDstHash);
    }
}

export default Resolver;
