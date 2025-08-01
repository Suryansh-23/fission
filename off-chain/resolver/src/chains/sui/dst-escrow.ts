/**
 * 

#[allow(lint(coin_field, self_transfer))]
module fusion_plus::dst_escrow;

use fusion_plus::immutables::{Self, Immutables};
use fusion_plus::registry::{Self, ResolverRegistry};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::event;
use sui::hash;
use std::type_name;
use std::ascii::String;

const EInvalidCreationTime: u64 = 0;
const ENotTaker: u64 = 1;
const EInvalidTime: u64 = 2;
const EInvalidSecret: u64 = 3;

public struct DstEscrowCreatedEvent has copy, drop {
    id: ID,
    hashlock: vector<u8>,
    taker: address,
    token_package_id: String,
    amount: u64,
}

public struct DstEscrowWithdrawnEvent has copy, drop {
    id: ID,
    secret: vector<u8>,
}

public struct DstEscrowCancelledEvent has copy, drop {
    id: ID,
}

public struct DstEscrow<phantom T: store> has key {
    id: UID,
    immutables: Immutables<T>,
}

public fun create_new<T: store>(
    ctx: &mut TxContext,
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
) {
    assert!(dst_cancellation_timestamp <= src_cancellation_timestamp, EInvalidCreationTime);

    let amount = coin::value(&deposit);
    let type_name = type_name::get<T>();
    let token_package_id = type_name::get_address(&type_name);

    let timelocks = immutables::new_dst_timelocks(
        ctx.epoch_timestamp_ms(),
        dst_withdrawal_timestamp,
        dst_public_withdrawal_timestamp,
        dst_cancellation_timestamp,
    );

    let immutables = immutables::new<T>(
        order_hash,
        hashlock,
        maker,
        taker,
        deposit,
        safety_deposit,
        timelocks,
    );

    let escrow = DstEscrow<T> {
        id: object::new(ctx),
        immutables,
    };

    event::emit(DstEscrowCreatedEvent {
        id: object::uid_to_inner(&escrow.id),
        hashlock,
        taker,
        token_package_id,
        amount,
    });

    transfer::share_object(escrow);
}

public fun withdraw<T: store>(
    escrow: &mut DstEscrow<T>,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    let sender = tx_context::sender(ctx);
    
    // Access control validations:
    let taker = immutables::get_taker(&escrow.immutables);
    assert!(sender == taker, ENotTaker);
    
    // Time validations:
    let dst_withdrawal_time = immutables::get_dst_withdrawal_time(&escrow.immutables);
    let dst_cancellation_time = immutables::get_dst_cancellation_time(&escrow.immutables);
    assert!(current_time >= dst_withdrawal_time, EInvalidTime);
    assert!(current_time < dst_cancellation_time, EInvalidTime);
    
    // Perform the withdrawal
    do_withdraw(escrow, secret, ctx);
}

// Public withdrawal function - allows withdrawal during public period with access token
public fun public_withdraw<T: store>(
    escrow: &mut DstEscrow<T>,
    registry: &ResolverRegistry,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    let sender = tx_context::sender(ctx);
        
    // Time validations for public withdrawal period:
    let dst_public_withdrawal_time = immutables::get_dst_public_withdrawal_time(&escrow.immutables);
    let dst_cancellation_time = immutables::get_dst_cancellation_time(&escrow.immutables);
    assert!(current_time >= dst_public_withdrawal_time, EInvalidTime);
    assert!(current_time < dst_cancellation_time, EInvalidTime);

    // Access token validation - check if sender is a registered resolver
    let resolver_id = object::id_from_address(sender);
    registry::assert_resolver(registry, resolver_id);

    // Perform the withdrawal
    do_withdraw(escrow, secret, ctx);
}

fun do_withdraw<T: store>(
    escrow: &mut DstEscrow<T>,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    let secret_hash = hash::keccak256(&secret);
    let stored_hashlock = immutables::get_hashlock(&escrow.immutables);
    assert!(secret_hash == stored_hashlock, EInvalidSecret);

    let sender = tx_context::sender(ctx);
    let deposit = immutables::extract_deposit(&mut escrow.immutables, ctx);
    let maker = immutables::get_maker(&escrow.immutables);
    transfer::public_transfer(deposit, maker);
    
    let safety_deposit = immutables::extract_safety_deposit(&mut escrow.immutables, ctx);
    transfer::public_transfer(safety_deposit, sender);
    
    event::emit(DstEscrowWithdrawnEvent {
        id: object::uid_to_inner(&escrow.id),
        secret,
    });
}

public fun cancel<T: store>(
    escrow: &mut DstEscrow<T>,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    let sender = tx_context::sender(ctx);
    
    let taker = immutables::get_taker(&escrow.immutables);
    assert!(sender == taker, ENotTaker);
    
    let dst_cancellation_time = immutables::get_dst_cancellation_time(&escrow.immutables);
    assert!(current_time >= dst_cancellation_time, EInvalidTime);
        
    let deposit = immutables::extract_deposit(&mut escrow.immutables, ctx);
    let taker_addr = immutables::get_taker(&escrow.immutables);
    transfer::public_transfer(deposit, taker_addr);
    
    let safety_deposit = immutables::extract_safety_deposit(&mut escrow.immutables, ctx);
    transfer::public_transfer(safety_deposit, sender);
    
    event::emit(DstEscrowCancelledEvent {
        id: object::uid_to_inner(&escrow.id),
    });
}

**/

