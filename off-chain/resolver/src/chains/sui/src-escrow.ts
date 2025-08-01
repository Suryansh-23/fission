/**
 * Types and helper functions for source escrow operations on Sui
 * 
 * This file contains interface definitions and utility functions for working with
 * source escrows. The actual escrow creation is handled by SuiClient through 
 * the resolver contract's create_src_escrow entry point, which delegates to 
 * the src_escrow::create_new Move function.
 */

export interface MerkleProofData {
    hashlockInfo: Uint8Array;
    secretHash: Uint8Array;
    secretIndex: number;
    proof: Uint8Array[];
}

export interface SignatureData {
    publicKey: Uint8Array;
    signature: Uint8Array;
    scheme: number; // 0=Ed25519, 1=ECDSA-K1, 2=ECDSA-R1
}

export interface CreateSrcEscrowParams {
    merkleData: MerkleProofData;
    orderId: string;
    signatureData: SignatureData;
    depositAmount: bigint;
    safetyDepositAmount: bigint;
    coinType: string;
    srcWithdrawalTimestamp: bigint;
    srcPublicWithdrawalTimestamp: bigint;
    srcCancellationTimestamp: bigint;
    srcPublicCancellationTimestamp: bigint;
}

export interface SrcEscrowInfo {
    escrowId: string;
    orderHash: Uint8Array;
    hashlock: Uint8Array;
    maker: string;
    taker: string;
    makingAmount: bigint;
    takingAmount: bigint;
    depositAmount: bigint;
    safetyDepositAmount: bigint;
}

// Helper functions for creating data structures (keeping only what's needed)

/**
 * Helper function to create MerkleProofData for single fill orders
 */
export function createSingleFillMerkleData(secretHash: Uint8Array): MerkleProofData {
    return {
        hashlockInfo: secretHash,
        secretHash: secretHash,
        secretIndex: 0,
        proof: [],
    };
}

/**
 * Helper function to create SignatureData for Ed25519 signatures
 */
export function createEd25519SignatureData(publicKey: Uint8Array, signature: Uint8Array): SignatureData {
    return {
        publicKey,
        signature,
        scheme: 0, // Ed25519
    };
}

/**
 * Helper function to create SignatureData for ECDSA K1 signatures
 */
export function createEcdsaK1SignatureData(publicKey: Uint8Array, signature: Uint8Array): SignatureData {
    return {
        publicKey,
        signature,
        scheme: 1, // ECDSA-K1
    };
}

/**
 * Helper function to create SignatureData for ECDSA R1 signatures
 */
export function createEcdsaR1SignatureData(publicKey: Uint8Array, signature: Uint8Array): SignatureData {
    return {
        publicKey,
        signature,
        scheme: 2, // ECDSA-R1
    };
}