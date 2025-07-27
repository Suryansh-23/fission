module fusion_plus::registry;

use fusion_plus::capabilities::AdminCap;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;
use sui::table;

public struct ResolverRegistry has key {
    id: UID,
    min_threshold: u64,
    safety_deposits: table::Table<ID, Coin<SUI>>,
}

public enum ResolverRegistryAction has copy, drop {
    Create, // amount is None
    Config, // amount is Some(new threshold)
    Add, // amount is Some(resolver's initial deposit)
    Remove, // amount is Some(resolver's balance)
    Deposit, // amount is Some(deposited amount)
    Withdraw, // amount is Some(withdrawn amount)
}

public struct ResolverRegistryEvent has copy, drop {
    id: ID,
    action: ResolverRegistryAction,
    amount: Option<u64>,
}

// MIN_THRESHOLD = 0.1 SUI
const MIN_THRESHOLD: u64 = 100_000_000;

#[error]
const EAlreadyRegistered: vector<u8> = b"Resolver already registered";
#[error]
const EInsufficientDeposit: vector<u8> = b"Insufficient deposit for resolver";
#[error]
const ENotRegistered: vector<u8> = b"Resolver not registered";

fun init(ctx: &mut TxContext) {
    let registry = ResolverRegistry {
        id: object::new(ctx),
        min_threshold: MIN_THRESHOLD,
        safety_deposits: table::new<ID, Coin<SUI>>(ctx),
    };

    let registry_id = registry.id.to_inner();
    transfer::share_object(registry);

    // Emit an event indicating the creation of the resolver registry
    event::emit(ResolverRegistryEvent {
        id: registry_id,
        action: ResolverRegistryAction::Create,
        amount: option::none(),
    });
}

public entry fun update_min_threshold(
    _: &AdminCap,
    registry: &mut ResolverRegistry,
    new_threshold: u64,
) {
    assert!(new_threshold >= MIN_THRESHOLD, EInsufficientDeposit);
    registry.min_threshold = new_threshold;

    // Emit an event indicating the update of the minimum threshold
    event::emit(ResolverRegistryEvent {
        id: registry.id.to_inner(),
        action: ResolverRegistryAction::Config,
        amount: option::some(new_threshold),
    });
}

public entry fun add_resolver(
    registry: &mut ResolverRegistry,
    deposit: Coin<SUI>,
    ctx: &TxContext,
) {
    let resolver_id = ctx.sender().to_id();
    assert!(!table::contains(&registry.safety_deposits, resolver_id), EAlreadyRegistered);
    assert!(coin::value(&deposit) >= MIN_THRESHOLD, EInsufficientDeposit);

    // Add the resolver to the registry
    let val = coin::value(&deposit);
    table::add(&mut registry.safety_deposits, resolver_id, deposit);

    // Emit an event indicating the addition of the resolver
    event::emit(ResolverRegistryEvent {
        id: resolver_id,
        action: ResolverRegistryAction::Add,
        amount: option::some(val),
    });
}

public entry fun remove_resolver(registry: &mut ResolverRegistry, ctx: &TxContext) {
    let resolver_id = ctx.sender().to_id();
    assert!(table::contains(&registry.safety_deposits, resolver_id), ENotRegistered);

    // Remove the resolver from the registry
    let balance = table::remove(&mut registry.safety_deposits, resolver_id);
    let val = coin::value(&balance);
    transfer::public_transfer(balance, ctx.sender());

    // Emit an event indicating the removal of the resolver
    event::emit(ResolverRegistryEvent {
        id: resolver_id,
        action: ResolverRegistryAction::Remove,
        amount: option::some(val),
    });
}

public entry fun deposit(registry: &mut ResolverRegistry, deposit: Coin<SUI>, ctx: &TxContext) {
    let resolver_id = ctx.sender().to_id();
    assert!(table::contains(&registry.safety_deposits, resolver_id), ENotRegistered);
    assert!(coin::value(&deposit) >= MIN_THRESHOLD, EInsufficientDeposit);

    // Add the deposit to the resolver's safety deposit
    let current_balance = table::borrow_mut(&mut registry.safety_deposits, resolver_id);
    let val = coin::value(&deposit);

    coin::join(current_balance, deposit);

    // Emit an event indicating the deposit
    event::emit(ResolverRegistryEvent {
        id: resolver_id,
        action: ResolverRegistryAction::Deposit,
        amount: option::some(val),
    });
}

public entry fun withdraw(registry: &mut ResolverRegistry, amount: u64, ctx: &mut TxContext) {
    let resolver_id = ctx.sender().to_id();
    assert!(table::contains(&registry.safety_deposits, resolver_id), ENotRegistered);

    // Withdraw the specified amount from the resolver's safety deposit
    let current_balance = table::borrow_mut(&mut registry.safety_deposits, resolver_id);
    assert!(coin::value(current_balance) >= amount, EInsufficientDeposit);
    assert!(coin::value(current_balance) - amount >= MIN_THRESHOLD, EInsufficientDeposit);

    let withdrawn_coin = coin::split(current_balance, amount, ctx);
    transfer::public_transfer(withdrawn_coin, ctx.sender());

    // Emit an event indicating the withdrawal
    event::emit(ResolverRegistryEvent {
        id: resolver_id,
        action: ResolverRegistryAction::Withdraw,
        amount: option::some(amount),
    });
}

public(package) fun assert_resolver(registry: &ResolverRegistry, resolver: ID) {
    // Check if the resolver is registered
    assert!(table::contains(&registry.safety_deposits, resolver), ENotRegistered);
    assert!(
        coin::value(table::borrow(&registry.safety_deposits, resolver)) >= MIN_THRESHOLD,
        EInsufficientDeposit,
    );
}
