import { SuiConfig } from "../../config/chain";
import { ChainClient } from "../interface/chain-interface";
import { SuiClient as SuiSdkClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiCoinHelper } from '../helper/coin-sui';
import { SuiImmutablesHelper, DstTimelocks, ImmutablesData } from '../helper/immutables-sui';
import { SuiDstEscrowHelper, CreateDstEscrowParams } from './dst-escrow';
import { CreateSrcEscrowParams, MerkleProofData, SignatureData } from './src-escrow';
import { SuiOrderHelper, CreateOrderParams } from '../helper/order-sui';
import { SuiResolverRegistry } from '../helper/resolver-registry-sui';

export interface SuiEscrowInfo {
    escrowId: string;
    coinType: string;
    orderHash: Uint8Array;
    hashlock: Uint8Array;
    maker: string;
    taker: string;
    amount: bigint;
}

export class SuiClient {
    private config: SuiConfig;
    private client: SuiSdkClient;
    private keypair: Ed25519Keypair;
    private coinHelper: SuiCoinHelper;
    private immutablesHelper: SuiImmutablesHelper;
    private dstEscrowHelper: SuiDstEscrowHelper;
    private orderHelper: SuiOrderHelper;
    private registryHelper: SuiResolverRegistry;
    private resolverCapId?: string; // Store the resolver capability ID

    // Finality lock timeout for Sui chain (in milliseconds)
    private static readonly FINALITY_LOCK_TIMEOUT = 10000;

    constructor(config: SuiConfig) {
        this.config = config;
        
        // Initialize Sui SDK client
        this.client = new SuiSdkClient({
            url: config.rpcUrl,
        });

        // Initialize keypair from private key
        this.keypair = Ed25519Keypair.fromSecretKey(config.privateKey);

        // Initialize helpers
        // console.log("Initializing SuiClient with config", config);
        console.log('Initializing SuiClient helpers');
        this.coinHelper = new SuiCoinHelper(this.client, this.keypair);
        this.immutablesHelper = new SuiImmutablesHelper(this.client, this.keypair, config.packageId);
        this.dstEscrowHelper = new SuiDstEscrowHelper(this.client, this.keypair, config.packageId);
        this.orderHelper = new SuiOrderHelper(this.client, this.keypair, config.packageId);
        this.registryHelper = new SuiResolverRegistry(
            this.client, 
            this.keypair, 
            config.packageId, 
            config.registryObjectId
        );

        console.log("SuiClient initialized with config", {
            address: this.getAddress(),
            packageId: config.packageId,
            registryId: config.registryObjectId
        });
    }

    /**
     * Set the resolver capability ID (needed for admin operations)
     */
    setResolverCapId(capId: string): void {
        this.resolverCapId = capId;
    }

    /**
     * Get the resolver capability ID
     */
    getResolverCapId(): string {
        if (!this.resolverCapId) {
            throw new Error('Resolver capability ID not set. Call setResolverCapId() first.');
        }
        return this.resolverCapId;
    }
    
    /**
     * Get the order helper for creating and managing orders
     */
    getOrderHelper(): SuiOrderHelper {
        return this.orderHelper;
    }

    /**
     * Get the destination escrow helper
     */
    getDstEscrowHelper(): SuiDstEscrowHelper {
        return this.dstEscrowHelper;
    }

