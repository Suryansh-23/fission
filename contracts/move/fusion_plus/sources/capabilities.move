module fusion_plus::capabilities;

use sui::event;

public struct AdminCap has key, store {
    id: UID,
}

// Admin capability related event
public struct AdminCapEvent has copy, drop {
    id: ID,
    to: address,
}

// give the deployer the admin capability
fun init(ctx: &mut TxContext) {
    let cap = AdminCap { id: object::new(ctx) };
    let cap_id = cap.id.to_inner();

    // transfer the capability to the deployer
    transfer::transfer(cap, ctx.sender());

    // emit an event indicating the transfer of the admin capability
    event::emit(AdminCapEvent {
        id: cap_id,
        to: ctx.sender(),
    });
}

public entry fun transfer_admin_cap(cap: AdminCap, to: address) {
    let cap_id = cap.id.to_inner();
    transfer::public_transfer(cap, to);

    event::emit(AdminCapEvent {
        id: cap_id,
        to,
    });
}
