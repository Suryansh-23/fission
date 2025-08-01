import {AuctionDetails} from '../../domains/auction-details'
import {AddressLike, SuiAddress} from '../../domains/addresses'
import {HashLock} from '../../domains/hash-lock'
import {TimeLocks} from '../../domains/time-locks'
import {NetworkEnum, SupportedChain} from '../../chains'

export type SuiCrossChainOrderInfo = {
    /**
     * Source chain asset (Sui object ID or coin type)
     */
    makerAsset: SuiAddress
    /**
     * Destination chain asset
     */
    takerAsset: AddressLike
    /**
     * Source chain amount
     */
    makingAmount: bigint
    /**
     * Destination chain min amount
     */
    takingAmount: bigint
    maker: SuiAddress
    salt?: bigint
    /**
     * Destination chain receiver address
     *
     * If not set, then `maker` used
     */
    receiver?: AddressLike
}

export type SuiExtra = {
    /**
     * Max size is 64bit for Sui
     */
    nonce?: bigint
    /**
     * Order will expire in `orderExpirationDelay` after auction ends
     * Default 12s
     */
    orderExpirationDelay?: bigint
    source?: string
    allowMultipleFills?: boolean
    allowPartialFills?: boolean
    /**
     * Sui-specific: gas budget for transaction execution
     */
    gasBudget?: bigint
    /**
     * Sui-specific: gas price for transaction
     */
    gasPrice?: bigint
    /**
     * Sui-specific: sponsor address for gas payment
     */
    sponsor?: SuiAddress
}

export type SuiDetails = {
    auction: AuctionDetails
    /**
     * Time from which order can be executed
     */
    resolvingStartTime?: bigint
}

export type SuiEscrowParams = {
    hashLock: HashLock
    srcChainId: NetworkEnum.SUI
    dstChainId: SupportedChain
    srcSafetyDeposit: bigint
    dstSafetyDeposit: bigint
    timeLocks: TimeLocks
}

export type SuiOrderInfoData = {
    makerAsset: SuiAddress
    takerAsset: AddressLike
    makingAmount: bigint
    takingAmount: bigint
    maker: SuiAddress
    salt?: bigint
    receiver?: AddressLike
}

export type SuiOrderJSON = {
    orderInfo: {
        srcToken: string // Sui address
        dstToken: string // destination chain address
        maker: string // Sui address
        srcAmount: string // u64 bigint
        minDstAmount: string // u64 bigint
        receiver: string // destination chain address
    }
    escrowParams: {
        hashLock: string // 32bytes hex
        srcChainId: NetworkEnum.SUI
        dstChainId: number
        srcSafetyDeposit: string // u64 bigint
        dstSafetyDeposit: string // u64 bigint
        timeLocks: string // serialized TimeLocks
    }
    details: {
        auction: {
            startTime: string
            duration: string
            initialRateBump: number
            points: Array<{
                coefficient: number
                delay: number
            }>
        }
        resolvingStartTime?: string
    }
    extra: {
        orderExpirationDelay: string // bigint
        source: string
        allowMultipleFills: boolean
        allowPartialFills: boolean
        salt: string // u64 bigint
        gasBudget?: string
        gasPrice?: string
        sponsor?: string
    }
}
