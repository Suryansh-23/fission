/// Merkle Proof Verification Module
///
/// This module provides utilities for working with Merkle proofs in the context
/// of multi-fill orders. It implements standard merkle proof verification
/// for ensuring order fill validity using full 32-byte merkle roots.
module fusion_plus::merkle_proof;

use sui::hash;

// Compute leaf hash: keccak256(abi.encodePacked(uint64(index), secretHash))
public fun compute_leaf_hash(index: u16, secret_hash: vector<u8>): vector<u8> {
    let mut combined = vector::empty<u8>();

    // Convert u64 to bytes (big-endian, 8 bytes)
    let mut i = 0;
    while (i < 8) {
        let byte = ((index >> (56 - i * 8)) & 0xFF as u8);
        vector::push_back(&mut combined, byte);
        i = i + 1;
    };

    vector::append(&mut combined, secret_hash);
    hash::keccak256(&combined)
}

// Process merkle proof to compute root
public fun process_merkle_proof(
    leaf: vector<u8>,
    index: u64,
    proof: &vector<vector<u8>>,
): vector<u8> {
    let mut current_hash = leaf;
    let mut current_index = index;
    let mut i = 0;

    while (i < vector::length(proof)) {
        let proof_element = *vector::borrow(proof, i);

        if (current_index % 2 == 0) {
            // Left side
            let mut combined = vector::empty<u8>();
            vector::append(&mut combined, current_hash);
            vector::append(&mut combined, proof_element);
            current_hash = hash::keccak256(&combined);
        } else {
            // Right side
            let mut combined = vector::empty<u8>();
            vector::append(&mut combined, proof_element);
            vector::append(&mut combined, current_hash);
            current_hash = hash::keccak256(&combined);
        };

        current_index = current_index / 2;
        i = i + 1;
    };

    current_hash
}

// Complete merkle proof verification for order fills
public fun process_proof(
    secret_index: u64,
    secret_hash: vector<u8>,
    merkle_proof: vector<vector<u8>>,
): vector<u8> {
    let leaf = compute_leaf_hash(secret_index as u16, secret_hash);
    let calculated_root = process_merkle_proof(leaf, secret_index, &merkle_proof);
    calculated_root
}
