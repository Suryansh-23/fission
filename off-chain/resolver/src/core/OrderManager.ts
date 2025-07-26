import { Extension } from '@1inch/cross-chain-sdk';
import { 
    EvmCrossChainOrder, 
    SvmCrossChainOrder 
} from '../../../../cross-chain-sdk/src/cross-chain-order';
import { EvmAddress, SolanaAddress } from '../../../../cross-chain-sdk/src/domains/addresses';
import { isEvm, SupportedChain } from '../../../../cross-chain-sdk/src/chains';
import { EVMClient } from '../chains/evm/evm-client';
import { SuiClient } from '../chains/sui/sui-client';
import { RelayerRequestParams } from '../../../../cross-chain-sdk/src/api/relayer/types';

// Order data stored in the mapping - includes original params + converted order + runtime data
interface StoredOrderData {
    // Original params from relayer
    originalParams: RelayerRequestParams;
    // Converted cross-chain order from SDK
    crossChainOrder: EvmCrossChainOrder;
    // Runtime data for cross-chain execution
    srcComplement?: any;
    dstDeployedAt?: bigint;  
}

export class OrderManager {
    private orders: Map<string, StoredOrderData>;
    private evmClient: EVMClient;
    private suiClient: SuiClient;

    constructor(evmClient: EVMClient, suiClient: SuiClient) {
        this.orders = new Map();
        this.evmClient = evmClient;
        this.suiClient = suiClient;
        console.log('OrderManager initialized');
    }

    /**
     * Register order from relayer - converts RelayerRequestParams to EvmCrossChainOrder
     * and stores with order hash as key
     */
    public registerOrder(relayerParams: RelayerRequestParams): void {
        console.log('Registering order from RelayerRequestParams');
        
        // Decode the extension from the relayer params
        const extension = Extension.decode(relayerParams.extension);
        
        // Convert RelayerRequestParams to EvmCrossChainOrder using SDK method
        const crossChainOrder = EvmCrossChainOrder.fromDataAndExtension(
            relayerParams.order, 
            extension
        );
        const orderHash = crossChainOrder.getOrderHash(relayerParams.srcChainId);
        
        // Store all the data we need for execution
        const storedOrderData: StoredOrderData = {
            originalParams: relayerParams,
            crossChainOrder: crossChainOrder,
            srcComplement: undefined,
            dstDeployedAt: undefined
        };
        
        this.orders.set(orderHash, storedOrderData);
        console.log(`Order registered with hash: ${orderHash}`);
        console.log(`Source Chain: ${relayerParams.srcChainId}, Destination Chain: ${crossChainOrder.dstChainId}`);
    }

    /**
     * Determine if a chain ID corresponds to an EVM chain using SDK helper
     */
    private isEVMChain(chainId: SupportedChain): boolean {
        return isEvm(chainId);
    }

    // Utility methods for debugging/testing
    public getOrder(orderId: string): StoredOrderData | undefined {
        return this.orders.get(orderId);
    }

    public getOrderCount(): number {
        return this.orders.size;
    }

    public getAllOrders(): Map<string, StoredOrderData> {
        return new Map(this.orders);
    }

    public async getClientsHealth(): Promise<{ evm: boolean; sui: boolean }> {
        try {
            const [evmHealth, suiHealth] = await Promise.all([
                this.evmClient.isHealthy(),
                this.suiClient.isHealthy()
            ]);

            return { evm: evmHealth, sui: suiHealth };
        } catch (error) {
            console.error('Error checking client health:', error);
            return { evm: false, sui: false };
        }
    }
}

export default OrderManager;
