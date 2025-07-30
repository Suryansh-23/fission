module fusion_plus::src_escrow;

use fusion_plus::immutables::{Self, Immutables};
use fusion_plus::merkle_proof;
use fusion_plus::order::{Self, Order};
use fusion_plus::registry::{Self, ResolverRegistry};
use sui::coin::{Self, Coin};
use sui::ecdsa_k1;
use sui::ecdsa_r1;
use sui::ed25519;
use sui::event;
use sui::hash;
use sui::sui::SUI;
use sui::table::{Self, Table};

const EInvalidSecret: u64 = 1;
const EInvalidTaker: u64 = 2;
const EInvalidTime: u64 = 3;
const EPartialFillsNotAllowed: u64 = 5;
const EOrderAlreadyFilled: u64 = 6;
const EInvalidSignature: u64 = 7;
const ERescueDelayNotMet: u64 = 8;
const EUnsupportedSignatureScheme: u64 = 9;
const EInvalidProof: u64 = 10;

const RESCUE_DELAY: u64 = 600_000; // 10 minutes in milliseconds

// Signature scheme constants
const SIGNATURE_SCHEME_ED25519: u8 = 0;
const SIGNATURE_SCHEME_ECDSA_K1: u8 = 1;
const SIGNATURE_SCHEME_ECDSA_R1: u8 = 2;

// Validation tracking for multiple fills
public struct ValidationData has copy, drop, store {
    index: u16,
    leaf: vector<u8>,
}

// Global validation registry to prevent secret reuse across all orders/escrows
public struct ValidationRegistry has key {
    id: UID,
    validations: Table<vector<u8>, ValidationData>, // key -> ValidationData
}

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

// Signature data structure to clean up parameters
public struct SignatureData has drop {
    public_key: vector<u8>,
    signature: vector<u8>,
    scheme: u8, // 0=Ed25519, 1=ECDSA-K1, 2=ECDSA-R1
}

// Helper function to create signature data
public fun new_signature_data(
    public_key: vector<u8>,
    signature: vector<u8>,
    scheme: u8,
): SignatureData {
    SignatureData {
        public_key,
        signature,
        scheme,
    }
}

// Merkle proof data structure
public struct MerkleProofData has drop {
    hashlock_info: vector<u8>,
    secret_hash: vector<u8>,
    secret_index: u16,
    proof: vector<vector<u8>>,
}

// Helper function to create merkle proof data
public fun new_merkle_proof_data(
    hashlock_info: vector<u8>,
    secret_hash: vector<u8>,
    secret_index: u16,
    proof: vector<vector<u8>>,
): MerkleProofData {
    MerkleProofData {
        hashlock_info,
        secret_hash,
        secret_index,
        proof,
    }
}

#[allow(lint(coin_field))]
public struct SrcEscrow<phantom T: store> has key {
    id: UID,
    immutables: Immutables<T>,
    deposit: Coin<T>,
    safety_deposit: Coin<SUI>,
}

// Initialize the package - create the global validation registry
fun init(ctx: &mut TxContext) {
    let validation_registry = ValidationRegistry {
        id: object::new(ctx),
        validations: table::new(ctx),
    };

    // Share the validation registry globally
    transfer::share_object(validation_registry);
}