    /**
     * Deploy source escrow using the resolver Move contract
     * Maps to the resolver::create_src_escrow Move function
     */
    async deploySrcEscrow(
        orderId: string,
        depositAmount: bigint,
        safetyDepositAmount: bigint,
        signature: Uint8Array,
        publicKey: Uint8Array,
        scheme: number, // 0=Ed25519, 1=ECDSA-K1, 2=ECDSA-R1
        hashlockInfo: Uint8Array,
        secretHash: Uint8Array,
        secretIndex: number,
        proof: Uint8Array[],
        coinType: string,
        srcWithdrawalTimestamp: bigint,
        srcPublicWithdrawalTimestamp: bigint,
        srcCancellationTimestamp: bigint,
        srcPublicCancellationTimestamp: bigint
    ): Promise<{ txHash: string; blockHash: string; escrowId?: string }> {
        try {
            console.log('[SuiClient] Deploying source escrow using resolver contract');

            const tx = new Transaction();

            // Prepare safety deposit (always SUI)
            const [safetyDepositCoin] = tx.splitCoins(tx.gas, [safetyDepositAmount]);

            // Call the resolver::create_src_escrow function
            tx.moveCall({
                target: `${this.config.packageId}::resolver::create_src_escrow`,
                typeArguments: [coinType],
                arguments: [
                    // _cap: &ResolverCap
                    tx.object(this.getResolverCapId()),
                    // order: &mut Order<T>
                    tx.object(orderId),
                    // deposit_amount: u64
                    tx.pure.u64(depositAmount.toString()),
                    // safety_deposit: Coin<SUI>
                    safetyDepositCoin,
                    // signature: vector<u8>
                    tx.pure.vector('u8', Array.from(signature)),
                    // pk: vector<u8>
                    tx.pure.vector('u8', Array.from(publicKey)),
                    // scheme: u8
                    tx.pure.u8(scheme),
                    // hashlock_info: vector<u8>
                    tx.pure.vector('u8', Array.from(hashlockInfo)),
                    // secret_hash: vector<u8>
                    tx.pure.vector('u8', Array.from(secretHash)),
                    // secret_index: u16
                    tx.pure.u16(secretIndex),
                    // proof: vector<vector<u8>>
                    tx.pure.vector('vector<u8>', proof.map(p => Array.from(p))),
                    // src_withdrawal_timestamp: u64
                    tx.pure.u64(srcWithdrawalTimestamp.toString()),
                    // src_public_withdrawal_timestamp: u64
                    tx.pure.u64(srcPublicWithdrawalTimestamp.toString()),
                    // src_cancellation_timestamp: u64
                    tx.pure.u64(srcCancellationTimestamp.toString()),
                    // src_public_cancellation_timestamp: u64
                    tx.pure.u64(srcPublicCancellationTimestamp.toString()),
                ],
            });

            // Execute transaction
            const result = await this.client.signAndExecuteTransaction({
                transaction: tx,
                signer: this.keypair,
                options: {
                    showEvents: true,
                    showEffects: true,
                    showObjectChanges: true,
                },
            });

            console.log(`Sui source escrow deployed via resolver - TxHash: ${result.digest}`);

            // Extract escrow ID from events if available
            let escrowId: string | undefined;
            if (result.events) {
                for (const event of result.events) {
                    if (event.type.includes('::src_escrow::SrcEscrowCreated')) {
                        const parsedJson = event.parsedJson as any;
                        escrowId = parsedJson.id;
                        break;
                    }
                }
            }

            return {
                txHash: result.digest,
                blockHash: result.checkpoint || result.digest,
                escrowId,
            };

        } catch (error) {
            console.error('Error deploying source escrow via resolver:', error);
            throw error;
        }
    }

