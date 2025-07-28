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