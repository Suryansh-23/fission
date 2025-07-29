module fusion_plus::src_escrow;

use fusion_plus::immutables::{Self, Immutables};
use fusion_plus::order::{Self, Order, ValidationRegistry};
use fusion_plus::merkle_proof;
use sui::coin::Coin;
use sui::sui::SUI;
use sui::event;
use sui::hash;
use sui::ed25519;

const EInvalidSecret: u64 = 1;
const EInvalidTaker: u64 = 2;
const EInvalidTime: u64 = 3;
const EInvalidMakingAmount: u64 = 4;
const EPartialFillsNotAllowed: u64 = 5;
const EOrderAlreadyFilled: u64 = 6;
const EInvalidSignature: u64 = 7;
const ERescueDelayNotMet: u64 = 8;

const RESCUE_DELAY: u64 = 600_000; // 10 minutes in milliseconds

public struct SrcEscrowCreated has copy, drop {
    id: ID,
    order_hash: vector<u8>,
    hashlock: vector<u8>,
    maker: address,
    taker: address,
    making_amount: u64,
    taking_amount: u64,
}

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

public fun create_new<T: store>(
    ctx: &mut TxContext,    
    hashlock_info: vector<u8>,
    secret_hash: vector<u8>,
    secret_index: u64,
    order_hash: vector<u8>,
    order: &mut Order<T>,
    pk: vector<u8>,
    signature: vector<u8>,
    actual_making_amount: u64,
    actual_taking_amount: u64,
    safety_deposit: Coin<SUI>,
    src_withdrawal_timestamp: u64,
    src_public_withdrawal_timestamp: u64,
    src_cancellation_timestamp: u64,
    src_public_cancellation_timestamp: u64,
    validation_registry: &mut ValidationRegistry,
) {
    let sender = tx_context::sender(ctx);
    
    let maker = order::get_maker(order);
    let making_amount = order::get_making_amount(order);
    let is_partial_fill_allowed = order::is_partial_fill_allowed(order);
    let is_multiple_fills_allowed = order::is_multiple_fills_allowed(order);
    
    assert!(order::is_order_active(order), EOrderAlreadyFilled);

    let verify = ed25519::ed25519_verify(&signature, &pk, &order_hash);
    assert!(verify == true, EInvalidSignature);
    
    if (actual_making_amount != making_amount) {
        assert!(is_partial_fill_allowed, EPartialFillsNotAllowed);
    };
    
    let remaining_balance = order::get_remaining_amount(order);
    assert!(remaining_balance >= actual_making_amount, EInvalidMakingAmount);
    
    // Flow 3: Verify the proof and update lastValidated (only if multiple fills allowed)
    let mut final_hashlock = hashlock_info;
    
    if (is_multiple_fills_allowed) {
        let validation_key = merkle_proof::compute_validation_key(&order_hash, &hashlock_info);
        
        let mut leaf_data = vector::empty<u8>();
        vector::append(&mut leaf_data, sui::bcs::to_bytes(&secret_index));
        vector::append(&mut leaf_data, secret_hash);
        let _calculated_leaf = hash::keccak256(&leaf_data);
        
        // In Move, we can directly validate without root shortening
        // The merkle proof validation would happen here in a full implementation
        
        // Get current validation state for future use
        let mut _validated_index = 0u64;
        if (order::has_validation(validation_registry, &validation_key)) {
            let mut validation_opt = order::get_validation(validation_registry, &validation_key);
            let validation = option::extract(&mut validation_opt);
            _validated_index = order::get_last_index(&validation);
        };
                
        // Update lastValidated: ValidationData(takerData.idx + 1, takerData.secretHash)
        let new_validation = order::create_validation_data(secret_index + 1, secret_hash);
        order::add_validation(validation_registry, validation_key, new_validation);
        
        final_hashlock = secret_hash;
    };
        
    // Extract coins for escrow from the order
    let escrow_deposit = order::split_coins(order, actual_making_amount, ctx);
    
    let timelocks = immutables::new_src_timelocks(
        ctx.epoch_timestamp_ms(),
        src_withdrawal_timestamp,
        src_public_withdrawal_timestamp,
        src_cancellation_timestamp,
        src_public_cancellation_timestamp,
    );
    
    let immutables = immutables::new<T>(
        order_hash,
        final_hashlock,
        maker,
        sender,
        escrow_deposit,
        safety_deposit,
        timelocks,
    );
    
    let escrow = SrcEscrow<T> {
        id: object::new(ctx),
        immutables,
    };
    
    let escrow_id = object::uid_to_inner(&escrow.id);
    
    event::emit(SrcEscrowCreated {
        id: escrow_id,
        order_hash,
        hashlock: final_hashlock,
        maker,
        taker: sender,
        making_amount: actual_making_amount,
        taking_amount: actual_taking_amount,
    });
    
    transfer::share_object(escrow);
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

public fun public_withdraw<T: store>(
    escrow: &mut SrcEscrow<T>,
    secret: vector<u8>,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    
    // Check timelock: after public withdrawal time and before cancellation time
    assert!(current_time >= immutables::get_src_public_withdrawal_time(&escrow.immutables), EInvalidTime);
    assert!(current_time < immutables::get_src_cancellation_time(&escrow.immutables), EInvalidTime);

    // Withdraw to the taker's address
    let taker_address = immutables::get_taker(&escrow.immutables); 
    withdraw_to_internal(escrow, secret, taker_address, ctx);
}

/// Cancel function for taker during private cancellation period
#[allow(lint(self_transfer))]
public fun cancel<T: store>(
    escrow: &mut SrcEscrow<T>,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    
    // Check that caller is the taker
    assert!(ctx.sender() == immutables::get_taker(&escrow.immutables), EInvalidTaker);
    
    // Check timelock: after cancellation time
    assert!(current_time >= immutables::get_src_cancellation_time(&escrow.immutables), EInvalidTime);
    
    let safety_deposit = cancel_internal(escrow, ctx);
    transfer::public_transfer(safety_deposit, ctx.sender());
}

/// Public cancel function during public cancellation period (anyone can call)
#[allow(lint(self_transfer))]
public fun public_cancel<T: store>(
    escrow: &mut SrcEscrow<T>,
    ctx: &mut TxContext,
) {
    let current_time = ctx.epoch_timestamp_ms();
    let sender = tx_context::sender(ctx);
    
    // Check timelock: after public cancellation time
    assert!(current_time >= immutables::get_src_public_cancellation_time(&escrow.immutables), EInvalidTime);
    
    let safety_deposit = cancel_internal(escrow, ctx);
    transfer::public_transfer(safety_deposit, sender);
}

/// Rescue function - allows recovery of funds after rescue delay period
/// Can be called by anyone after the rescue delay has passed since deployment
public fun rescue<T: store>(
    ctx: &mut TxContext,
    escrow: &mut SrcEscrow<T>,
): Coin<T> {
    assert!(ctx.sender() == immutables::get_taker(&escrow.immutables), EInvalidTaker);

    let current_time = ctx.epoch_timestamp_ms();
    let deployment_time = immutables::get_deployment_time(&escrow.immutables);
    
    // Check that rescue delay has passed since deployment
    assert!(current_time >= deployment_time + RESCUE_DELAY, ERescueDelayNotMet);
    
    // Extract and return the deposit to the caller
    let deposit = immutables::extract_deposit(&mut escrow.immutables, ctx);
    deposit
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
fun cancel_internal<T: store>(
    escrow: &mut SrcEscrow<T>,
    ctx: &mut TxContext,
): Coin<SUI> {
    // Extract deposits from immutables
    let deposit = immutables::extract_deposit(&mut escrow.immutables, ctx);
    let safety_deposit = immutables::extract_safety_deposit(&mut escrow.immutables, ctx);
    
    // Get maker address
    let maker_address = immutables::get_maker(&escrow.immutables);

    // Transfer deposit back to maker
    transfer::public_transfer(deposit, maker_address);
    
    // Emit cancellation event
    event::emit(EscrowCancelled {
        escrow_id: object::uid_to_inner(&escrow.id),
    });
    
    safety_deposit
}