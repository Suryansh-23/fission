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