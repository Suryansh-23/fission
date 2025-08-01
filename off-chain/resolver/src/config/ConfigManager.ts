import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface ResolverConfig {
    // WebSocket Configuration
    relayerWsUrl: any;
    resolverId: any;
    
    // Chain Configuration
    evmRpcUrl: any;
    suiRpcUrl: any;

    // Contract Addresses
    evmResolverContract: any;
    suiResolverPackage: any;

    // Network Settings
    reconnectAttempts: number;
    reconnectDelay: number;
}

export class ConfigManager {
    private config: ResolverConfig;

    constructor() {
        this.config = this.loadConfig();
        console.log('ConfigManager initialized');
    }

    private loadConfig(): ResolverConfig {
        return {
            // WebSocket Configuration
            relayerWsUrl: process.env.RELAYER_WS_URL,
            resolverId: process.env.RESOLVER_ID,
            
            // Chain Configuration
            evmRpcUrl: process.env.EVM_RPC_URL,
            suiRpcUrl: process.env.SUI_RPC_URL,

            // Contract Addresses
            evmResolverContract: process.env.EVM_RESOLVER_CONTRACT,
            suiResolverPackage: process.env.SUI_RESOLVER_PACKAGE,

            // Network Settings
            reconnectAttempts: parseInt(process.env.RECONNECT_ATTEMPTS || '5'),
            reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '5000'),
        };
    }

    public getConfig(): ResolverConfig {
        return { ...this.config };
    }

    public getWebSocketConfig() {
        return {
            relayerWsUrl: this.config.relayerWsUrl,
            resolverId: this.config.resolverId,
            reconnectAttempts: this.config.reconnectAttempts,
            reconnectDelay: this.config.reconnectDelay,
        };
    }

    public getChainConfig() {
        return {
            evmRpcUrl: this.config.evmRpcUrl,
            suiRpcUrl: this.config.suiRpcUrl,
            evmResolverContract: this.config.evmResolverContract,
            suiResolverPackage: this.config.suiResolverPackage,
        };
    }
}

export default ConfigManager;