import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiCoinHelper } from '../helper/coin-sui';
import { SuiImmutablesHelper, DstTimelocks } from '../helper/immutables-sui';

// Event interfaces
export interface DstEscrowCreatedEvent {
    id: string;
    hashlock: Uint8Array;
    taker: string;
    token_package_id: string;
    amount: bigint;
}

export interface DstEscrowWithdrawnEvent {
    id: string;
    secret: Uint8Array;
}

export interface DstEscrowCancelledEvent {
    id: string;
}

export interface CreateDstEscrowParams {
    orderHash: Uint8Array;
    hashlock: Uint8Array;
    maker: string;
    taker: string;
    depositAmount: bigint;
    safetyDepositAmount: bigint;
    coinType: string;
    dstWithdrawalTimestamp: bigint;
    dstPublicWithdrawalTimestamp: bigint;
    dstCancellationTimestamp: bigint;
    srcCancellationTimestamp: bigint;
}

export interface WithdrawParams {
    escrowId: string;
    secret: Uint8Array;
    coinType: string;
}

export interface PublicWithdrawParams extends WithdrawParams {
    registryId: string;
}

export interface CancelParams {
    escrowId: string;
    coinType: string;
}

export class SuiDstEscrowHelper {
    private client: SuiClient;
    private keypair: Ed25519Keypair;
    private packageId: string;
    private coinHelper: SuiCoinHelper;
    private immutablesHelper: SuiImmutablesHelper;

    constructor(
        client: SuiClient,
        keypair: Ed25519Keypair,
        packageId: string
    ) {
        this.client = client;
        this.keypair = keypair;
        this.packageId = packageId;
        this.coinHelper = new SuiCoinHelper(client, keypair);
        this.immutablesHelper = new SuiImmutablesHelper(client, keypair, packageId);
    }

    /**
     * Create a new destination escrow
     */
    async createDstEscrow(params: CreateDstEscrowParams): Promise<SuiTransactionBlockResponse> {
        // Validate creation time constraint
        if (params.dstCancellationTimestamp > params.srcCancellationTimestamp) {
            throw new Error('Destination cancellation time must be before or equal to source cancellation time');
        }

        // Validate timelock ordering
        const timelocks = this.immutablesHelper.createDstTimelocks(
            this.immutablesHelper.getCurrentTimestamp(),
            params.dstWithdrawalTimestamp,
            params.dstPublicWithdrawalTimestamp,
            params.dstCancellationTimestamp
        );

        const tx = new Transaction();

        // Prepare deposit coin
        let depositCoin;
        if (params.coinType === SuiCoinHelper.SUI_TYPE) {
            // For SUI, split from gas
            [depositCoin] = tx.splitCoins(tx.gas, [params.depositAmount]);
        } else {
            // For other tokens, select appropriate coins
            const selectedCoins = await this.coinHelper.selectCoinsForAmount(
                params.depositAmount,
                params.coinType
            );
            
            if (selectedCoins.length === 1 && selectedCoins[0].balance === params.depositAmount) {
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
                    [params.depositAmount]
                );
            }
        }

