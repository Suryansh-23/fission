module fusion_plus::order;

use sui::coin::{Self, Coin};
use sui::event;
use sui::hash;
use sui::table::{Self, Table};

// Errors
const EInvalidMakingAmount: u64 = 0;
const EUnauthorizedAccess: u64 = 1;

// Order structure that holds maker's funds
#[allow(lint(coin_field))]
public struct Order<phantom T: store> has key {
    id: UID,
    maker: address,
    order_hash: vector<u8>,
    making_amount: u64,
    taking_amount: u64,
    maker_asset: vector<u8>,
    taker_asset: vector<u8>,
    salt: vector<u8>,
    is_partial_fill_allowed: bool,
    is_multiple_fills_allowed: bool,
    remaining_coins: Coin<T>,
    filled_amount: u64,
    merkle_root: Option<vector<u8>>, // For multiple fills
}

// Validation tracking for multiple fills
public struct ValidationData has store, copy, drop {
    last_index: u64,
    secret_hash: vector<u8>,
}

// Global validation storage
public struct ValidationRegistry has key {
    id: UID,
    validations: Table<vector<u8>, ValidationData>, // key -> ValidationData
}

// Events
public struct OrderCreated has copy, drop {
    id: ID,
    maker: address,
    order_hash: vector<u8>,
    making_amount: u64,
    taking_amount: u64,
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

// Function to create order object (maker calls this to deposit coins)
public fun create_order<T: store>(
    making_amount: u64,
    taking_amount: u64,
    maker_asset: vector<u8>,
    taker_asset: vector<u8>,
    salt: vector<u8>,
    is_partial_fill_allowed: bool,
    is_multiple_fills_allowed: bool,
    merkle_root: Option<vector<u8>>,
    deposit: Coin<T>,
    ctx: &mut TxContext,
) {
    // Verify sufficient deposit
    assert!(coin::value(&deposit) == making_amount, EInvalidMakingAmount);
    
    // Compute order hash (simplified - in practice would include all order fields)
    let mut order_data = vector::empty<u8>();
    vector::append(&mut order_data, sui::address::to_bytes(ctx.sender()));
    vector::append(&mut order_data, sui::bcs::to_bytes(&making_amount));
    vector::append(&mut order_data, sui::bcs::to_bytes(&taking_amount));
    vector::append(&mut order_data, salt);
    let order_hash = hash::keccak256(&order_data);
    
    let order = Order<T> {
        id: object::new(ctx),
        maker: ctx.sender(),
        order_hash,
        making_amount,
        taking_amount,
        maker_asset,
        taker_asset,
        salt,
        is_partial_fill_allowed,
        is_multiple_fills_allowed,
        remaining_coins: deposit,
        filled_amount: 0,
        merkle_root,
    };
    
    event::emit(OrderCreated {
        id: object::uid_to_inner(&order.id),
        maker: ctx.sender(),
        order_hash,
        making_amount,
        taking_amount,
    });

    transfer::share_object(order);
}

// Getter functions for order fields
public fun get_maker<T: store>(order: &Order<T>): address {
    order.maker
}

public fun get_order_hash<T: store>(order: &Order<T>): vector<u8> {
    order.order_hash
}

public fun get_making_amount<T: store>(order: &Order<T>): u64 {
    order.making_amount
}

public fun get_taking_amount<T: store>(order: &Order<T>): u64 {
    order.taking_amount
}

public fun get_remaining_amount<T: store>(order: &Order<T>): u64 {
    coin::value(&order.remaining_coins)
}

public fun get_filled_amount<T: store>(order: &Order<T>): u64 {
    order.filled_amount
}

public fun is_partial_fill_allowed<T: store>(order: &Order<T>): bool {
    order.is_partial_fill_allowed
}

public fun is_multiple_fills_allowed<T: store>(order: &Order<T>): bool {
    order.is_multiple_fills_allowed
}

public fun get_merkle_root<T: store>(order: &Order<T>): Option<vector<u8>> {
    order.merkle_root
}

// Function to split coins from order for escrow (package-only access)
public(package) fun split_coins<T: store>(
    order: &mut Order<T>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<T> {
    // Check if order still has remaining coins
    assert!(coin::value(&order.remaining_coins) > 0, EUnauthorizedAccess);
    assert!(coin::value(&order.remaining_coins) >= amount, EInvalidMakingAmount);
    
    order.filled_amount = order.filled_amount + amount;
        
    coin::split(&mut order.remaining_coins, amount, ctx)
}

// Validation functions for merkle proofs
public fun add_validation(
    registry: &mut ValidationRegistry,
    key: vector<u8>,
    validation_data: ValidationData,
) {
    if (table::contains(&registry.validations, key)) {
        *table::borrow_mut(&mut registry.validations, key) = validation_data;
    } else {
        table::add(&mut registry.validations, key, validation_data);
    }
}

public fun get_validation(
    registry: &ValidationRegistry,
    key: &vector<u8>,
): Option<ValidationData> {
    if (table::contains(&registry.validations, *key)) {
        option::some(*table::borrow(&registry.validations, *key))
    } else {
        option::none()
    }
}

public fun has_validation(
    registry: &ValidationRegistry,
    key: &vector<u8>,
): bool {
    table::contains(&registry.validations, *key)
}

// Helper function to create validation data
public fun create_validation_data(
    last_index: u64,
    secret_hash: vector<u8>,
): ValidationData {
    ValidationData {
        last_index,
        secret_hash,
    }
}

// Getter functions for validation data
public fun get_last_index(validation: &ValidationData): u64 {
    validation.last_index
}

public fun get_secret_hash(validation: &ValidationData): vector<u8> {
    validation.secret_hash
}

// Simple order status check - order is active if it has remaining coins
public fun is_order_active<T: store>(order: &Order<T>): bool {
    coin::value(&order.remaining_coins) > 0
}

/// Function for maker to withdraw all remaining tokens from their order
public fun withdraw<T: store>(
    order: &mut Order<T>, 
    ctx: &mut TxContext,
) : Coin<T> {
    // Only the maker can withdraw their own tokens
    assert!(ctx.sender() == order.maker, EUnauthorizedAccess);
    
    // Get all remaining coins
    let remaining_amount = coin::value(&order.remaining_coins);
    assert!(remaining_amount > 0, EInvalidMakingAmount);
    
    // Extract all remaining coins
    coin::split(&mut order.remaining_coins, remaining_amount, ctx)
}
