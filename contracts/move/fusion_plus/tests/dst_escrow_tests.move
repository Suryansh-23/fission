#[test_only]
module fusion_plus::dst_escrow_tests;

use fusion_plus::dst_escrow::{Self, DstEscrow};
use fusion_plus::immutables::{Self, Immutables};
use fusion_plus::order::{Self, Order};
use std::type_name;
use sui::clock;
use sui::coin::{Self, Coin};
use sui::hash;
use sui::sui::SUI;
use sui::test_scenario::{Self as test, next_tx, ctx};
use sui::address;

// Mock coin types for testing
public struct USDC has drop, store {}
public struct WBTC has drop, store {}

// Helper function to create a test order
fun create_test_order<T: store>(
    receiver: vector<u8>,
    making_amount: u64,
    taking_amount: u64,
    deposit: Coin<T>,
    ctx: &mut TxContext,
) {
    order::create_order<T>(
        receiver, // receiver address
        making_amount, // making amount
        taking_amount, // taking amount
        @0x1, // maker_asset (USDC address)
        @0x2, // taker_asset (WBTC address)
        b"test_order_salt", // salt
        true, // is_partial_fill_allowed
        false, // is_multiple_fills_allowed
        deposit, // coin deposit
        1000, // start_time
        3600, // duration (1 hour)
        100, // initial_rate_bump
        vector::empty<u8>(), // points_and_time_deltas
        ctx,
    );
}

// Helper function to create test immutables with millisecond timestamps
fun create_test_immutables(
    maker: address,
    taker: address,
    hashlock: vector<u8>,
    deposit_amount: u64,
    safety_deposit_amount: u64,
): Immutables {
    let order_hash = b"test_order_hash";
    let asset_id = type_name::get_address(&type_name::get<USDC>());

    // Create dst timelocks with realistic values in milliseconds
    let current_time = 1000000; // Start at 1000 seconds (1000000 ms)
    let timelocks = immutables::new_dst_timelocks(
        current_time, // deployment
        current_time + 3600000, // withdrawal (1 hour later in ms)
        current_time + 7200000, // public_withdrawal (2 hours later in ms)
        current_time + 14400000, // cancellation (4 hours later in ms)
    );

    immutables::new(
        order_hash,
        hashlock,
        maker,
        taker,
        asset_id,
        deposit_amount,
        safety_deposit_amount,
        timelocks,
    )
}

#[test]
fun test_dst_escrow_creation_with_order() {
    let admin = @0xA;
    let maker = @0xB;
    let taker = @0xC;

    let mut scenario = test::begin(admin);

    // Step 1: Maker creates an order first
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);

        // Create coins for maker to deposit in order
        let usdc_coin_for_order = coin::mint_for_testing<USDC>(2000_00000000, ctx); // 2000 USDC for order
        transfer::public_transfer(usdc_coin_for_order, maker);

        // Create coins for taker to use in dst escrow
        let usdc_coin = coin::mint_for_testing<USDC>(1000_00000000, ctx); // 1000 USDC
        let sui_coin = coin::mint_for_testing<SUI>(100_000000000, ctx); // 100 SUI
        transfer::public_transfer(usdc_coin, taker);
        transfer::public_transfer(sui_coin, taker);
    };

    // Step 2: Maker creates the order
    next_tx(&mut scenario, maker);
    {
        let usdc_coin_for_order = test::take_from_sender<Coin<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);

        create_test_order<USDC>(
            address::to_bytes(maker),
            2000_00000000, // making amount
            200000000, // taking amount (2 WBTC)
            usdc_coin_for_order,
            ctx,
        );
    };

    // Step 3: Taker creates dst escrow
    next_tx(&mut scenario, taker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let sui_coin = test::take_from_sender<Coin<SUI>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        // Create test secret and hashlock
        let secret = b"test_secret_123";
        let hashlock = hash::keccak256(&secret);

        let immutables = create_test_immutables(
            maker,
            taker,
            hashlock,
            1000_00000000, // USDC amount
            100_000000000, // SUI safety deposit
        );

        // Create dst escrow
        dst_escrow::create_new<USDC>(
            &clock,
            immutables,
            1000000 + 14400000, // src_cancellation_timestamp (in ms)
            usdc_coin,
            sui_coin,
            ctx,
        );
        
        clock::destroy_for_testing(clock);
    };

    // Step 4: Verify both order and escrow were created
    next_tx(&mut scenario, admin);
    {
        // Check that order exists
        let order = test::take_shared<Order<USDC>>(&scenario);
        assert!(order::get_maker(&order) == maker, 0);
        assert!(order::get_making_amount(&order) == 2000_00000000, 1);
        test::return_shared(order);

        // Check that dst escrow exists
        let escrow = test::take_shared<DstEscrow<USDC>>(&scenario);
        test::return_shared(escrow);
    };

    test::end(scenario);
}

