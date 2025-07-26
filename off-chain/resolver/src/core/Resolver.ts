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
        console.log('Initializing Resolver...');
        
        // Initialize configuration
        this.configManager = new ConfigManager();
        const config = this.configManager.getConfig();
        
        // Initialize components
        this.orderManager = new OrderManager();
        
        // Initialize WebSocket client
        const wsConfig = this.configManager.getWebSocketConfig();
        this.wsClient = new ResolverWebSocketClient(wsConfig.relayerWsUrl, wsConfig.resolverId);
        this.wsClient.setOrderManager(this.orderManager);
        
        // Initialize chain clients
        const chainConfig = this.configManager.getChainConfig();
        this.evmClient = new EVMClient({
            rpcUrl: chainConfig.evmRpcUrl,
            chainId: 1, 
            privateKey: process.env.EVM_PRIVATE_KEY || '',
            relayerContractAddress: chainConfig.evmResolverContract,
        });
        
        this.suiClient = new SuiClient({
            network: 'testnet', 
            privateKey: process.env.SUI_PRIVATE_KEY || '',
            relayerPackageId: chainConfig.suiResolverPackage,
            gasBudget: 10000000, // Default gas budget
        });
        
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
            console.log('Resolver started successfully');
            
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
            ordersCount: this.orderManager.getOrderCount(),
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
}

export default Resolver;
