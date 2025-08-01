module resolver::resolver;

use fusion_plus::dst_escrow::{Self, DstEscrow};
use fusion_plus::immutables::{Self, Immutables};
use fusion_plus::order::Order;
use fusion_plus::src_escrow::{Self, SrcEscrow};
use std::type_name;
use sui::coin::{Self, Coin};
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

public entry fun create_src_escrow<T: store>(
    _cap: &ResolverCap,
    order: &mut Order<T>,
    deposit_amount: u64,
    safety_deposit: Coin<SUI>,
    signature: vector<u8>,
    pk: vector<u8>,
    scheme: u8,
    hashlock_info: vector<u8>,
    secret_hash: vector<u8>,
    secret_index: u64,
    proof: vector<vector<u8>>,
    src_withdrawal_timestamp: u64,
    src_public_withdrawal_timestamp: u64,
    src_cancellation_timestamp: u64,
    src_public_cancellation_timestamp: u64,
    ctx: &mut TxContext,
) {
    let timelocks = immutables::new_src_timelocks(
        ctx.epoch_timestamp_ms(),
        src_withdrawal_timestamp,
        src_public_withdrawal_timestamp,
        src_cancellation_timestamp,
        src_public_cancellation_timestamp,
    );

    let merkle_data = src_escrow::new_merkle_proof_data(
        hashlock_info,
        secret_hash,
        secret_index,
        proof,
    );

    let signature_data = src_escrow::new_signature_data(
        pk,
        signature,
        scheme,
    );

    src_escrow::create_new(
        merkle_data,
        order,
        signature_data,
        deposit_amount,
        safety_deposit,
        timelocks,
        ctx,
    );
}

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
    let timelocks = immutables::new_dst_timelocks(
        ctx.epoch_timestamp_ms(),
        dst_withdrawal_timestamp,
        dst_public_withdrawal_timestamp,
        dst_cancellation_timestamp,
    );

    let type_name = type_name::get<T>();
    let asset_id = type_name::get_address(&type_name);

    let immutables: Immutables = immutables::new(
        order_hash,
        hashlock,
        maker,
        taker,
        asset_id,
        coin::value(&deposit),
        coin::value(&safety_deposit),
        timelocks,
    );

    dst_escrow::create_new(
        immutables,
        src_cancellation_timestamp,
        deposit,
        safety_deposit,
        ctx,
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
    src_escrow::withdraw_to(escrow, secret, target, ctx);
}

// Main entry point for withdrawing from destination escrows
public entry fun withdraw_dst<T: store>(
    _cap: &ResolverCap,
    escrow: &mut DstEscrow<T>,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    // Delegate to the dst_escrow module's withdraw function
    let safety_deposit = dst_escrow::withdraw(escrow, secret, ctx);
    transfer::public_transfer(safety_deposit, tx_context::sender(ctx));
}

// Main entry point for public withdrawal from source escrows
public entry fun public_withdraw_src<T: store>(
    _cap: &ResolverCap,
    escrow: &mut SrcEscrow<T>,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    src_escrow::public_withdraw(escrow, secret, ctx);
}

// Main entry point for public withdrawal from destination escrows
public entry fun public_withdraw_dst<T: store>(
    _cap: &ResolverCap,
    escrow: &mut DstEscrow<T>,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    let safety_deposit = dst_escrow::public_withdraw(escrow, secret, ctx);
    transfer::public_transfer(safety_deposit, tx_context::sender(ctx));
}

// Main entry point for canceling source escrows
public entry fun cancel_src<T: store>(
    _cap: &ResolverCap,
    escrow: &mut SrcEscrow<T>,
    ctx: &mut TxContext,
) {
    let safety_deposit = src_escrow::cancel(escrow, ctx);
    transfer::public_transfer(safety_deposit, tx_context::sender(ctx));
}

// Main entry point for canceling destination escrows
public entry fun cancel_dst<T: store>(
    _cap: &ResolverCap,
    escrow: &mut DstEscrow<T>,
    ctx: &mut TxContext,
) {
    let safety_deposit = dst_escrow::cancel(escrow, ctx);
    transfer::public_transfer(safety_deposit, tx_context::sender(ctx));
}

// Main entry point for public canceling source escrows
public entry fun public_cancel_src<T: store>(
    _cap: &ResolverCap,
    escrow: &mut SrcEscrow<T>,
    ctx: &mut TxContext,
) {
    let safety_deposit = src_escrow::public_cancel(escrow, ctx);
    transfer::public_transfer(safety_deposit, tx_context::sender(ctx));
}

// Transfer admin capability
public entry fun transfer_admin(cap: ResolverCap, new_admin: address) {
    transfer::public_transfer(cap, new_admin);
}