    async createSrcEscrow(
        chainId: number, 
        order: any, 
        hashLock: any, 
        signature: string, 
        fillAmount: bigint
    ): Promise<{ txHash: string; blockHash: string }> {
        try {
            console.log('Creating source escrow on Sui chain using resolver contract');

            // Extract order details
            const orderId = order.orderId || order.id;
            if (!orderId) {
                throw new Error('Order ID is required for source escrow creation');
            }

            // Parse signature data (assuming Ed25519 for now)
            const signatureBytes = typeof signature === 'string' 
                ? new Uint8Array(Buffer.from(signature.replace('0x', ''), 'hex'))
                : new Uint8Array(signature);
            
            // Extract public key from keypair 
            const publicKeyBytes = this.keypair.getPublicKey().toRawBytes();

            // Set up timelocks 
            const now = this.immutablesHelper.getCurrentTimestamp();
            const hour = BigInt(60 * 60 * 1000);
            const day = BigInt(24) * hour;

            // Handle both single fill and multiple fill scenarios
            let hashlockInfo: Uint8Array;
            let secretHash: Uint8Array;
            let secretIndex: number = 0;
            let proof: Uint8Array[] = [];

            if (hashLock.isMultipleFills && hashLock.isMultipleFills()) {
                // Multiple fills scenario
                console.log('Handling multiple fills scenario');
                
                // For multiple fills, use the hashlock info directly
                hashlockInfo = new Uint8Array(hashLock.toBuffer());
                
                // For multiple fills, we need the specific secret hash for this resolver
                // This should be provided in the hashLock object
                if (hashLock.secretHash) {
                    secretHash = new Uint8Array(hashLock.secretHash);
                } else {
                    throw new Error('Secret hash required for multiple fills');
                }

                // Get secret index and proof if available
                if (hashLock.secretIndex !== undefined) {
                    secretIndex = hashLock.secretIndex;
                }
                
                if (hashLock.proof && Array.isArray(hashLock.proof)) {
                    proof = hashLock.proof.map((p: any) => new Uint8Array(p));
                }
                
            } else {
                // Single fill scenario
                console.log('Handling single fill scenario');
                
                // For single fill, the hashlock info is the secret hash itself
                const secretHashBytes = hashLock.secretHash || hashLock.toBuffer();
                hashlockInfo = new Uint8Array(secretHashBytes);
                secretHash = new Uint8Array(secretHashBytes);
                secretIndex = 0;
                proof = []; // No proof needed for single fill
            }

            const result = await this.deploySrcEscrow(
                orderId,
                fillAmount,
                BigInt(1000000), // 0.001 SUI safety deposit
                signatureBytes,
                publicKeyBytes,
                0, // Ed25519 scheme
                hashlockInfo,
                secretHash,
                secretIndex,
                proof,
                order.coinType || '0x2::sui::SUI',
                now + hour, // 1 hour for private withdrawal
                now + (2n * hour), // 2 hours for public withdrawal
                now + day, // 1 day for private cancellation
                now + (2n * day) // 2 days for public cancellation
            );

            return {
                txHash: result.txHash,
                blockHash: result.blockHash,
            };

        } catch (error) {
            console.error('Error creating source escrow:', error);
            throw error;
        }
    }

    /**
     * Get source complement from Sui transaction (placeholder implementation)
     * TODO: Implement proper source complement extraction from Sui events
     */
    async getSrcComplement(blockHash: string): Promise<any> {
        console.log(`Getting source complement from Sui transaction: ${blockHash}`);
        
        // For now, return a placeholder complement
        // In a real implementation, this would parse the transaction events
        // to extract the source complement data
        return {
            // Placeholder complement data
            // This should be extracted from the SrcEscrowCreated event
            placeholder: true,
            blockHash: blockHash
        };
    }