public fun create_new<T: store>(
    merkle_data: MerkleProofData,
    order: &mut Order<T>,
    signature_data: SignatureData,
    safety_deposit: Coin<SUI>,
    immutables: Immutables<T>,
    validation_registry: &mut ValidationRegistry,
    ctx: &mut TxContext,
) {
    let sender = ctx.sender();

    let order_hash = order::get_order_hash(order);

    assert!(order::is_order_active(order), EOrderAlreadyFilled);

    // Generic signature verification using the cleaned up signature data
    let verify = verify_signature(
        signature_data.scheme,
        &signature_data.signature,
        &signature_data.public_key,
        &order_hash,
    );
    assert!(verify, EInvalidSignature);

    let maker = order::get_maker(order);
    let making_amount = order::get_making_amount(order);
    let remaining_making_amount = order::get_remaining_amount(order);
    let is_partial_fill_allowed = order::is_partial_fill_allowed(order);
    let is_multiple_fills_allowed = order::is_multiple_fills_allowed(order);

    let actual_making_amount = immutables::get_deposit_value(&immutables);
    let actual_taking_amount = order::get_taking_amount(order);

    if (actual_making_amount != making_amount) {
        assert!(is_partial_fill_allowed, EPartialFillsNotAllowed);
    };

    let mut hashlock = merkle_data.hashlock_info;

    if (is_multiple_fills_allowed) {
        let calculated_merkle_root = merkle_proof::process_proof(
            merkle_data.secret_index as u64,
            merkle_data.secret_hash,
            merkle_data.proof,
        );

        assert!(
            extract_merkle_root_shortened(&calculated_merkle_root) == extract_merkle_root_shortened(&merkle_data.hashlock_info),
            EInvalidProof,
        );

        let key = merkle_proof::compute_validation_key(
            order_hash,
            merkle_data.hashlock_info,
        );

        let validation_data = ValidationData {
            index: merkle_data.secret_index + 1,
            leaf: merkle_data.secret_hash,
        };

        table::add(&mut validation_registry.validations, key, validation_data);

        let parts_amount = extract_parts_amount(&merkle_data.hashlock_info);
        assert!(parts_amount > 1, EInvalidProof);
        hashlock = validation_data.leaf;
        assert!(
            is_valid_partial_fill(
                actual_making_amount,
                remaining_making_amount,
                making_amount,
                parts_amount as u64,
                validation_data.index as u64,
            ),
            EInvalidProof,
        );
    };

    let mut immutables_modified = immutables;
    immutables::set_hashlock(&mut immutables_modified, hashlock);

    let escrow_deposit = order::split_coins(order, actual_making_amount, ctx);

    let escrow = SrcEscrow<T> {
        id: object::new(ctx),
        immutables: immutables_modified,
        deposit: escrow_deposit,
        safety_deposit,
    };

    let escrow_id = object::uid_to_inner(&escrow.id);

    event::emit(SrcEscrowCreated {
        id: escrow_id,
        order_hash,
        hashlock: hashlock,
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
): Coin<SUI> {
    let current_time = ctx.epoch_timestamp_ms();

    // Check that caller is the taker
    assert!(ctx.sender() == immutables::get_taker(&escrow.immutables), EInvalidTaker);

    // Check timelock: after withdrawal time and before cancellation time
    assert!(current_time >= immutables::get_src_withdrawal_time(&escrow.immutables), EInvalidTime);
    assert!(current_time < immutables::get_src_cancellation_time(&escrow.immutables), EInvalidTime);

    withdraw_to_internal(escrow, secret, target, ctx)
}

public fun public_withdraw<T: store>(
    escrow: &mut SrcEscrow<T>,
    registry: &ResolverRegistry,
    secret: vector<u8>,
    ctx: &mut TxContext,
): Coin<SUI> {
    registry::assert_resolver(registry, ctx.sender().to_id());

    let current_time = ctx.epoch_timestamp_ms();

    // Check timelock: after public withdrawal time and before cancellation time
    assert!(
        current_time >= immutables::get_src_public_withdrawal_time(&escrow.immutables),
        EInvalidTime,
    );
    assert!(current_time < immutables::get_src_cancellation_time(&escrow.immutables), EInvalidTime);

    // Withdraw to the taker's address
    let taker_address = immutables::get_taker(&escrow.immutables);
    withdraw_to_internal(escrow, secret, taker_address, ctx)
}

/// Cancel function for taker during private cancellation period
#[allow(lint(self_transfer))]
public fun cancel<T: store>(escrow: &mut SrcEscrow<T>, ctx: &mut TxContext): Coin<SUI> {
    let current_time = ctx.epoch_timestamp_ms();

    // Check that caller is the taker
    assert!(ctx.sender() == immutables::get_taker(&escrow.immutables), EInvalidTaker);

    // Check timelock: after cancellation time
    assert!(
        current_time >= immutables::get_src_cancellation_time(&escrow.immutables),
        EInvalidTime,
    );

    cancel_internal(escrow, ctx)
}

/// Public cancel function during public cancellation period (anyone can call)
#[allow(lint(self_transfer))]
public fun public_cancel<T: store>(
    escrow: &mut SrcEscrow<T>,
    registry: &ResolverRegistry,
    ctx: &mut TxContext,
): Coin<SUI> {
    registry::assert_resolver(registry, ctx.sender().to_id());

    let current_time = ctx.epoch_timestamp_ms();

    assert!(
        current_time >= immutables::get_src_public_cancellation_time(&escrow.immutables),
        EInvalidTime,
    );

    cancel_internal(escrow, ctx)
}

/// Rescue function - allows recovery of funds after rescue delay period
/// Can be called by anyone after the rescue delay has passed since deployment
public fun rescue<T: store>(ctx: &mut TxContext, escrow: &mut SrcEscrow<T>): Coin<T> {
    assert!(ctx.sender() == immutables::get_taker(&escrow.immutables), EInvalidTaker);

    let current_time = ctx.epoch_timestamp_ms();
    let deployment_time = immutables::get_deployment_time(&escrow.immutables);

    assert!(current_time >= deployment_time + RESCUE_DELAY, ERescueDelayNotMet);

    let deposit_amount = coin::value(&escrow.deposit);
    coin::split(&mut escrow.deposit, deposit_amount, ctx)
}

/// Internal function to handle withdrawal logic
#[allow(lint(self_transfer))]
fun withdraw_to_internal<T: store>(
    escrow: &mut SrcEscrow<T>,
    secret: vector<u8>,
    target: address,
    ctx: &mut TxContext,
): Coin<SUI> {
    let secret_hash = hash::keccak256(&secret);
    assert!(secret_hash == immutables::get_hashlock(&escrow.immutables), EInvalidSecret);

    let deposit_amount = coin::value(&escrow.deposit);
    let deposit = coin::split(&mut escrow.deposit, deposit_amount, ctx);
    transfer::public_transfer(deposit, target);

    let safety_amount = coin::value(&escrow.safety_deposit);
    let safety_deposit = coin::split(&mut escrow.safety_deposit, safety_amount, ctx);

    event::emit(EscrowWithdrawal {
        secret,
        escrow_id: object::uid_to_inner(&escrow.id),
    });

    safety_deposit
}

/// Internal function to handle cancellation logic
fun cancel_internal<T: store>(escrow: &mut SrcEscrow<T>, ctx: &mut TxContext): Coin<SUI> {
    let maker_address = immutables::get_maker(&escrow.immutables);

    let deposit_amount = coin::value(&escrow.deposit);
    let deposit = coin::split(&mut escrow.deposit, deposit_amount, ctx);
    transfer::public_transfer(deposit, maker_address);

    let safety_amount = coin::value(&escrow.safety_deposit);
    let safety_deposit = coin::split(&mut escrow.safety_deposit, safety_amount, ctx);

    event::emit(EscrowCancelled {
        escrow_id: object::uid_to_inner(&escrow.id),
    });

    safety_deposit
}

/// Generic signature verification function supporting multiple schemes
fun verify_signature(
    scheme: u8,
    signature: &vector<u8>,
    public_key: &vector<u8>,
    message: &vector<u8>,
): bool {
    if (scheme == SIGNATURE_SCHEME_ED25519) {
        ed25519::ed25519_verify(signature, public_key, message)
    } else if (scheme == SIGNATURE_SCHEME_ECDSA_K1) {
        ecdsa_k1::secp256k1_verify(signature, public_key, message, 1) // 1 = Keccak256 hash
    } else if (scheme == SIGNATURE_SCHEME_ECDSA_R1) {
        ecdsa_r1::secp256r1_verify(signature, public_key, message, 1) // 1 = SHA256 hash
    } else {
        abort EUnsupportedSignatureScheme
    }
}

fun is_valid_partial_fill(
    making_amount: u64,
    remaining_making_amount: u64,
    order_making_amount: u64,
    parts_amount: u64,
    validated_index: u64,
): bool {
    let calculated_index =
        (order_making_amount - remaining_making_amount + making_amount - 1) * parts_amount / order_making_amount;

    if (remaining_making_amount == making_amount) {
        return calculated_index + 2 == validated_index
    } else if (order_making_amount != remaining_making_amount) {
        let prev_calculated_index =
            (order_making_amount - remaining_making_amount - 1) * parts_amount / order_making_amount;
        if (calculated_index == prev_calculated_index) {
            return false
        }
    };

    return calculated_index + 1 == validated_index
}

// Extract parts_amount (first 16 bits) using bit shift - just like Solidity!
fun extract_parts_amount(hashlock_info: &vector<u8>): u16 {
    // Extract first 2 bytes and convert to u16 (big-endian)
    let byte1 = *vector::borrow(hashlock_info, 0) as u16;
    let byte2 = *vector::borrow(hashlock_info, 1) as u16;

    (byte1 << 8) | byte2
}

// Extract merkle_root_shortened as vector<u8> (30 bytes)
fun extract_merkle_root_shortened(hashlock_info: &vector<u8>): vector<u8> {
    assert!(vector::length(hashlock_info) == 32, EInvalidProof);

    let mut merkle_root = vector::empty<u8>();
    let mut i = 2; // Start from byte 2 (skip first 16 bits)

    while (i < 32) {
        vector::push_back(&mut merkle_root, *vector::borrow(hashlock_info, i));
        i = i + 1;
    };

    merkle_root
}
