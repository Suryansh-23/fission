module fusion_plus::immutables;

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