    /**
     * Create destination escrow on Sui chain.
     * Maps to the resolver::create_dst_escrow Move function
     */
    async createDstEscrow(
        orderHash: Uint8Array,
        hashlock: Uint8Array,
        maker: string,
        taker: string,
        depositAmount: bigint,
        safetyDepositAmount: bigint,
        coinType: string = SuiCoinHelper.SUI_TYPE,
        dstWithdrawalTimestamp?: bigint,
        dstPublicWithdrawalTimestamp?: bigint,
        dstCancellationTimestamp?: bigint,
        srcCancellationTimestamp?: bigint
    ): Promise<{ txHash: string; blockHash: string; escrowId?: string }> {
        try {
            console.log('Creating destination escrow on Sui chain');

            const tx = new Transaction();

            // Use standard timelocks if not provided
            const now = this.immutablesHelper.getCurrentTimestamp();
            const hour = BigInt(60 * 60 * 1000);
            
            const finalDstWithdrawal = dstWithdrawalTimestamp || (now + hour);
            const finalDstPublicWithdrawal = dstPublicWithdrawalTimestamp || (now + (2n * hour));
            const finalDstCancellation = dstCancellationTimestamp || (now + (24n * hour));
            const finalSrcCancellation = srcCancellationTimestamp || (now + (48n * hour));

            // Validate timelock constraints
            if (finalDstCancellation > finalSrcCancellation) {
                throw new Error('Destination cancellation time must be before or equal to source cancellation time');
            }

            // Prepare deposit coin
            let depositCoin;
            if (coinType === SuiCoinHelper.SUI_TYPE) {
                // For SUI, split from gas
                [depositCoin] = tx.splitCoins(tx.gas, [depositAmount]);
            } else {
                // For other tokens, prepare coins appropriately
                const selectedCoins = await this.coinHelper.selectCoinsForAmount(depositAmount, coinType);
                
                if (selectedCoins.length === 1 && selectedCoins[0].balance === depositAmount) {
                    depositCoin = tx.object(selectedCoins[0].coinObjectId);
                } else {
                    // Merge and split as needed
                    const primaryCoin = selectedCoins[0];
                    const coinsToMerge = selectedCoins.slice(1);
                    
                    if (coinsToMerge.length > 0) {
                        tx.mergeCoins(
                            tx.object(primaryCoin.coinObjectId),
                            coinsToMerge.map(coin => tx.object(coin.coinObjectId))
                        );
                    }
                    
                    [depositCoin] = tx.splitCoins(
                        tx.object(primaryCoin.coinObjectId),
                        [depositAmount]
                    );
                }
            }

            // Prepare safety deposit (always SUI)
            const [safetyDepositCoin] = tx.splitCoins(tx.gas, [safetyDepositAmount]);

            // Call the resolver contract's create_dst_escrow function
            console.log('[SuiClient] Calling resolver contract to create destination escrow');
            console.log(`[SuiClient]`)
            tx.moveCall({
                target: `${this.config.packageId}::resolver::create_dst_escrow`,
                typeArguments: [coinType],
                arguments: [
                    tx.object(this.getResolverCapId()), // _cap: &ResolverCap
                    tx.pure.vector('u8', Array.from(orderHash)), // order_hash: vector<u8>
                    tx.pure.vector('u8', Array.from(hashlock)), // hashlock: vector<u8>
                    tx.pure.address(maker), // maker: 
                    tx.pure.address(taker), 
                    depositCoin, // deposit: Coin<T>
                    safetyDepositCoin, // safety_deposit: Coin<SUI>
                    tx.pure.u64(finalDstWithdrawal), // dst_withdrawal_timestamp: u64
                    tx.pure.u64(finalDstPublicWithdrawal), // dst_public_withdrawal_timestamp: u64
                    tx.pure.u64(finalDstCancellation), // dst_cancellation_timestamp: u64
                    tx.pure.u64(finalSrcCancellation), // src_cancellation_timestamp: u64
                ],
            });

            const result = await this.client.signAndExecuteTransaction({
                transaction: tx,
                signer: this.keypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                    showObjectChanges: true,
                },
            });

            console.log(`Destination escrow created - TxHash: ${result.digest}`);

            // Extract escrow ID from object changes
            let escrowId: string | undefined;
            if (result.objectChanges) {
                for (const change of result.objectChanges) {
                    if (change.type === 'created' && change.objectType.includes('DstEscrow')) {
                        escrowId = change.objectId;
                        break;
                    }
                }
            }

            return {
                txHash: result.digest,
                blockHash: result.digest, // Sui uses digest as unique identifier
                escrowId
            };

        } catch (error) {
            console.error('Error creating destination escrow:', error);
            throw error;
        }
    }

    /**
     * Withdraw from escrow - simplified interface for ChainClient compatibility
     */
    async withdrawFromEscrow(): Promise<any> {
        throw new Error("Use withdrawFromSrcEscrow() or withdrawFromDstEscrow() methods for full functionality");
    }

    /**
     * Withdraw from source escrow on Sui chain (Sui → ETH direction)
     * Maps to the resolver::withdraw_src Move function
     */
    async withdrawFromSrcEscrow(
        escrowId: string,
        secret: Uint8Array,
        targetAddress: string,
        coinType: string = SuiCoinHelper.SUI_TYPE
    ): Promise<{ txHash: string; blockHash: string }> {
        try {
            console.log('[SuiClient] Withdrawing from source escrow');
            console.log(`[SuiClient]   Escrow ID: ${escrowId}`);
            console.log(`[SuiClient]   Target Address: ${targetAddress}`);
            console.log(`[SuiClient]   Coin Type: ${coinType}`);

            const tx = new Transaction();

            // Call the resolver contract's withdraw_src function
            tx.moveCall({
                target: `${this.config.packageId}::resolver::withdraw_src`,
                typeArguments: [coinType],
                arguments: [
                    tx.object(this.getResolverCapId()),
                    tx.object(escrowId),
                    tx.pure.vector('u8', Array.from(secret)),
                    tx.pure.address(targetAddress),
                ],
            });

            const result = await this.client.signAndExecuteTransaction({
                transaction: tx,
                signer: this.keypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                },
            });

            console.log(`[SuiClient] Source escrow withdrawal completed - TxHash: ${result.digest}`);
            return {
                txHash: result.digest,
                blockHash: result.digest,
            };

        } catch (error) {
            console.error('[SuiClient] Error withdrawing from source escrow:', error);
            throw error;
        }
    }

    /**
     * Withdraw from destination escrow on Sui chain (ETH → Sui direction)
     * Maps to the resolver::withdraw_dst Move function
     */
    async withdrawFromDstEscrow(
        escrowId: string,
        secret: Uint8Array,
        coinType: string = SuiCoinHelper.SUI_TYPE
    ): Promise<{ txHash: string; blockHash: string }> {
        try {
            console.log('[SuiClient] Withdrawing from destination escrow');
            console.log(`[SuiClient]   Escrow ID: ${escrowId}`);
            console.log(`[SuiClient]   Coin Type: ${coinType}`);

            const tx = new Transaction();

            // Call the resolver contract's withdraw_dst function
            tx.moveCall({
                target: `${this.config.packageId}::resolver::withdraw_dst`,
                typeArguments: [coinType],
                arguments: [
                    tx.object(this.getResolverCapId()),
                    tx.object(escrowId),
                    tx.pure.vector('u8', Array.from(secret)),
                ],
            });

            const result = await this.client.signAndExecuteTransaction({
                transaction: tx,
                signer: this.keypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                },
            });

            console.log(`[SuiClient] Destination escrow withdrawal completed - TxHash: ${result.digest}`);
            return {
                txHash: result.digest,
                blockHash: result.digest,
            };

        } catch (error) {
            console.error('[SuiClient] Error withdrawing from destination escrow:', error);
            throw error;
        }
    }

    /**
     * Withdraw from destination escrow on Sui chain with full parameters
     * Maps to the resolver::withdraw_dst Move function
     */
    async withdrawFromEscrowDetailed(
        escrowId: string,
        secret: Uint8Array,
        coinType: string = SuiCoinHelper.SUI_TYPE
    ): Promise<{ txHash: string; blockHash: string }> {
        // Delegate to withdrawFromDstEscrow for backwards compatibility
        return this.withdrawFromDstEscrow(escrowId, secret, coinType);
    }

    /**
     * Public withdraw from destination escrow (for registered resolvers)
     */
    async publicWithdrawFromEscrow(
        escrowId: string,
        secret: Uint8Array,
        coinType: string = SuiCoinHelper.SUI_TYPE
    ): Promise<{ txHash: string; blockHash: string }> {
        try {
            console.log('Public withdrawing from Sui destination escrow');

            const tx = new Transaction();

            // Call the resolver contract's public_withdraw_dst function
            tx.moveCall({
                target: `${this.config.packageId}::resolver::public_withdraw_dst`,
                typeArguments: [coinType],
                arguments: [
                    tx.object(this.getResolverCapId()), // _cap: &ResolverCap
                    tx.object(escrowId), // escrow: &mut DstEscrow<T>
                    tx.object(this.config.registryObjectId), // registry: &ResolverRegistry
                    tx.pure.vector('u8', Array.from(secret)), // secret: vector<u8>
                ],
            });

            const result = await this.client.signAndExecuteTransaction({
                transaction: tx,
                signer: this.keypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                    showObjectChanges: true,
                },
            });

            console.log(`Public withdrawal successful - TxHash: ${result.digest}`);
            return {
                txHash: result.digest,
                blockHash: result.digest
            };

        } catch (error) {
            console.error('Error in public withdrawal:', error);
            throw error;
        }
    }

    /**
     * Cancel escrow on Sui chain
     * @param side - Whether this is source ('src') or destination ('dst') escrow
     * @param escrowId - ID of the escrow object to cancel
     * @param coinType - Type of coin in the escrow
     */
    async cancelOrder(
        side: 'src' | 'dst', 
        escrowId: string, 
        coinType: string = SuiCoinHelper.SUI_TYPE
    ): Promise<{ txHash: string; blockHash: string }> {
        try {
            console.log(`Cancelling ${side} escrow with ID: ${escrowId}`);

            if (!escrowId) {
                throw new Error('Escrow ID required for cancellation');
            }

            const tx = new Transaction();

            // Choose the appropriate cancel function based on side
            const target = side === 'dst' 
                ? `${this.config.packageId}::resolver::cancel_dst`
                : `${this.config.packageId}::resolver::cancel_src`;

            tx.moveCall({
                target,
                typeArguments: [coinType],
                arguments: [
                    tx.object(this.getResolverCapId()), // _cap: &ResolverCap
                    tx.object(escrowId), // escrow: &mut DstEscrow<T> or &mut SrcEscrow<T>
                ],
            });

            const result = await this.client.signAndExecuteTransaction({
                transaction: tx,
                signer: this.keypair,
                options: {
                    showEffects: true,
                    showEvents: true,
                    showObjectChanges: true,
                },
            });

            console.log(`${side} escrow cancelled successfully - TxHash: ${result.digest}`);
            
            return {
                txHash: result.digest,
                blockHash: result.digest
            };

        } catch (error) {
            console.error(`Error cancelling ${side} escrow:`, error);
            throw error;
        }
    }

    /**
     * Get escrow details by object ID
     */
    async getEscrowInfo(escrowId: string): Promise<SuiEscrowInfo | null> {
        try {
            const escrowObject = await this.client.getObject({
                id: escrowId,
                options: {
                    showContent: true,
                    showType: true,
                },
            });

            if (!escrowObject.data?.content || escrowObject.data.content.dataType !== 'moveObject') {
                return null;
            }

            const fields = escrowObject.data.content.fields as any;
            const immutables = fields.immutables;

            return {
                escrowId,
                coinType: this.extractCoinTypeFromObjectType(escrowObject.data.type!),
                orderHash: new Uint8Array(immutables.order_hash),
                hashlock: new Uint8Array(immutables.hashlock),
                maker: immutables.maker,
                taker: immutables.taker,
                amount: BigInt(immutables.deposit?.value || 0),
            };

        } catch (error) {
            console.error('Error getting escrow info:', error);
            return null;
        }
    }

    /**
     * Check if we're registered as a resolver
     */
    async isRegisteredResolver(): Promise<boolean> {
        try {
            return await this.registryHelper.isResolverRegistered();
        } catch (error) {
            console.error('Error checking resolver registration:', error);
            return false;
        }
    }

    /**
     * Register as a resolver with safety deposit
     */
    async registerAsResolver(depositAmount: bigint): Promise<{ txHash: string; blockHash: string }> {
        try {
            const result = await this.registryHelper.addResolver(depositAmount);
            return {
                txHash: result.digest,
                blockHash: result.digest
            };
        } catch (error) {
            console.error('Error registering as resolver:', error);
            throw error;
        }
    }

    /**
     * Extract coin type from Sui object type string
     */
    private extractCoinTypeFromObjectType(objectType: string): string {
        // Extract T from DstEscrow<T> or SrcEscrow<T>
        const match = objectType.match(/<([^>]+)>/);
        return match ? match[1] : SuiCoinHelper.SUI_TYPE;
    }

    getAddress(): string {
        return this.keypair.getPublicKey().toSuiAddress();
    }

    async isHealthy(): Promise<boolean> {
        try {
            // Check if we can make a basic RPC call
            await this.client.getLatestCheckpointSequenceNumber();
            return true;
        } catch (error) {
            console.error('Sui client health check failed:', error);
            return false;
        }
    }

    // Get finality lock timeout for this chain
    public getFinalityLockTimeout(): number {
        return SuiClient.FINALITY_LOCK_TIMEOUT;
    }

    /**
     * Get helper instances for advanced operations
     */
    getHelpers() {
        return {
            coin: this.coinHelper,
            immutables: this.immutablesHelper,
            dstEscrow: this.dstEscrowHelper,
            registry: this.registryHelper,
        };
    }
}

