module fusion_plus::src_escrow;

use fusion_plus::immutables::{Self, Immutables};
use fusion_plus::registry::{Self, ResolverRegistry};
use sui::event;
use sui::hash;

const EInvalidSecret: u64 = 1;
const EInvalidTaker: u64 = 2;
const EInvalidTime: u64 = 4;

public struct EscrowWithdrawal has copy, drop {
    secret: vector<u8>,
    escrow_id: ID,
}

public struct EscrowCancelled has copy, drop {
    escrow_id: ID,
}

public struct SrcEscrow<phantom T: store> has key {
    id: UID,
    immutables: Immutables<T>,
}

/// Withdraw to specific address function for taker during private withdrawal period  
public fun withdraw_to<T: store>(
    escrow: &mut SrcEscrow<T>,
    secret: vector<u8>,
    target: address,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    
    // Check that caller is the taker
    assert!(ctx.sender() == immutables::get_taker(&escrow.immutables), EInvalidTaker);
    
    // Check timelock: after withdrawal time and before cancellation time
    assert!(current_time >= immutables::get_src_withdrawal_time(&escrow.immutables), EInvalidTime);
    assert!(current_time < immutables::get_src_cancellation_time(&escrow.immutables), EInvalidTime);
    
    withdraw_to_internal(escrow, secret, target, ctx);
}

/// Public withdrawal function for registered resolvers during public withdrawal period
public fun public_withdraw<T: store>(
    escrow: &mut SrcEscrow<T>,
    registry: &ResolverRegistry,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    let sender = tx_context::sender(ctx);
    
    // Check timelock: after public withdrawal time and before cancellation time
    assert!(current_time >= immutables::get_src_public_withdrawal_time(&escrow.immutables), EInvalidTime);
    assert!(current_time < immutables::get_src_cancellation_time(&escrow.immutables), EInvalidTime);
    
    // Access token validation - check if sender is a registered resolver
    let resolver_id = object::id_from_address(sender);
    registry::assert_resolver(registry, resolver_id);

    // Withdraw to the taker's address
    let taker_address = immutables::get_taker(&escrow.immutables); 
    withdraw_to_internal(escrow, secret, taker_address, ctx);
}

/// Cancel function for taker during private cancellation period
public fun cancel<T: store>(
    escrow: &mut SrcEscrow<T>,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    
    // Check that caller is the taker
    assert!(ctx.sender() == immutables::get_taker(&escrow.immutables), EInvalidTaker);
    
    // Check timelock: after cancellation time
    assert!(current_time >= immutables::get_src_cancellation_time(&escrow.immutables), EInvalidTime);
    
    cancel_internal(escrow, ctx);
}

/// Public cancel function for registered resolvers during public cancellation period
public fun public_cancel<T: store>(
    escrow: &mut SrcEscrow<T>,
    registry: &ResolverRegistry,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    let sender = tx_context::sender(ctx);
    
    // Check timelock: after public cancellation time
    assert!(current_time >= immutables::get_src_public_cancellation_time(&escrow.immutables), EInvalidTime);
    
    // Access token validation - check if sender is a registered resolver
    let resolver_id = object::id_from_address(sender);
    registry::assert_resolver(registry, resolver_id);
    
    cancel_internal(escrow, ctx);
}

/// Internal function to handle withdrawal logic
#[allow(lint(self_transfer))]
fun withdraw_to_internal<T: store>(
    escrow: &mut SrcEscrow<T>,
    secret: vector<u8>,
    target: address,
    ctx: &mut TxContext,
) {
    // Validate secret against hashlock
    let secret_hash = hash::keccak256(&secret);
    assert!(secret_hash == immutables::get_hashlock(&escrow.immutables), EInvalidSecret);

    let sender = tx_context::sender(ctx);
    
    // Extract the deposit and safety deposit
    let deposit = immutables::extract_deposit(&mut escrow.immutables, ctx);
    let safety_deposit = immutables::extract_safety_deposit(&mut escrow.immutables, ctx);
    
    // Transfer deposit to target and safety deposit to caller
    transfer::public_transfer(deposit, target);
    transfer::public_transfer(safety_deposit, sender);
    
    // Emit withdrawal event
    event::emit(EscrowWithdrawal {
        secret,
        escrow_id: object::uid_to_inner(&escrow.id),
    });
}

/// Internal function to handle cancellation logic
#[allow(lint(self_transfer))]
fun cancel_internal<T: store>(
    escrow: &mut SrcEscrow<T>,
    ctx: &mut TxContext,
) {
    let sender = tx_context::sender(ctx);
    
    // Extract the deposit and safety deposit
    let deposit = immutables::extract_deposit(&mut escrow.immutables, ctx);
    let safety_deposit = immutables::extract_safety_deposit(&mut escrow.immutables, ctx);
    
    // Transfer deposit back to maker and safety deposit to caller
    let maker_address = immutables::get_maker(&escrow.immutables);
    transfer::public_transfer(deposit, maker_address);
    transfer::public_transfer(safety_deposit, sender);
    
    // Emit cancellation event
    event::emit(EscrowCancelled {
        escrow_id: object::uid_to_inner(&escrow.id),
    });
}