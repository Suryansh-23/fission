/*

module fusion_plus::order;

use fusion_plus::auction_calculator::{Self, AuctionDetails};
use sui::coin::{Self, Coin};
use sui::event;
use sui::hash;

// Errors
const EInvalidMakingAmount: u64 = 0;
const EUnauthorizedAccess: u64 = 1;

// Order structure that holds maker's funds
#[allow(lint(coin_field))]
public struct Order<phantom T: store> has key {
    id: UID,
    maker: address,
    receiver: address,
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
    auction_details: AuctionDetails,
}

public struct OrderHashData has copy, drop {
    salt: vector<u8>,
    maker: address,
    receiver: address,
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
    receiver: address,
    making_amount: u64,
    taking_amount: u64,
    maker_asset: vector<u8>,
    taker_asset: vector<u8>,
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
        maker: ctx.sender(),
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

public fun get_receiver<T: store>(order: &Order<T>): address {
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

*/

import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiTransactionBlockResponse } from "@mysten/sui/client";
import { SuiCoinHelper } from "./coin-sui";

export interface CoinInfo {
  coinObjectId: string;
  balance: bigint;
  coinType: string;
}

export interface CreateOrderParams {
  receiver: string;
  makingAmount: bigint;
  takingAmount: bigint;
  makerAsset: Uint8Array;
  takerAsset: Uint8Array;
  salt: Uint8Array;
  isPartialFillAllowed: boolean;
  isMultipleFillsAllowed: boolean;
  depositAmount: bigint;
  coinType: string;
  startTime: bigint;
  duration: bigint;
  initialRateBump: bigint;
  pointsAndTimeDeltas: Uint8Array;
}

export interface OrderInfo {
  orderId: string;
  maker: string;
  receiver: string;
  orderHash: Uint8Array;
  makingAmount: bigint;
  takingAmount: bigint;
  remainingAmount: bigint;
  filledAmount: bigint;
  isPartialFillAllowed: boolean;
  isMultipleFillsAllowed: boolean;
  isActive: boolean;
}

export class SuiOrderHelper {
  private client: SuiClient;
  private keypair: Ed25519Keypair;
  private packageId: string;
  private coinHelper: SuiCoinHelper;

  constructor(client: SuiClient, keypair: Ed25519Keypair, packageId: string) {
    this.client = client;
    this.keypair = keypair;
    this.packageId = packageId;
    this.coinHelper = new SuiCoinHelper(client, keypair);
  }

  /**
   * Create a new order on Sui blockchain
   */
  async createOrder(
    params: CreateOrderParams
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    // Prepare deposit coin
    let depositCoin;
    if (params.coinType === SuiCoinHelper.SUI_PACKAGE_ID) {
      // For SUI, split from gas
      [depositCoin] = tx.splitCoins(tx.gas, [params.depositAmount]);
    } else {
      // For other tokens, select appropriate coins
      const selectedCoins = await this.coinHelper.selectCoinsForAmount(
        params.depositAmount,
        params.coinType
      );

      if (
        selectedCoins.length === 1 &&
        selectedCoins[0].balance === params.depositAmount
      ) {
        depositCoin = tx.object(selectedCoins[0].coinObjectId);
      } else {
        // Merge and split as needed
        const primaryCoin = selectedCoins[0];
        const coinsToMerge = selectedCoins.slice(1);

        if (coinsToMerge.length > 0) {
          tx.mergeCoins(
            tx.object(primaryCoin.coinObjectId),
            coinsToMerge.map((coin: CoinInfo) => tx.object(coin.coinObjectId))
          );
        }

        [depositCoin] = tx.splitCoins(tx.object(primaryCoin.coinObjectId), [
          params.depositAmount,
        ]);
      }
    }

    // Call the create_order function
    tx.moveCall({
      target: `${this.packageId}::order::create_order`,
      typeArguments: [params.coinType],
      arguments: [
        tx.pure.address(params.receiver),
        tx.pure.u64(params.makingAmount.toString()),
        tx.pure.u64(params.takingAmount.toString()),
        tx.pure.vector("u8", Array.from(params.makerAsset)),
        tx.pure.vector("u8", Array.from(params.takerAsset)),
        tx.pure.vector("u8", Array.from(params.salt)),
        tx.pure.bool(params.isPartialFillAllowed),
        tx.pure.bool(params.isMultipleFillsAllowed),
        depositCoin,
        tx.pure.u64(params.startTime.toString()),
        tx.pure.u64(params.duration.toString()),
        tx.pure.u64(params.initialRateBump.toString()),
        tx.pure.vector("u8", Array.from(params.pointsAndTimeDeltas)),
      ],
    });

    // Execute transaction
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: {
        showEvents: true,
        showEffects: true,
        showObjectChanges: true,
      },
    });

    return result;
  }

  /**
   * Get order information by object ID
   */
  async getOrderInfo(
    orderId: string,
    coinType: string
  ): Promise<OrderInfo | null> {
    try {
      const response = await this.client.getObject({
        id: orderId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (
        !response.data ||
        !response.data.content ||
        response.data.content.dataType !== "moveObject"
      ) {
        return null;
      }

      const fields = response.data.content.fields as any;

      return {
        orderId,
        maker: fields.maker,
        receiver: fields.receiver,
        orderHash: new Uint8Array(fields.order_hash),
        makingAmount: BigInt(fields.making_amount),
        takingAmount: BigInt(fields.taking_amount),
        remainingAmount: BigInt(fields.remaining_coins?.fields?.balance || 0),
        filledAmount: BigInt(fields.filled_amount),
        isPartialFillAllowed: fields.is_partial_fill_allowed,
        isMultipleFillsAllowed: fields.is_multiple_fills_allowed,
        isActive: BigInt(fields.remaining_coins?.fields?.balance || 0) > 0n,
      };
    } catch (error) {
      console.error("Error fetching order info:", error);
      return null;
    }
  }

  /**
   * Withdraw remaining tokens from order (only for maker)
   */
  async withdrawFromOrder(
    orderId: string,
    coinType: string
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::order::withdraw`,
      typeArguments: [coinType],
      arguments: [tx.object(orderId)],
    });

    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: {
        showEvents: true,
        showEffects: true,
        showObjectChanges: true,
      },
    });

    return result;
  }

  /**
   * Parse OrderCreated event from transaction result
   */
  parseOrderCreatedEvent(result: SuiTransactionBlockResponse): {
    orderId: string;
    maker: string;
    orderHash: Uint8Array;
    makingAmount: bigint;
    takingAmount: bigint;
  } | null {
    if (!result.events) return null;

    for (const event of result.events) {
      if (event.type.includes("::order::OrderCreated")) {
        const parsedJson = event.parsedJson as any;
        return {
          orderId: parsedJson.id,
          maker: parsedJson.maker,
          orderHash: new Uint8Array(parsedJson.order_hash),
          makingAmount: BigInt(parsedJson.making_amount),
          takingAmount: BigInt(parsedJson.taking_amount),
        };
      }
    }

    return null;
  }
}
