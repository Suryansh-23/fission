module fusion_plus::dst_escrow;

use fusion_plus::immutables::{Self, Immutables};
use fusion_plus::registry::{Self, ResolverRegistry};
use std::ascii::String;
use std::type_name;
use sui::coin::{Self, Coin};
use sui::event;
use sui::hash;
use sui::sui::SUI;

const EInvalidCreationTime: u64 = 0;
const ENotTaker: u64 = 1;
const EInvalidTime: u64 = 2;
const EInvalidSecret: u64 = 3;
const EInvalidDeposit: u64 = 4;
const EInvalidSafetyDeposit: u64 = 5;

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

#[allow(lint(coin_field))]
public struct DstEscrow<phantom T: store> has key {
    id: UID,
    immutables: Immutables,
    deposit: Coin<T>,
    safety_deposit: Coin<SUI>,
}

public fun create_new<T: store>(
    immutables: Immutables,
    src_cancellation_timestamp: u64,
    deposit: Coin<T>,
    safety_deposit: Coin<SUI>,
    ctx: &mut TxContext,
) {
    assert!(
        immutables::get_dst_cancellation_time(&immutables) <= src_cancellation_timestamp,
        EInvalidCreationTime,
    );

    let amount = coin::value(&deposit);

    assert!(immutables::get_deposit_value(&immutables) == amount, EInvalidDeposit);
    assert!(
        immutables::get_safety_deposit_value(&immutables) == coin::value(&safety_deposit),
        EInvalidSafetyDeposit,
    );

    let type_name = type_name::get<T>();
    assert!(type_name == immutables::get_type_name(&immutables), EInvalidDeposit);

    let token_package_id = type_name::get_address(&type_name);

    let hashlock = immutables::get_hashlock(&immutables);
    let taker = ctx.sender();

    let mut immutables_modified = immutables;
    immutables::set_dst_deployment_time(
        &mut immutables_modified,
        ctx.epoch_timestamp_ms(),
    );

    let escrow = DstEscrow<T> {
        id: object::new(ctx),
        immutables: immutables_modified,
        deposit,
        safety_deposit,
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
): Coin<SUI> {
    let current_time = ctx.epoch_timestamp_ms();

    let taker = immutables::get_taker(&escrow.immutables);
    assert!(ctx.sender() == taker, ENotTaker);

    let dst_withdrawal_time = immutables::get_dst_withdrawal_time(&escrow.immutables);
    let dst_cancellation_time = immutables::get_dst_cancellation_time(&escrow.immutables);
    assert!(current_time >= dst_withdrawal_time, EInvalidTime);
    assert!(current_time < dst_cancellation_time, EInvalidTime);

    withdraw_internal(escrow, secret, ctx)
}

// Public withdrawal function - allows withdrawal during public period with access token
public fun public_withdraw<T: store>(
    escrow: &mut DstEscrow<T>,
    registry: &ResolverRegistry,
    secret: vector<u8>,
    ctx: &mut TxContext,
): Coin<SUI> {
    let current_time = ctx.epoch_timestamp_ms();

    let dst_public_withdrawal_time = immutables::get_dst_public_withdrawal_time(&escrow.immutables);
    let dst_cancellation_time = immutables::get_dst_cancellation_time(&escrow.immutables);
    assert!(current_time >= dst_public_withdrawal_time, EInvalidTime);
    assert!(current_time < dst_cancellation_time, EInvalidTime);

    registry::assert_resolver(registry, ctx.sender().to_id());

    withdraw_internal(escrow, secret, ctx)
}

fun withdraw_internal<T: store>(
    escrow: &mut DstEscrow<T>,
    secret: vector<u8>,
    ctx: &mut TxContext,
): Coin<SUI> {
    let secret_hash = hash::keccak256(&secret);
    let stored_hashlock = immutables::get_hashlock(&escrow.immutables);
    assert!(secret_hash == stored_hashlock, EInvalidSecret);

    let maker = immutables::get_maker(&escrow.immutables);

    let deposit_amount = coin::value(&escrow.deposit);
    let deposit = coin::split(&mut escrow.deposit, deposit_amount, ctx);
    transfer::public_transfer(deposit, maker);

    let safety_amount = coin::value(&escrow.safety_deposit);
    let safety_deposit = coin::split(&mut escrow.safety_deposit, safety_amount, ctx);

    event::emit(DstEscrowWithdrawnEvent {
        id: object::uid_to_inner(&escrow.id),
        secret,
    });

    safety_deposit
}

public fun cancel<T: store>(escrow: &mut DstEscrow<T>, ctx: &mut TxContext): Coin<SUI> {
    let current_time = ctx.epoch_timestamp_ms();
    let sender = tx_context::sender(ctx);

    let taker = immutables::get_taker(&escrow.immutables);
    assert!(sender == taker, ENotTaker);

    let dst_cancellation_time = immutables::get_dst_cancellation_time(&escrow.immutables);
    assert!(current_time >= dst_cancellation_time, EInvalidTime);

    let deposit_amount = coin::value(&escrow.deposit);
    let deposit = coin::split(&mut escrow.deposit, deposit_amount, ctx);
    transfer::public_transfer(deposit, taker);

    let safety_amount = coin::value(&escrow.safety_deposit);
    let safety_deposit = coin::split(&mut escrow.safety_deposit, safety_amount, ctx);

    event::emit(DstEscrowCancelledEvent {
        id: object::uid_to_inner(&escrow.id),
    });

    safety_deposit
}