#[test]
fun test_dst_escrow_withdraw_with_order() {
    let admin = @0xA;
    let maker = @0xB;
    let taker = @0xC;

    let mut scenario = test::begin(admin);

    // Setup: Create order first, then dst escrow
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);

        // Coins for maker's order
        let usdc_for_order = coin::mint_for_testing<USDC>(1500_00000000, ctx);
        transfer::public_transfer(usdc_for_order, maker);

        // Coins for taker's dst escrow
        let usdc_coin = coin::mint_for_testing<USDC>(1000_00000000, ctx);
        let sui_coin = coin::mint_for_testing<SUI>(100_000000000, ctx);
        transfer::public_transfer(usdc_coin, taker);
        transfer::public_transfer(sui_coin, taker);
    };

    // Maker creates order
    next_tx(&mut scenario, maker);
    {
        let usdc_for_order = test::take_from_sender<Coin<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);

        create_test_order<USDC>(
            address::to_bytes(maker),
            1500_00000000, // making 1500 USDC
            150000000, // taking 1.5 WBTC
            usdc_for_order,
            ctx,
        );
    };

    let secret = b"withdrawal_secret";
    let hashlock = hash::keccak256(&secret);

    // Taker creates dst escrow
    next_tx(&mut scenario, taker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let sui_coin = test::take_from_sender<Coin<SUI>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        let immutables = create_test_immutables(
            maker,
            taker,
            hashlock,
            1000_00000000,
            100_000000000,
        );

        dst_escrow::create_new<USDC>(
            &clock,
            immutables,
            1000000 + 14400000, // src_cancellation_timestamp (in ms)
            usdc_coin,
            sui_coin,
            ctx,
        );
        
        clock::destroy_for_testing(clock);
    };

    // Taker withdraws from dst escrow with correct secret
    next_tx(&mut scenario, taker);
    {
        let mut escrow = test::take_shared<DstEscrow<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);
        let mut clock = clock::create_for_testing(ctx);
        
        // Advance time to after withdrawal time (1 hour + 1 minute)
        clock::set_for_testing(&mut clock, 1000000 + 3600000 + 60000);

        // Withdraw with correct secret
        let safety_deposit = dst_escrow::withdraw(&clock, &mut escrow, secret, ctx);

        // Verify withdrawal
        assert!(coin::value(&safety_deposit) == 100_000000000, 0);

        // Clean up
        coin::burn_for_testing(safety_deposit);
        test::return_shared(escrow);
        clock::destroy_for_testing(clock);
    };

    // Verify order still exists and is accessible
    next_tx(&mut scenario, admin);
    {
        let order = test::take_shared<Order<USDC>>(&scenario);

        // Order should still have funds
        assert!(order::get_remaining_amount(&order) == 1500_00000000, 1);
        assert!(order::is_order_active(&order) == true, 2);

        test::return_shared(order);
    };

    test::end(scenario);
}

#[test]
fun test_dst_escrow_public_withdraw() {
    let admin = @0xA;
    let maker = @0xB;
    let taker = @0xC;
    let public_user = @0xD;

    let mut scenario = test::begin(admin);

    // Setup escrow
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(500_00000000, ctx);
        let sui_coin = coin::mint_for_testing<SUI>(50_000000000, ctx);
        transfer::public_transfer(usdc_coin, taker);
        transfer::public_transfer(sui_coin, taker);
    };

    let secret = b"public_secret";
    let hashlock = hash::keccak256(&secret);

    next_tx(&mut scenario, taker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let sui_coin = test::take_from_sender<Coin<SUI>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        let immutables = create_test_immutables(
            maker,
            taker,
            hashlock,
            500_00000000,
            50_000000000,
        );

        dst_escrow::create_new<USDC>(
            &clock,
            immutables,
            1000000 + 14400000, // src_cancellation_timestamp (in ms)
            usdc_coin,
            sui_coin,
            ctx,
        );
        
        clock::destroy_for_testing(clock);
    };

    // Public withdrawal during public period
    next_tx(&mut scenario, public_user);
    {
        let mut escrow = test::take_shared<DstEscrow<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);
        let mut clock = clock::create_for_testing(ctx);
        
        // Advance time to after public withdrawal time (2 hours + 1 minute)
        clock::set_for_testing(&mut clock, 1000000 + 7200000 + 60000);

        // Anyone can withdraw during public period
        let safety_deposit = dst_escrow::public_withdraw(&clock, &mut escrow, secret, ctx);

        assert!(coin::value(&safety_deposit) == 50_000000000, 0);

        coin::burn_for_testing(safety_deposit);
        test::return_shared(escrow);
        clock::destroy_for_testing(clock);
    };

    test::end(scenario);
}

