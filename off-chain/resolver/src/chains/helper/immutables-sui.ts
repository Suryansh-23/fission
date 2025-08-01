/**
 * 
 * module fusion_plus::immutables;

use std::bcs;
use sui::hash;
use sui::sui::SUI;
use sui::balance::{Self, Balance};

public enum Timelocks has drop, store {
    SrcTimelocks {
        deployment: u64,
        withdrawal: u64,
        public_withdrawal: u64,
        cancellation: u64,
        public_cancellation: u64,
    },
    DstTimelocks {
        deployment: u64,
        withdrawal: u64,
        public_withdrawal: u64,
        cancellation: u64,
    },
}

public struct Immutables<phantom T: store> has store {
    order_hash: vector<u8>,
    hashlock: vector<u8>,
    maker: address,
    taker: address,
    deposit: Balance<T>,
    safety_deposit: Balance<SUI>,
    timelocks: Timelocks,
}

public(package) fun hash<T: store>(immutables: &Immutables<T>): vector<u8> {
    let immutables_bytes = bcs::to_bytes(immutables);
    hash::keccak256(&immutables_bytes)
}

public fun new_src_timelocks(
    deployment: u64,
    withdrawal: u64,
    public_withdrawal: u64,
    cancellation: u64,
    public_cancellation: u64,
): Timelocks {
    Timelocks::SrcTimelocks {
        deployment,
        withdrawal,
        public_withdrawal,
        cancellation,
        public_cancellation,
    }
}

public fun new_dst_timelocks(
    deployment: u64,
    withdrawal: u64,
    public_withdrawal: u64,
    cancellation: u64,
): Timelocks {
    Timelocks::DstTimelocks {
        deployment,
        withdrawal,
        public_withdrawal,
        cancellation,
    }
}

public fun new<T: store>(
    order_hash: vector<u8>,
    hashlock: vector<u8>,
    maker: address,
    taker: address,
    deposit: Balance<T>,
    safety_deposit: Balance<SUI>,
    timelocks: Timelocks,
): Immutables<T> {
    Immutables {
        order_hash,
        hashlock,
        maker,
        taker,
        deposit,
        safety_deposit,
        timelocks,
    }
}

public(package) fun set_hashlock<T: store>(
    immutables: &mut Immutables<T>,
    hashlock: vector<u8>,
) {
    immutables.hashlock = hashlock;
}

// Getter functions for accessing immutable fields
public fun get_order_hash<T: store>(immutables: &Immutables<T>): vector<u8> {
    immutables.order_hash
}

public fun get_hashlock<T: store>(immutables: &Immutables<T>): vector<u8> {
    immutables.hashlock
}

public fun get_maker<T: store>(immutables: &Immutables<T>): address {
    immutables.maker
}

public fun get_taker<T: store>(immutables: &Immutables<T>): address {
    immutables.taker
}

// Timelock getter functions
public fun get_src_withdrawal_time<T: store>(immutables: &Immutables<T>): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { withdrawal, .. } => *withdrawal,
        Timelocks::DstTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_src_public_withdrawal_time<T: store>(immutables: &Immutables<T>): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { public_withdrawal, .. } => *public_withdrawal,
        Timelocks::DstTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_src_cancellation_time<T: store>(immutables: &Immutables<T>): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { cancellation, .. } => *cancellation,
        Timelocks::DstTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_src_public_cancellation_time<T: store>(immutables: &Immutables<T>): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { public_cancellation, .. } => *public_cancellation,
        Timelocks::DstTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_dst_withdrawal_time<T: store>(immutables: &Immutables<T>): u64 {
    match (&immutables.timelocks) {
        Timelocks::DstTimelocks { withdrawal, .. } => *withdrawal,
        Timelocks::SrcTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_dst_public_withdrawal_time<T: store>(immutables: &Immutables<T>): u64 {
    match (&immutables.timelocks) {
        Timelocks::DstTimelocks { public_withdrawal, .. } => *public_withdrawal,
        Timelocks::SrcTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_dst_cancellation_time<T: store>(immutables: &Immutables<T>): u64 {
    match (&immutables.timelocks) {
        Timelocks::DstTimelocks { cancellation, .. } => *cancellation,
        Timelocks::SrcTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_deployment_time<T: store>(immutables: &Immutables<T>): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { deployment, .. } => *deployment,
        Timelocks::DstTimelocks { deployment, .. } => *deployment,
    }
}

public fun get_deposit_value<T: store>(immutables: &Immutables<T>): u64 {
    balance::value(&immutables.deposit)
}

public fun get_safety_deposit_value<T: store>(immutables: &Immutables<T>): u64 {
    balance::value(&immutables.safety_deposit)
}
*/

