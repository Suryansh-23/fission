module fusion_plus::auction_calculator;

const BASE_POINTS: u64 = 10_000_000;

public struct AuctionDetails has copy, drop, store {
    start_time: u64,
    duration: u64,
    initial_rate_bump: u64,
    points_and_time_deltas: vector<u8>,
}

public fun new(
    start_time: u64,
    duration: u64,
    initial_rate_bump: u64,
    points_and_time_deltas: vector<u8>,
): AuctionDetails {
    AuctionDetails {
        start_time,
        duration,
        initial_rate_bump,
        points_and_time_deltas,
    }
}

public fun get_taking_amount(
    order_making_amount: u64,
    order_taking_amount: u64,
    making_amount: u64,
    auction_details: AuctionDetails,
    current_time: u64,
): u64 {
    let rate_bump = get_auction_bump(
        auction_details,
        current_time,
    );

    order_taking_amount * making_amount * (BASE_POINTS + rate_bump) / (order_making_amount * BASE_POINTS)
}

/// Original function that calculates auction price bump
fun get_auction_bump(auction_details: AuctionDetails, current_time: u64): u64 {
    let auction_finish_time = auction_details.start_time + auction_details.duration;
    // If current time is before auction start, return initial rate bump
    if (current_time <= auction_details.start_time) {
        return auction_details.initial_rate_bump
    } else if (current_time >= auction_finish_time) {
        return 0
    };

    let mut current_point_time = auction_details.start_time;
    let mut current_rate_bump = auction_details.initial_rate_bump;
    let mut offset = 0;

    // Process each point in the points_and_time_deltas
    while (offset + 5 <= vector::length(&auction_details.points_and_time_deltas)) {
        // Extract next rate bump (3 bytes = 24 bits)
        let next_rate_bump = extract_u24(&auction_details.points_and_time_deltas, offset);

        // Extract time delta (2 bytes = 16 bits)
        let time_delta = extract_u16(&auction_details.points_and_time_deltas, offset + 3);

        let next_point_time = current_point_time + (time_delta as u64);

        // If current time is within this segment, interpolate
        if (current_time <= next_point_time) {
            return interpolate_rate_bump(
                    current_time,
                    current_point_time,
                    next_point_time,
                    current_rate_bump,
                    next_rate_bump,
                )
        };

        // Move to next point
        current_rate_bump = next_rate_bump;
        current_point_time = next_point_time;
        offset = offset + 5;
    };

    // Final interpolation to auction finish time with rate bump 0
    interpolate_rate_bump(
        current_time,
        current_point_time,
        auction_finish_time,
        current_rate_bump,
        0,
    )
}

/// Linear interpolation between two rate bumps based on time
fun interpolate_rate_bump(
    current_time: u64,
    start_time: u64,
    end_time: u64,
    start_rate: u64,
    end_rate: u64,
): u64 {
    if (end_time == start_time) {
        return start_rate
    };

    let time_passed = current_time - start_time;
    let total_time = end_time - start_time;

    // Linear interpolation: start_rate * (remaining_time) + end_rate * (time_passed) / total_time
    let remaining_time = end_time - current_time;
    (remaining_time * start_rate + time_passed * end_rate) / total_time
}

/// Extract a 24-bit unsigned integer from bytes starting at offset (big-endian)
fun extract_u24(data: &vector<u8>, offset: u64): u64 {
    let byte1 = *vector::borrow(data, offset) as u64;
    let byte2 = *vector::borrow(data, offset + 1) as u64;
    let byte3 = *vector::borrow(data, offset + 2) as u64;
    (byte1 << 16) | (byte2 << 8) | byte3
}

/// Extract a 16-bit unsigned integer from bytes starting at offset (big-endian)
fun extract_u16(data: &vector<u8>, offset: u64): u64 {
    let byte1 = *vector::borrow(data, offset) as u64;
    let byte2 = *vector::borrow(data, offset + 1) as u64;
    (byte1 << 8) | byte2
}

public fun get_point_and_time_deltas(
    auction_details: &AuctionDetails,
): vector<u8> {
    auction_details.points_and_time_deltas
}