#[test]
fun test_dst_escrow_cancel() {
    let admin = @0xA;
    let maker = @0xB;
    let taker = @0xC;

    let mut scenario = test::begin(admin);

    // Setup escrow
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(750_00000000, ctx);
        let sui_coin = coin::mint_for_testing<SUI>(75_000000000, ctx);
        transfer::public_transfer(usdc_coin, taker);
        transfer::public_transfer(sui_coin, taker);
    };

    let secret = b"cancel_secret";
    let hashlock = hash::keccak256(&secret);

    next_tx(&mut scenario, taker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let sui_coin = test::take_from_sender<Coin<SUI>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        let immutables = create_test_immutables(
            maker,
            taker,
            hashlock,
            750_00000000,
            75_000000000,
        );

        dst_escrow::create_new<USDC>(
            &clock,
            immutables,
            1000000 + 14400000, // src_cancellation_timestamp (in ms)
            usdc_coin,
            sui_coin,
            ctx,
        );
        
        clock::destroy_for_testing(clock);
    };

    // Cancel after cancellation time
    next_tx(&mut scenario, taker);
    {
        let mut escrow = test::take_shared<DstEscrow<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);
        let mut clock = clock::create_for_testing(ctx);
        
        // Advance time to after cancellation time (4 hours + 1 minute)
        clock::set_for_testing(&mut clock, 1000000 + 14400000 + 60000);

        // Taker can cancel and get safety deposit back
        let safety_deposit = dst_escrow::cancel(&clock, &mut escrow, ctx);

        assert!(coin::value(&safety_deposit) == 75_000000000, 0);

        coin::burn_for_testing(safety_deposit);
        test::return_shared(escrow);
        clock::destroy_for_testing(clock);
    };

    test::end(scenario);
}

#[test]
#[expected_failure(abort_code = fusion_plus::dst_escrow::EInvalidSecret)]
fun test_dst_escrow_withdraw_wrong_secret() {
    let admin = @0xA;
    let maker = @0xB;
    let taker = @0xC;

    let mut scenario = test::begin(admin);

    // Setup escrow
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(500_00000000, ctx);
        let sui_coin = coin::mint_for_testing<SUI>(50_000000000, ctx);
        transfer::public_transfer(usdc_coin, taker);
        transfer::public_transfer(sui_coin, taker);
    };

    let secret = b"correct_secret";
    let wrong_secret = b"wrong_secret";
    let hashlock = hash::keccak256(&secret);

    next_tx(&mut scenario, taker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let sui_coin = test::take_from_sender<Coin<SUI>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        let immutables = create_test_immutables(
            maker,
            taker,
            hashlock,
            500_00000000,
            50_000000000,
        );

        dst_escrow::create_new<USDC>(
            &clock,
            immutables,
            1000000 + 14400000, // src_cancellation_timestamp (in ms)
            usdc_coin,
            sui_coin,
            ctx,
        );
        
        clock::destroy_for_testing(clock);
    };

    // Try to withdraw with wrong secret (should fail)
    next_tx(&mut scenario, taker);
    {
        let mut escrow = test::take_shared<DstEscrow<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);
        let mut clock = clock::create_for_testing(ctx);
        
        // Advance time to after withdrawal time (1 hour + 1 minute)
        clock::set_for_testing(&mut clock, 1000000 + 3600000 + 60000);

        // This should abort with EInvalidSecret
        let safety_deposit = dst_escrow::withdraw(&clock, &mut escrow, wrong_secret, ctx);

        coin::burn_for_testing(safety_deposit);
        test::return_shared(escrow);
        clock::destroy_for_testing(clock);
    };

    test::end(scenario);
}