import { SuiClient, SuiTransactionBlockResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Timelock interfaces matching the Move enum
export interface SrcTimelocks {
    type: 'SrcTimelocks';
    deployment: bigint;
    withdrawal: bigint;
    public_withdrawal: bigint;
    cancellation: bigint;
    public_cancellation: bigint;
}

export interface DstTimelocks {
    type: 'DstTimelocks';
    deployment: bigint;
    withdrawal: bigint;
    public_withdrawal: bigint;
    cancellation: bigint;
}

export type Timelocks = SrcTimelocks | DstTimelocks;

// Immutables data interface
export interface ImmutablesData<T = string> {
    order_hash: Uint8Array;
    hashlock: Uint8Array;
    maker: string;
    taker: string;
    deposit_amount: bigint;
    safety_deposit_amount: bigint;
    timelocks: Timelocks;
    coin_type: T;
}

export class SuiImmutablesHelper {
    private client: SuiClient;
    private keypair: Ed25519Keypair;
    private packageId: string;

    constructor(client: SuiClient, keypair: Ed25519Keypair, packageId: string) {
        this.client = client;
        this.keypair = keypair;
        this.packageId = packageId;
    }

    /**
     * Create source chain timelocks with validation
     */
    createSrcTimelocks(
        deployment: bigint,
        withdrawal: bigint,
        publicWithdrawal: bigint,
        cancellation: bigint,
        publicCancellation: bigint
    ): SrcTimelocks {
        // Validate timelock ordering
        this.validateSrcTimelockOrdering(deployment, withdrawal, publicWithdrawal, cancellation, publicCancellation);

        return {
            type: 'SrcTimelocks',
            deployment,
            withdrawal,
            public_withdrawal: publicWithdrawal,
            cancellation,
            public_cancellation: publicCancellation,
        };
    }

    /**
     * Create destination chain timelocks with validation
     */
    createDstTimelocks(
        deployment: bigint,
        withdrawal: bigint,
        publicWithdrawal: bigint,
        cancellation: bigint
    ): DstTimelocks {
        // Validate timelock ordering
        this.validateDstTimelockOrdering(deployment, withdrawal, publicWithdrawal, cancellation);

        return {
            type: 'DstTimelocks',
            deployment,
            withdrawal,
            public_withdrawal: publicWithdrawal,
            cancellation,
        };
    }

    /**
     * Validate source timelock ordering
     */
    private validateSrcTimelockOrdering(
        deployment: bigint,
        withdrawal: bigint,
        publicWithdrawal: bigint,
        cancellation: bigint,
        publicCancellation: bigint
    ): void {
        if (deployment >= withdrawal) {
            throw new Error('Deployment time must be before withdrawal time');
        }
        if (withdrawal >= publicWithdrawal) {
            throw new Error('Withdrawal time must be before public withdrawal time');
        }
        if (publicWithdrawal >= cancellation) {
            throw new Error('Public withdrawal time must be before cancellation time');
        }
        if (cancellation >= publicCancellation) {
            throw new Error('Cancellation time must be before public cancellation time');
        }
    }

    /**
     * Validate destination timelock ordering
     */
    private validateDstTimelockOrdering(
        deployment: bigint,
        withdrawal: bigint,
        publicWithdrawal: bigint,
        cancellation: bigint
    ): void {
        if (deployment >= withdrawal) {
            throw new Error('Deployment time must be before withdrawal time');
        }
        if (withdrawal >= publicWithdrawal) {
            throw new Error('Withdrawal time must be before public withdrawal time');
        }
        if (publicWithdrawal >= cancellation) {
            throw new Error('Public withdrawal time must be before cancellation time');
        }
    }

    /**
     * Create Move call arguments for source timelocks
     */
    createSrcTimelocksArgs(tx: Transaction, timelocks: SrcTimelocks): any {
        return tx.moveCall({
            target: `${this.packageId}::immutables::new_src_timelocks`,
            arguments: [
                tx.pure.u64(timelocks.deployment),
                tx.pure.u64(timelocks.withdrawal),
                tx.pure.u64(timelocks.public_withdrawal),
                tx.pure.u64(timelocks.cancellation),
                tx.pure.u64(timelocks.public_cancellation),
            ],
        });
    }

    /**
     * Create Move call arguments for destination timelocks
     */
    createDstTimelocksArgs(tx: Transaction, timelocks: DstTimelocks): any {
        return tx.moveCall({
            target: `${this.packageId}::immutables::new_dst_timelocks`,
            arguments: [
                tx.pure.u64(timelocks.deployment),
                tx.pure.u64(timelocks.withdrawal),
                tx.pure.u64(timelocks.public_withdrawal),
                tx.pure.u64(timelocks.cancellation),
            ],
        });
    }

    /**
     * Get current timestamp in milliseconds (Sui uses milliseconds)
     */
    getCurrentTimestamp(): bigint {
        return BigInt(Date.now());
    }

    /**
     * Create standard timelock intervals (useful for testing/demo)
     */
    createStandardDstTimelocks(baseTime?: bigint): DstTimelocks {
        const now = baseTime || this.getCurrentTimestamp();
        const hour = BigInt(60 * 60 * 1000); // 1 hour in milliseconds
        
        return this.createDstTimelocks(
            now,                    // deployment: now
            now + hour,             // withdrawal: 1 hour from now
            now + (2n * hour),      // public_withdrawal: 2 hours from now
            now + (24n * hour)      // cancellation: 24 hours from now
        );
    }

    /**
     * Create standard source timelocks
     */
    createStandardSrcTimelocks(baseTime?: bigint): SrcTimelocks {
        const now = baseTime || this.getCurrentTimestamp();
        const hour = BigInt(60 * 60 * 1000);
        
        return this.createSrcTimelocks(
            now,                    // deployment: now
            now + hour,             // withdrawal: 1 hour from now
            now + (2n * hour),      // public_withdrawal: 2 hours from now
            now + (24n * hour),     // cancellation: 24 hours from now
            now + (48n * hour)      // public_cancellation: 48 hours from now
        );
    }

    /**
     * Validate immutables data before creating escrow
     */
    validateImmutablesData(data: ImmutablesData): void {
        // Validate addresses
        if (!data.maker || !data.taker) {
            throw new Error('Maker and taker addresses are required');
        }

        // Validate amounts
        if (data.deposit_amount <= 0n) {
            throw new Error('Deposit amount must be greater than 0');
        }
        if (data.safety_deposit_amount <= 0n) {
            throw new Error('Safety deposit amount must be greater than 0');
        }

        // Validate hash lengths
        if (data.order_hash.length !== 32) {
            throw new Error('Order hash must be 32 bytes');
        }
        if (data.hashlock.length !== 32) {
            throw new Error('Hashlock must be 32 bytes');
        }

        // Validate timelocks based on type
        if (data.timelocks.type === 'SrcTimelocks') {
            this.validateSrcTimelockOrdering(
                data.timelocks.deployment,
                data.timelocks.withdrawal,
                data.timelocks.public_withdrawal,
                data.timelocks.cancellation,
                data.timelocks.public_cancellation
            );
        } else {
            this.validateDstTimelockOrdering(
                data.timelocks.deployment,
                data.timelocks.withdrawal,
                data.timelocks.public_withdrawal,
                data.timelocks.cancellation
            );
        }
    }

    /**
     * Generate a secure hashlock from a secret
     */
    static generateHashlock(secret: Uint8Array): Uint8Array {
        // In production, you'd use a proper cryptographic library
        // This is a simplified version using built-in crypto
        return new Uint8Array(32); // Placeholder - implement with actual keccak256
    }

    /**
     * Generate a random order hash
     */
    static generateOrderHash(): Uint8Array {
        const hash = new Uint8Array(32);
        crypto.getRandomValues(hash);
        return hash;
    }

    /**
     * Convert hex string to Uint8Array
     */
    static hexToBytes(hex: string): Uint8Array {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    /**
     * Convert Uint8Array to hex string
     */
    static bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}
