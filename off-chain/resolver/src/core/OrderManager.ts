import { Extension } from '../../../../cross-chain-sdk/src';
import { 
    EvmCrossChainOrder, 
    SvmCrossChainOrder 
} from '../../../../cross-chain-sdk/src/cross-chain-order';
import { EvmAddress, SolanaAddress } from '../../../../cross-chain-sdk/src/domains/addresses';
import { isEvm, SupportedChain } from '../../../../cross-chain-sdk/src/chains';
import { EVMClient } from '../chains/evm/evm-client';
import { SuiClient } from '../chains/sui/sui-client';
import { RelayerRequestParams } from '../../../../cross-chain-sdk/src/api/relayer/types';
import { ResolverWebSocketClient } from '../communication/ws';

// Order data stored in the mapping - includes original params + converted order + runtime data
interface StoredOrderData {
    // Original params from relayer
    originalParams: RelayerRequestParams;
    // Converted cross-chain order from SDK
    crossChainOrder: EvmCrossChainOrder;
    // Runtime data for cross-chain execution
    srcComplement?: any;
    dstDeployedAt?: bigint; 
    isPartialFill?: boolean;  
}

export interface SecretData {
    orderHash: string;
    secret: string;
}

export class OrderManager {
    private orders: Map<string, StoredOrderData>;
    private evmClient: EVMClient;
    private suiClient: SuiClient;
    private wsClient: ResolverWebSocketClient | null = null;

    constructor(evmClient: EVMClient, suiClient: SuiClient) {
        this.orders = new Map();
        this.evmClient = evmClient;
        this.suiClient = suiClient;
        console.log('OrderManager initialized');
    }

    /**
     * Set WebSocket client for sending messages to relayer
     * @param wsClient - WebSocket client instance
     */
    public setWebSocketClient(wsClient: ResolverWebSocketClient): void {
        this.wsClient = wsClient;
        console.log('WebSocket client set in OrderManager');
    }

