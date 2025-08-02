module fusion_plus::order;

use fusion_plus::auction_calculator::{Self, AuctionDetails};
use sui::coin::{Self, Coin};
use sui::event;
use sui::hash;
use sui::address;

// Errors
const EInvalidMakingAmount: u64 = 0;
const EUnauthorizedAccess: u64 = 1;

// Order structure that holds maker's funds
#[allow(lint(coin_field))]
public struct Order<phantom T: store> has key {
    id: UID,
    maker: address,
    receiver: vector<u8>,
    order_hash: vector<u8>,
    making_amount: u64,
    taking_amount: u64,
    maker_asset: address,
    taker_asset: address,
    salt: vector<u8>,
    is_partial_fill_allowed: bool,
    is_multiple_fills_allowed: bool,
    remaining_coins: Coin<T>,
    filled_amount: u64,
    auction_details: AuctionDetails,
}

public struct OrderHashData has copy, drop {
    salt: vector<u8>,
    maker: vector<u8>,
    receiver: vector<u8>,
    making_amount: u64,
    taking_amount: u64,
}

// Events
public struct OrderCreated has copy, drop {
    id: ID,
    maker: address,
    order_hash: vector<u8>,
    making_amount: u64,
    taking_amount: u64,
}

// Initialize the package
fun init(_ctx: &mut TxContext) {}

// Function to create order object (maker calls this to deposit coins)
public entry fun create_order<T: store>(
    receiver: vector<u8>, // this will be an EVM address (20 bytes)
    making_amount: u64,
    taking_amount: u64,
    maker_asset: address,
    taker_asset: address,
    salt: vector<u8>,
    is_partial_fill_allowed: bool,
    is_multiple_fills_allowed: bool,
    deposit: Coin<T>,
    start_time: u64,
    duration: u64,
    initial_rate_bump: u64,
    points_and_time_deltas: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(coin::value(&deposit) == making_amount, EInvalidMakingAmount);

    let data = OrderHashData {
        salt,
        maker: address::to_bytes(ctx.sender()),
        receiver,
        making_amount,
        taking_amount,
    };

    let order_hash = hash::keccak256(&sui::bcs::to_bytes(&data));

    let auction_details = auction_calculator::new(
        start_time,
        duration,
        initial_rate_bump,
        points_and_time_deltas,
    );

    let order = Order<T> {
        id: object::new(ctx),
        maker: ctx.sender(),
        receiver,
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
        auction_details,
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

// Function to split coins from order for escrow (package-only access)
public(package) fun split_coins<T: store>(
    order: &mut Order<T>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(coin::value(&order.remaining_coins) >= amount, EInvalidMakingAmount);

    order.filled_amount = order.filled_amount + amount;

    coin::split(&mut order.remaining_coins, amount, ctx)
}

/// Function for maker to withdraw all remaining tokens from their order
public fun withdraw<T: store>(order: &mut Order<T>, ctx: &mut TxContext): Coin<T> {
    assert!(ctx.sender() == order.maker, EUnauthorizedAccess);

    let remaining_amount = coin::value(&order.remaining_coins);
    assert!(remaining_amount > 0, EInvalidMakingAmount);

    coin::split(&mut order.remaining_coins, remaining_amount, ctx)
}

// Getter functions for order fields
public fun get_maker<T: store>(order: &Order<T>): address {
    order.maker
}

public fun get_receiver<T: store>(order: &Order<T>): vector<u8> {
    order.receiver
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

public fun is_order_active<T: store>(order: &Order<T>): bool {
    coin::value(&order.remaining_coins) > 0
}

public fun get_auction_details<T: store>(order: &Order<T>): AuctionDetails {
    order.auction_details
}