/**
module resolver::resolver;

use fusion_plus::src_escrow::{Self, SrcEscrow};
use fusion_plus::dst_escrow::{Self, DstEscrow};
use fusion_plus::registry::ResolverRegistry;
use sui::coin::Coin;
use sui::sui::SUI;

// Admin capability for the resolver
public struct ResolverCap has key, store {
    id: UID,
}

fun init(ctx: &mut TxContext) {
    let cap = ResolverCap {
        id: object::new(ctx),
    };
    transfer::transfer(cap, tx_context::sender(ctx));
}

// TODO: create_src_escrow

public entry fun create_dst_escrow<T: store>(
    _cap: &ResolverCap,
    order_hash: vector<u8>,
    hashlock: vector<u8>,
    maker: address,
    taker: address,
    deposit: Coin<T>,
    safety_deposit: Coin<SUI>,
    dst_withdrawal_timestamp: u64,
    dst_public_withdrawal_timestamp: u64,
    dst_cancellation_timestamp: u64,
    src_cancellation_timestamp: u64,
    ctx: &mut TxContext,
) {
    dst_escrow::create_new<T>(
        ctx,
        order_hash,
        hashlock,
        maker,
        taker,
        deposit,
        safety_deposit,
        dst_withdrawal_timestamp,
        dst_public_withdrawal_timestamp,
        dst_cancellation_timestamp,
        src_cancellation_timestamp,
    );
}

// Main entry point for withdrawing from source escrows
public entry fun withdraw_src<T: store>(
    _cap: &ResolverCap,
    escrow: &mut SrcEscrow<T>,
    secret: vector<u8>,
    target: address,
    ctx: &mut TxContext,
) {
    src_escrow::withdraw_to<T>(escrow, secret, target, ctx);
}

// Main entry point for withdrawing from destination escrows
public entry fun withdraw_dst<T: store>(
    _cap: &ResolverCap,
    escrow: &mut DstEscrow<T>,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    // Delegate to the dst_escrow module's withdraw function
    dst_escrow::withdraw<T>(escrow, secret, ctx);
}

// Main entry point for public withdrawal from source escrows
public entry fun public_withdraw_src<T: store>(
    _cap: &ResolverCap,
    escrow: &mut SrcEscrow<T>,
    registry: &ResolverRegistry,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    src_escrow::public_withdraw<T>(escrow, registry, secret, ctx);    
}

// Main entry point for public withdrawal from destination escrows
public entry fun public_withdraw_dst<T: store>(
    _cap: &ResolverCap,
    escrow: &mut DstEscrow<T>,
    registry: &ResolverRegistry,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    dst_escrow::public_withdraw<T>(escrow, registry, secret, ctx);
}

// Main entry point for canceling source escrows
public entry fun cancel_src<T: store>(
    _cap: &ResolverCap,
    escrow: &mut SrcEscrow<T>,
    ctx: &mut TxContext,
) {
    src_escrow::cancel<T>(escrow, ctx);
}

// Main entry point for canceling destination escrows
public entry fun cancel_dst<T: store>(
    _cap: &ResolverCap,
    escrow: &mut DstEscrow<T>,
    ctx: &mut TxContext,
) {
    dst_escrow::cancel<T>(escrow, ctx);
}

// Main entry point for public canceling source escrows
public entry fun public_cancel_src<T: store>(
    _cap: &ResolverCap,
    escrow: &mut SrcEscrow<T>,
    registry: &ResolverRegistry,
    ctx: &mut TxContext,
) {
    src_escrow::public_cancel<T>(escrow, registry, ctx);
}

// Transfer admin capability
public entry fun transfer_admin(cap: ResolverCap, new_admin: address) {
    transfer::public_transfer(cap, new_admin);
}

**/

/**
 * sui objects have unique IDs (must be tracked), store escrow object id and handle object ownership transitions
 * 
 * required contracts:
 * src_escrow, dst_escrow, registry .move 
 * 
*/