    /**
     * Register order from relayer - converts RelayerRequestParams to EvmCrossChainOrder
     * and stores with order hash as key
     */
    public registerOrder(relayerParams: RelayerRequestParams): void {
        console.log('Registering order from RelayerRequestParams');
        // @note order stored for this resolver needs to compute this - hash lock will be the secretHash[resolverId + 1], if this is an array then store variable in stored order that partial fills is true.
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

        if (relayerParams.secretHashes && relayerParams.secretHashes.length > 0) {
            console.log('Partial fill detected, storing secret hashes');
            storedOrderData.isPartialFill = true;
        }
        
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

    /**
     * Execute cross-chain order using stored order data
     * @param orderHash - Hash of the order to execute
     * @param fromEVM - Whether the source chain is EVM (true) or Sui (false)
     */
    public async executeOrder(
        orderHash: string,
        fromEVM: boolean
    ): Promise<void> {
        console.log(`Starting order execution: ${orderHash}`);
        console.log(`Direction: ${fromEVM ? 'EVM to Sui' : 'Sui to EVM'}`);

        // Get stored order data
        const storedOrder = this.orders.get(orderHash);
        if (!storedOrder) {
            throw new Error(`Order not found: ${orderHash}`);
        }

        const crossChainOrder = storedOrder.crossChainOrder;
        const originalParams = storedOrder.originalParams;
        
        // Extract parameters from stored data
        const signature = originalParams.signature;
        const srcChainId = originalParams.srcChainId;
        const dstChainId = crossChainOrder.dstChainId;
        // @note and the fillAmount (param of EVMClient) will be divided by total count (stored in ENV)
        let fillAmount;
        if (storedOrder.isPartialFill) {
            fillAmount = crossChainOrder.takingAmount / BigInt(process.env.TOTAL_COUNT || 2);
        } else {
            fillAmount = crossChainOrder.takingAmount;
        }
        // const fillAmount = crossChainOrder.takingAmount / process.env.TOTAL_COUNT;
        console.log(`Fill amount: ${fillAmount.toString()}`);
        console.log(`Source chain: ${srcChainId}, Destination chain: ${dstChainId}`);

        try {
            // Step 1: Deploy source escrow
            console.log(`\nStep 1: Deploying source escrow on ${fromEVM ? 'EVM' : 'Sui'} chain (${srcChainId})`);
            
            let srcResult: { txHash: string; blockHash: string };
            let srcClient = fromEVM ? this.evmClient : this.suiClient;

            if (fromEVM) {
                console.log(`Using EVM client for source deployment`);
                srcResult = await this.evmClient.createSrcEscrow(srcChainId, crossChainOrder, signature, fillAmount);
                // const srcHash = srcResult.txHash;
                console.log(`EVM source escrow deployed - TxHash: ${srcResult.txHash}`);
                
                // Get source complement from factory event
                const [srcImmutables, srcComplement] = await this.evmClient.getDstImmutables(srcResult.blockHash);
                storedOrder.srcComplement = srcComplement;
            } else {
                console.log(`Using Sui client for source deployment`);
                srcResult = await this.suiClient.createSrcEscrow(srcChainId, crossChainOrder, signature, fillAmount);
                console.log(`Sui source escrow deployed - TxHash: ${srcResult.txHash}`);
                
                // TODO: Get source complement from Sui factory event
                // storedOrder.srcComplement = await this.suiClient.getSrcComplement(srcResult.blockHash);
            }

            // Step 2: Wait for source chain finality lock
            const srcFinalityTimeout = srcClient.getFinalityLockTimeout();
            console.log(`Waiting for source chain finality lock: ${srcFinalityTimeout}ms`);
            await this.sleep(srcFinalityTimeout);
            console.log(`Source chain finality lock completed`);

            // Step 3: Deploy destination escrow
            console.log(`\nStep 3: Deploying destination escrow on ${fromEVM ? 'Sui' : 'EVM'} chain (${dstChainId})`);
            
            let dstResult: any;
            let dstClient = fromEVM ? this.suiClient : this.evmClient;

            if (fromEVM) {
                // EVM -> Sui: Build destination immutables from stored data
                console.log(`Using Sui client for destination deployment`);
                
                // TODO: Update SuiClient to accept dstImmutables parameter
                // dstResult = await this.suiClient.createDstEscrow();
                console.log(`Sui destination escrow deployed`);
                
                // Store destination deployment timestamp
                storedOrder.dstDeployedAt = BigInt(Math.floor(Date.now() / 1000));
            } else {
                // Sui -> EVM: Build destination immutables from stored data
                console.log(`Using EVM client for destination deployment`);
                
                // Derive destination immutables from source immutables and complement
                const srcImmutables = this.getSrcImmutables(storedOrder, fromEVM);
                const dstImmutables = srcImmutables
                    .withComplement(storedOrder.srcComplement)
                    .withTaker(EvmAddress.fromString(this.evmClient.getAddress()));
                
                dstResult = await this.evmClient.createDstEscrow(dstImmutables);
                // const dstHash = dstResult.txHash;
            
                console.log(`EVM destination escrow deployed`);
                
                // Store destination deployment timestamp
                storedOrder.dstDeployedAt = BigInt(Math.floor(Date.now() / 1000));
            }

            // Step 4: Wait for destination chain finality lock
            const dstFinalityTimeout = dstClient.getFinalityLockTimeout();
            console.log(`Waiting for destination chain finality lock: ${dstFinalityTimeout}ms`);
            await this.sleep(dstFinalityTimeout);
            console.log(`Destination chain finality lock completed`);

            // Step 5: Order execution completed
            console.log(`\nOrder execution completed successfully`);
            console.log(`Order Hash: ${orderHash}`);
            console.log(`Source TxHash: ${srcResult.txHash}`);
            console.log(`Destination Result:`, dstResult);
            this.sendExecutionDataToRelayer(orderHash, srcResult.txHash, dstResult.txHash);

        } catch (error) {
            console.error(`Order execution failed for ${orderHash}:`, error);
            throw new Error(`Order execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Helper function to create delays for finality locks
     * @param ms - Milliseconds to sleep
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Derive source immutables from stored order data
     */
    private getSrcImmutables(storedOrder: StoredOrderData, fromEVM: boolean): any {
        const { crossChainOrder, originalParams } = storedOrder;
        const resolverAddress = fromEVM ? this.evmClient.getAddress() : this.suiClient.getAddress();
        
        return crossChainOrder.toSrcImmutables(
            originalParams.srcChainId,
            EvmAddress.fromString(resolverAddress),
            crossChainOrder.takingAmount,
            crossChainOrder.escrowExtension.hashLockInfo
        );
    }

    /**
     * Derive destination immutables from stored order data
     */
    private getDstImmutables(storedOrder: StoredOrderData, fromEVM: boolean): any {
        if (!storedOrder.srcComplement || !storedOrder.dstDeployedAt) {
            throw new Error('Missing srcComplement or dstDeployedAt for destination immutables calculation');
        }

        const srcImmutables = this.getSrcImmutables(storedOrder, fromEVM);
        const resolverAddress = fromEVM ? this.suiClient.getAddress() : this.evmClient.getAddress();
        
        return srcImmutables
            .withComplement(storedOrder.srcComplement)
            .withTaker(EvmAddress.fromString(resolverAddress))
            .withDeployedAt(storedOrder.dstDeployedAt);
    }

    /**
     * Handle secret reveal from maker
     * TODO: Later integrate with withdraw function in OrderManager
     */
    public handleSecretReveal(secretData: SecretData): void {
        console.log(`Secret revealed for order ${secretData.orderHash}`);
        console.log(`Secret: ${secretData.secret}`);
        
        // TODO: Store secret and trigger withdrawal process
        // This will later call orderManager.withdrawFromEscrow()
    }

    /**
     * Send execution data to relayer
     * @param orderHash - Hash of the order
     * @param srcHash - Source chain transaction hash
     * @param dstHash - Destination chain transaction hash
     */
    public sendExecutionDataToRelayer(
        orderHash: string,
        srcHash: string,
        dstHash: string
    ): void {
        if (!this.wsClient) {
            console.warn('WebSocket client not set, cannot send execution data to relayer');
            return;
        }

        if (!this.wsClient.isReady()) {
            console.warn('WebSocket not connected, cannot send execution data to relayer');
            return;
        }

        try {
            const relayerMessage = `TXHASH ${orderHash} ${srcHash} ${dstHash}`;
            console.log(`[OrderManager] Sending to relayer: TXHASH ${orderHash.substring(0, 10)}... ${srcHash.substring(0, 10)}... ${dstHash.substring(0, 10)}...`);
            this.wsClient.sendToRelayer(relayerMessage);

        } catch (error) {
            console.error('Failed to send execution data to relayer:', error);
        }
    }


    /**
     * Withdraw funds from escrow after successful cross-chain execution
     * @param orderHash - Hash of the order to withdraw from
     * @param side - Whether to withdraw from 'src' or 'dst' escrow
     * @param secret - Secret to unlock the escrow
     * @param escrowAddress - Address of the escrow contract
     */
    public async withdrawFromEscrow(
        orderHash: string,
        side: 'src' | 'dst',
        secret: string,
        escrowAddress: string
    ): Promise<{ txHash: string; blockHash: string }> {
        console.log(`Withdrawing from ${side} escrow: ${escrowAddress}`);

        const storedOrder = this.orders.get(orderHash);
        if (!storedOrder) {
            throw new Error(`Order not found: ${orderHash}`);
        }

        try {
            // Determine which client to use based on side and order direction
            const { originalParams } = storedOrder;
            const srcIsEVM = this.isEVMChain(originalParams.srcChainId);
            const useEVMClient = (side === 'src') ? srcIsEVM : !srcIsEVM;

            if (useEVMClient) {
                // Get immutables for the withdrawal
                const immutables = side === 'src' 
                    ? this.getSrcImmutables(storedOrder, srcIsEVM)
                    : this.getDstImmutables(storedOrder, srcIsEVM);

                return await this.evmClient.withdrawFromEscrow(escrowAddress, secret, immutables);
            } else {
                // TODO: Implement Sui withdrawal
                return await this.suiClient.withdrawFromEscrow();
            }
        } catch (error) {
            console.error(`Withdrawal failed for ${orderHash}:`, error);
            throw error;
        }
    }

    /**
     * Cancel escrow when cross-chain execution fails or times out
     * @param orderHash - Hash of the order to cancel
     * @param side - Whether to cancel 'src' or 'dst' escrow
     * @param escrowAddress - Address of the escrow contract
     */
    public async cancelEscrow(
        orderHash: string,
        side: 'src' | 'dst',
        escrowAddress: string
    ): Promise<{ txHash: string; blockHash: string }> {
        console.log(`Cancelling ${side} escrow: ${escrowAddress}`);

        const storedOrder = this.orders.get(orderHash);
        if (!storedOrder) {
            throw new Error(`Order not found: ${orderHash}`);
        }

        try {
            // Determine which client to use based on side and order direction
            const { originalParams } = storedOrder;
            const srcIsEVM = this.isEVMChain(originalParams.srcChainId);
            const useEVMClient = (side === 'src') ? srcIsEVM : !srcIsEVM;

            if (useEVMClient) {
                // Get immutables for the cancellation
                const immutables = side === 'src' 
                    ? this.getSrcImmutables(storedOrder, srcIsEVM)
                    : this.getDstImmutables(storedOrder, srcIsEVM);

                return await this.evmClient.cancelOrder(side, escrowAddress, immutables);
            } else {
                // Get immutables for the cancellation
                const immutables = side === 'src' 
                    ? this.getSrcImmutables(storedOrder, srcIsEVM)
                    : this.getDstImmutables(storedOrder, srcIsEVM);

                // TODO: Implement Sui cancellation
                return await this.suiClient.cancelOrder(side, escrowAddress, immutables);
            }
        } catch (error) {
            console.error(`Cancellation failed for ${orderHash}:`, error);
            throw error;
        }
    }
}

export default OrderManager;
