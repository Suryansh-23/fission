module fusion_plus::immutables;

use std::bcs;
use std::type_name::TypeName;
use sui::hash;

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

public struct Immutables has store {
    order_hash: vector<u8>,
    hashlock: vector<u8>,
    maker: address,
    taker: address,
    type_name: TypeName,
    deposit: u64,
    safety_deposit: u64,
    timelocks: Timelocks,
}

public(package) fun hash(immutables: &Immutables): vector<u8> {
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

public fun new(
    order_hash: vector<u8>,
    hashlock: vector<u8>,
    maker: address,
    taker: address,
    type_name: TypeName,
    deposit: u64,
    safety_deposit: u64,
    timelocks: Timelocks,
): Immutables {
    Immutables {
        order_hash,
        hashlock,
        maker,
        taker,
        type_name,
        deposit,
        safety_deposit,
        timelocks,
    }
}

public(package) fun set_src_deployment_time(immutables: &mut Immutables, deployed_time: u64) {
    match (&mut immutables.timelocks) {
        Timelocks::SrcTimelocks { deployment, .. } => {
            *deployment = deployed_time;
        },
        Timelocks::DstTimelocks { .. } => {},
    }
}

public(package) fun set_dst_deployment_time(immutables: &mut Immutables, deployed_time: u64) {
    match (&mut immutables.timelocks) {
        Timelocks::SrcTimelocks { .. } => {},
        Timelocks::DstTimelocks { deployment, .. } => {
            *deployment = deployed_time;
        },
    }
}

// Getter functions for accessing immutable fields
public fun get_order_hash(immutables: &Immutables): vector<u8> {
    immutables.order_hash
}

public fun get_hashlock(immutables: &Immutables): vector<u8> {
    immutables.hashlock
}

public fun get_maker(immutables: &Immutables): address {
    immutables.maker
}

public fun get_taker(immutables: &Immutables): address {
    immutables.taker
}

// Timelock getter functions
public fun get_src_withdrawal_time(immutables: &Immutables): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { withdrawal, .. } => *withdrawal,
        Timelocks::DstTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_src_public_withdrawal_time(immutables: &Immutables): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { public_withdrawal, .. } => *public_withdrawal,
        Timelocks::DstTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_src_cancellation_time(immutables: &Immutables): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { cancellation, .. } => *cancellation,
        Timelocks::DstTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_src_public_cancellation_time(immutables: &Immutables): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { public_cancellation, .. } => *public_cancellation,
        Timelocks::DstTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_dst_withdrawal_time(immutables: &Immutables): u64 {
    match (&immutables.timelocks) {
        Timelocks::DstTimelocks { withdrawal, .. } => *withdrawal,
        Timelocks::SrcTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_dst_public_withdrawal_time(immutables: &Immutables): u64 {
    match (&immutables.timelocks) {
        Timelocks::DstTimelocks { public_withdrawal, .. } => *public_withdrawal,
        Timelocks::SrcTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_dst_cancellation_time(immutables: &Immutables): u64 {
    match (&immutables.timelocks) {
        Timelocks::DstTimelocks { cancellation, .. } => *cancellation,
        Timelocks::SrcTimelocks { .. } => abort 999, // Invalid timelock type
    }
}

public fun get_deployment_time(immutables: &Immutables): u64 {
    match (&immutables.timelocks) {
        Timelocks::SrcTimelocks { deployment, .. } => *deployment,
        Timelocks::DstTimelocks { deployment, .. } => *deployment,
    }
}

public fun get_deposit_value(immutables: &Immutables): u64 {
    immutables.deposit
}

public fun get_safety_deposit_value(immutables: &Immutables): u64 {
    immutables.safety_deposit
}

public fun get_type_name(immutables: &Immutables): TypeName {
    immutables.type_name
}
