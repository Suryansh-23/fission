#[test_only]
module fusion_plus::order_tests;

use fusion_plus::order::{Self, Order};
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self as test, next_tx, ctx};
use sui::address;

// Mock coin types for testing - need store ability for Order<T>
// These are One Time Witness types
public struct USDC has drop, store {}
public struct WBTC has drop, store {}

const MAKER_ASSET: address = @0x05; // Mock asset address for USDC
const TAKER_ASSET: address = @0x06; // Mock asset address for WBTC

#[test]
fun test_order_creation() {
    let admin = @0xA;
    let maker = @0xB;

    let mut scenario = test::begin(admin);

    // Create test coins - Mock 1000 USDC for maker
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);

        // Create USDC coins directly using test utilities
        let usdc_coin = coin::mint_for_testing<USDC>(1000_000000, ctx); // 1000 USDC
        transfer::public_transfer(usdc_coin, maker);
    };

    // Maker creates an order
    next_tx(&mut scenario, maker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);

        // Order parameters
        let receiver = @0x0; // Zero address means maker receives
        let making_amount = 1000_000000; // 1000 USDC (6 decimals)
        let taking_amount = 100000000; // 1 WBTC (8 decimals)
        let salt = b"test_salt_123"; // Unique salt for order
        let is_partial_fill_allowed = true;
        let is_multiple_fills_allowed = false;

        // Auction parameters
        let start_time = 1000; // timestamp
        let duration = 3600; // 1 hour
        let initial_rate_bump = 100; // 1% initial bump
        let points_and_time_deltas = vector::empty<u8>();

        // Create the order
        order::create_order<USDC>(
            address::to_bytes(receiver),
            making_amount,
            taking_amount,
            MAKER_ASSET,
            TAKER_ASSET,
            salt,
            is_partial_fill_allowed,
            is_multiple_fills_allowed,
            usdc_coin,
            start_time,
            duration,
            initial_rate_bump,
            points_and_time_deltas,
            ctx,
        );
    };

    // Verify the order was created correctly
    next_tx(&mut scenario, admin);
    {
        // Get the shared order object
        let order = test::take_shared<Order<USDC>>(&scenario);

        // Verify order properties
        assert!(order::get_maker(&order) == maker, 0);
        assert!(order::get_receiver(&order) == address::to_bytes(@0x0));
        assert!(order::get_making_amount(&order) == 1000_000000, 2);
        assert!(order::get_taking_amount(&order) == 100000000, 3);
        assert!(order::get_remaining_amount(&order) == 1000_000000, 4);
        assert!(order::get_filled_amount(&order) == 0, 5);
        assert!(order::is_partial_fill_allowed(&order) == true, 6);
        assert!(order::is_multiple_fills_allowed(&order) == false, 7);
        assert!(order::is_order_active(&order) == true, 8);

        // Return the order
        test::return_shared(order);
    };

    test::end(scenario);
}

#[test]
fun test_order_creation_with_receiver() {
    let admin = @0xA;
    let maker = @0xB;
    let receiver = @0xC;

    let mut scenario = test::begin(admin);

    // Setup coins
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(500_00000000, ctx); // 500 USDC
        transfer::public_transfer(usdc_coin, maker);
    };

    // Create order with specific receiver
    next_tx(&mut scenario, maker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);

        order::create_order<USDC>(
            address::to_bytes(receiver), // Specific receiver address
            500_00000000, // 500 USDC
            50000000, // 0.5 WBTC
            MAKER_ASSET,
            TAKER_ASSET,
            b"salt_123",
            false, // No partial fills
            false, // No multiple fills
            usdc_coin,
            2000, // start time
            7200, // 2 hours duration
            200, // 2% initial bump
            vector::empty<u8>(),
            ctx,
        );
    };

    // Verify receiver is set correctly
    next_tx(&mut scenario, admin);
    {
        let order = test::take_shared<Order<USDC>>(&scenario);

        assert!(order::get_receiver(&order) == address::to_bytes(receiver), 0);
        assert!(order::get_making_amount(&order) == 500_00000000, 1);
        assert!(order::is_partial_fill_allowed(&order) == false, 2);

        test::return_shared(order);
    };

    test::end(scenario);
}

#[test]
#[expected_failure(abort_code = fusion_plus::order::EInvalidMakingAmount)]
fun test_order_creation_invalid_amount() {
    let admin = @0xA;
    let maker = @0xB;

    let mut scenario = test::begin(admin);

    // Setup coins
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(1000_00000000, ctx); // 1000 USDC
        transfer::public_transfer(usdc_coin, maker);
    };

    // Try to create order with mismatched amount (should fail)
    next_tx(&mut scenario, maker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);

        // This should fail because coin has 1000 USDC but we specify 2000 as making_amount
        order::create_order<USDC>(
            address::to_bytes(@0x0),
            2000_00000000, // Wrong amount - coin only has 1000 USDC
            200000000, // 2 WBTC
            MAKER_ASSET,
            TAKER_ASSET,
            b"fail_test_salt",
            true,
            false,
            usdc_coin,
            1000,
            3600,
            100,
            vector::empty<u8>(),
            ctx,
        );
    };

    test::end(scenario);
}

#[test]
fun test_multiple_fills_allowed() {
    let admin = @0xA;
    let maker = @0xB;

    let mut scenario = test::begin(admin);

    // Setup coins
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(2000_00000000, ctx); // 2000 USDC
        transfer::public_transfer(usdc_coin, maker);
    };

    // Create order with multiple fills allowed
    next_tx(&mut scenario, maker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);

        order::create_order<USDC>(
            address::to_bytes(@0x0),
            2000_00000000, // 2000 USDC
            200000000, // 2 WBTC
            MAKER_ASSET,
            TAKER_ASSET,
            b"multi_fill_salt", // Unique salt
            true, // Partial fills allowed
            true, // Multiple fills allowed
            usdc_coin,
            1500,
            7200,
            150,
            vector::empty<u8>(),
            ctx,
        );
    };

    // Verify multiple fills settings
    next_tx(&mut scenario, admin);
    {
        let order = test::take_shared<Order<USDC>>(&scenario);

        assert!(order::is_partial_fill_allowed(&order) == true, 0);
        assert!(order::is_multiple_fills_allowed(&order) == true, 1);
        assert!(order::get_making_amount(&order) == 2000_00000000, 2);

        test::return_shared(order);
    };

    test::end(scenario);
}