        // Prepare safety deposit (always SUI)
        const [safetyDepositCoin] = tx.splitCoins(tx.gas, [params.safetyDepositAmount]);

        // Create the escrow
        tx.moveCall({
            target: `${this.packageId}::dst_escrow::create_new`,
            typeArguments: [params.coinType],
            arguments: [
                tx.pure.vector('u8', Array.from(params.orderHash)),
                tx.pure.vector('u8', Array.from(params.hashlock)),
                tx.pure.address(params.maker),
                tx.pure.address(params.taker),
                depositCoin,
                safetyDepositCoin,
                tx.pure.u64(params.dstWithdrawalTimestamp),
                tx.pure.u64(params.dstPublicWithdrawalTimestamp),
                tx.pure.u64(params.dstCancellationTimestamp),
                tx.pure.u64(params.srcCancellationTimestamp),
            ],
        });

        return await this.client.signAndExecuteTransaction({
            transaction: tx,
            signer: this.keypair,
            options: {
                showEffects: true,
                showEvents: true,
                showObjectChanges: true,
            },
        });
    }

    /**
     * Withdraw from escrow (taker only, during withdrawal period)
     */
    async withdraw(params: WithdrawParams): Promise<SuiTransactionBlockResponse> {
        const tx = new Transaction();

        tx.moveCall({
            target: `${this.packageId}::dst_escrow::withdraw`,
            typeArguments: [params.coinType],
            arguments: [
                tx.object(params.escrowId),
                tx.pure.vector('u8', Array.from(params.secret)),
            ],
        });

        return await this.client.signAndExecuteTransaction({
            transaction: tx,
            signer: this.keypair,
            options: {
                showEffects: true,
                showEvents: true,
                showObjectChanges: true,
            },
        });
    }

    /**
     * Public withdrawal (any registered resolver, during public withdrawal period)
     */
    async publicWithdraw(params: PublicWithdrawParams): Promise<SuiTransactionBlockResponse> {
        const tx = new Transaction();

        tx.moveCall({
            target: `${this.packageId}::dst_escrow::public_withdraw`,
            typeArguments: [params.coinType],
            arguments: [
                tx.object(params.escrowId),
                tx.object(params.registryId),
                tx.pure.vector('u8', Array.from(params.secret)),
            ],
        });

        return await this.client.signAndExecuteTransaction({
            transaction: tx,
            signer: this.keypair,
            options: {
                showEffects: true,
                showEvents: true,
                showObjectChanges: true,
            },
        });
    }

    /**
     * Cancel escrow (taker only, after cancellation time)
     */
    async cancel(params: CancelParams): Promise<SuiTransactionBlockResponse> {
        const tx = new Transaction();

        tx.moveCall({
            target: `${this.packageId}::dst_escrow::cancel`,
            typeArguments: [params.coinType],
            arguments: [
                tx.object(params.escrowId),
            ],
        });

        return await this.client.signAndExecuteTransaction({
            transaction: tx,
            signer: this.keypair,
            options: {
                showEffects: true,
                showEvents: true,
                showObjectChanges: true,
            },
        });
    }

    /**
     * Parse dst escrow events from transaction response
     */
    parseDstEscrowEvents(response: SuiTransactionBlockResponse): {
        created: DstEscrowCreatedEvent[];
        withdrawn: DstEscrowWithdrawnEvent[];
        cancelled: DstEscrowCancelledEvent[];
    } {
        const created: DstEscrowCreatedEvent[] = [];
        const withdrawn: DstEscrowWithdrawnEvent[] = [];
        const cancelled: DstEscrowCancelledEvent[] = [];

        if (response.events) {
            for (const event of response.events) {
                try {
                    const parsedFields = event.parsedJson as any;

                    if (event.type.includes('DstEscrowCreatedEvent')) {
                        created.push({
                            id: parsedFields.id,
                            hashlock: new Uint8Array(parsedFields.hashlock),
                            taker: parsedFields.taker,
                            token_package_id: parsedFields.token_package_id,
                            amount: BigInt(parsedFields.amount),
                        });
                    } else if (event.type.includes('DstEscrowWithdrawnEvent')) {
                        withdrawn.push({
                            id: parsedFields.id,
                            secret: new Uint8Array(parsedFields.secret),
                        });
                    } else if (event.type.includes('DstEscrowCancelledEvent')) {
                        cancelled.push({
                            id: parsedFields.id,
                        });
                    }
                } catch (error) {
                    console.error('Error parsing dst escrow event:', error);
                }
            }
        }

        return { created, withdrawn, cancelled };
    }

    /**
     * Get escrow details by ID
     */
    async getEscrowDetails(escrowId: string): Promise<any> {
        const escrowObject = await this.client.getObject({
            id: escrowId,
            options: {
                showContent: true,
                showType: true,
            },
        });

        if (!escrowObject.data?.content || escrowObject.data.content.dataType !== 'moveObject') {
            throw new Error('Failed to fetch escrow object or invalid object type');
        }

        return escrowObject.data.content.fields;
    }

    /**
     * Check if the current time is within withdrawal period
     */
    async isWithdrawalPeriodActive(escrowId: string): Promise<boolean> {
        try {
            const escrowDetails = await this.getEscrowDetails(escrowId);
            const currentTime = this.immutablesHelper.getCurrentTimestamp();
            
            // Extract timelock information from immutables
            const immutables = escrowDetails.immutables;
            const timelocks = immutables.timelocks;
            
            if (timelocks.DstTimelocks) {
                const withdrawalTime = BigInt(timelocks.DstTimelocks.withdrawal);
                const cancellationTime = BigInt(timelocks.DstTimelocks.cancellation);
                
                return currentTime >= withdrawalTime && currentTime < cancellationTime;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking withdrawal period:', error);
            return false;
        }
    }

    /**
     * Check if the current time is within public withdrawal period
     */
    async isPublicWithdrawalPeriodActive(escrowId: string): Promise<boolean> {
        try {
            const escrowDetails = await this.getEscrowDetails(escrowId);
            const currentTime = this.immutablesHelper.getCurrentTimestamp();
            
            const immutables = escrowDetails.immutables;
            const timelocks = immutables.timelocks;
            
            if (timelocks.DstTimelocks) {
                const publicWithdrawalTime = BigInt(timelocks.DstTimelocks.public_withdrawal);
                const cancellationTime = BigInt(timelocks.DstTimelocks.cancellation);
                
                return currentTime >= publicWithdrawalTime && currentTime < cancellationTime;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking public withdrawal period:', error);
            return false;
        }
    }

    /**
     * Check if the current time is within cancellation period
     */
    async isCancellationPeriodActive(escrowId: string): Promise<boolean> {
        try {
            const escrowDetails = await this.getEscrowDetails(escrowId);
            const currentTime = this.immutablesHelper.getCurrentTimestamp();
            
            const immutables = escrowDetails.immutables;
            const timelocks = immutables.timelocks;
            
            if (timelocks.DstTimelocks) {
                const cancellationTime = BigInt(timelocks.DstTimelocks.cancellation);
                return currentTime >= cancellationTime;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking cancellation period:', error);
            return false;
        }
    }

    /**
     * Validate secret against hashlock
     */
    static validateSecret(secret: Uint8Array, hashlock: Uint8Array): boolean {
        return true; // TODO: Implement actual validation
    }

    /**
     * Create standard dst escrow parameters for testing
     */
    createStandardDstEscrowParams(
        orderHash: Uint8Array,
        hashlock: Uint8Array,
        maker: string,
        taker: string,
        depositAmount: bigint,
        safetyDepositAmount: bigint,
        coinType: string = SuiCoinHelper.SUI_TYPE
    ): CreateDstEscrowParams {
        const now = this.immutablesHelper.getCurrentTimestamp();
        const hour = BigInt(60 * 60 * 1000);

        return {
            orderHash,
            hashlock,
            maker,
            taker,
            depositAmount,
            safetyDepositAmount,
            coinType,
            dstWithdrawalTimestamp: now + hour,
            dstPublicWithdrawalTimestamp: now + (2n * hour),
            dstCancellationTimestamp: now + (24n * hour),
            srcCancellationTimestamp: now + (48n * hour),
        };
    }
}