#[test]
#[expected_failure(abort_code = fusion_plus::dst_escrow::ENotTaker)]
fun test_dst_escrow_withdraw_wrong_caller() {
    let admin = @0xA;
    let maker = @0xB;
    let taker = @0xC;
    let wrong_caller = @0xD;

    let mut scenario = test::begin(admin);

    // Setup escrow
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(300_00000000, ctx);
        let sui_coin = coin::mint_for_testing<SUI>(30_000000000, ctx);
        transfer::public_transfer(usdc_coin, taker);
        transfer::public_transfer(sui_coin, taker);
    };

    let secret = b"caller_test_secret";
    let hashlock = hash::keccak256(&secret);

    next_tx(&mut scenario, taker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let sui_coin = test::take_from_sender<Coin<SUI>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        let immutables = create_test_immutables(
            maker,
            taker,
            hashlock,
            300_00000000,
            30_000000000,
        );

        dst_escrow::create_new<USDC>(
            &clock,
            immutables,
            1000000 + 14400000, // src_cancellation_timestamp (in ms)
            usdc_coin,
            sui_coin,
            ctx,
        );
        
        clock::destroy_for_testing(clock);
    };

    // Try to withdraw with wrong caller (should fail)
    next_tx(&mut scenario, wrong_caller);
    {
        let mut escrow = test::take_shared<DstEscrow<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        // This should abort with ENotTaker
        let safety_deposit = dst_escrow::withdraw(&clock, &mut escrow, secret, ctx);

        coin::burn_for_testing(safety_deposit);
        test::return_shared(escrow);
        clock::destroy_for_testing(clock);
    };

    test::end(scenario);
}

#[test]
#[expected_failure(abort_code = fusion_plus::dst_escrow::EInvalidTime)]
fun test_dst_escrow_withdraw_too_early() {
    let admin = @0xA;
    let maker = @0xB;
    let taker = @0xC;

    let mut scenario = test::begin(admin);

    // Setup escrow
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(200_00000000, ctx);
        let sui_coin = coin::mint_for_testing<SUI>(20_000000000, ctx);
        transfer::public_transfer(usdc_coin, taker);
        transfer::public_transfer(sui_coin, taker);
    };

    let secret = b"timing_test_secret";
    let hashlock = hash::keccak256(&secret);

    next_tx(&mut scenario, taker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let sui_coin = test::take_from_sender<Coin<SUI>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        let immutables = create_test_immutables(
            maker,
            taker,
            hashlock,
            200_00000000,
            20_000000000,
        );

        dst_escrow::create_new<USDC>(
            &clock,
            immutables,
            1000000 + 14400000, // src_cancellation_timestamp (in ms)
            usdc_coin,
            sui_coin,
            ctx,
        );
        
        clock::destroy_for_testing(clock);
    };

    // Try to withdraw too early (should fail)
    next_tx(&mut scenario, taker);
    {
        // Don't advance time - still before withdrawal time
        let mut escrow = test::take_shared<DstEscrow<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        // This should abort with EInvalidTime
        let safety_deposit = dst_escrow::withdraw(&clock, &mut escrow, secret, ctx);

        coin::burn_for_testing(safety_deposit);
        test::return_shared(escrow);
        clock::destroy_for_testing(clock);
    };

    test::end(scenario);
}

#[test]
fun test_dst_escrow_withdraw_with_time_advancement() {
    let admin = @0xA;
    let maker = @0xB;
    let taker = @0xC;

    let mut scenario = test::begin(admin);

    // Setup escrow
    next_tx(&mut scenario, admin);
    {
        let ctx = ctx(&mut scenario);
        let usdc_coin = coin::mint_for_testing<USDC>(400_00000000, ctx);
        let sui_coin = coin::mint_for_testing<SUI>(40_000000000, ctx);
        transfer::public_transfer(usdc_coin, taker);
        transfer::public_transfer(sui_coin, taker);
    };

    let secret = b"time_advancement_secret";
    let hashlock = hash::keccak256(&secret);

    // Create escrow with current time
    next_tx(&mut scenario, taker);
    {
        let usdc_coin = test::take_from_sender<Coin<USDC>>(&scenario);
        let sui_coin = test::take_from_sender<Coin<SUI>>(&scenario);
        let ctx = ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);

        let immutables = create_test_immutables(
            maker,
            taker,
            hashlock,
            400_00000000,
            40_000000000,
        );

        dst_escrow::create_new<USDC>(
            &clock,
            immutables,
            1000000 + 14400000, // src_cancellation_timestamp (in ms)
            usdc_coin,
            sui_coin,
            ctx,
        );
        
        clock::destroy_for_testing(clock);
    };

    // Advance time to withdrawal period and withdraw successfully
    next_tx(&mut scenario, taker);
    {
        let mut escrow = test::take_shared<DstEscrow<USDC>>(&scenario);
        let ctx = ctx(&mut scenario);
        let mut clock = clock::create_for_testing(ctx);
        
        // Advance time to after withdrawal time (1 hour + 1 minute)
        clock::set_for_testing(&mut clock, 1000000 + 3600000 + 60000); 

        // Now withdrawal should succeed
        let safety_deposit = dst_escrow::withdraw(&clock, &mut escrow, secret, ctx);

        assert!(coin::value(&safety_deposit) == 40_000000000, 0);

        coin::burn_for_testing(safety_deposit);
        test::return_shared(escrow);
        clock::destroy_for_testing(clock);
    };

    test::end(scenario);
}
