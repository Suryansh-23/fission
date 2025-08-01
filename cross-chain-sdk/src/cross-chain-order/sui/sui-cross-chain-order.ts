import {AuctionCalculator, randBigInt} from '@1inch/fusion-sdk'
import {keccak256} from 'ethers'
import {bcs} from '@mysten/bcs'
import assert from 'assert'
import {
    SuiDetails,
    SuiExtra,
    SuiEscrowParams,
    SuiOrderJSON,
    SuiOrderInfoData
} from './types'
import {AddressLike, createAddress, SuiAddress} from '../../domains/addresses'
import {NetworkEnum, SupportedChain, isSupportedChain} from '../../chains'
import {HashLock} from '../../domains/hash-lock'
import {TimeLocks} from '../../domains/time-locks'
import {BaseOrder} from '../base-order'
import {assertUInteger} from '../../utils'
import {AuctionDetails, AuctionPoint} from '../../domains/auction-details'
import {injectTrackCode} from '../source-track'
import {now} from '../../utils/time'

export class SuiCrossChainOrder extends BaseOrder<SuiAddress, SuiOrderJSON> {
    private static DefaultExtra: Required<
        Omit<SuiExtra, 'nonce' | 'sponsor' | 'gasBudget' | 'gasPrice'>
    > = {
        orderExpirationDelay: 12n,
        allowMultipleFills: true,
        allowPartialFills: true,
        source: 'sdk'
    }

    private readonly orderConfig: {
        srcToken: SuiAddress
        dstToken: AddressLike
        maker: SuiAddress
        receiver: AddressLike
        srcAmount: bigint
        minDstAmount: bigint
        deadline: bigint
        salt: bigint

        // extra config
        allowMultipleFills: boolean
        allowPartialFills: boolean
        orderExpirationDelay: bigint
        source: string
        gasBudget?: bigint
        gasPrice?: bigint
        sponsor?: SuiAddress
    }

    private readonly details: SuiDetails
    private readonly escrowParams: SuiEscrowParams

    private constructor(
        orderInfo: SuiOrderInfoData,
        escrowParams: SuiEscrowParams,
        details: SuiDetails,
        extra: SuiExtra = {}
    ) {
        super()

        assert(
            isSupportedChain(escrowParams.dstChainId),
            `dst chain ${escrowParams.dstChainId} is not supported`
        )

        const mergedExtra = {
            ...SuiCrossChainOrder.DefaultExtra,
            ...extra
        }

        const deadline =
            details.auction.startTime +
            details.auction.duration +
            mergedExtra.orderExpirationDelay

        this.orderConfig = {
            srcToken: orderInfo.makerAsset,
            dstToken: orderInfo.takerAsset,
            maker: orderInfo.maker,
            receiver: orderInfo.receiver || orderInfo.takerAsset, // Use takerAsset as receiver if not provided
            srcAmount: orderInfo.makingAmount,
            minDstAmount: orderInfo.takingAmount,
            deadline,
            salt: orderInfo.salt || randBigInt(2n ** 64n - 1n),
            allowMultipleFills: mergedExtra.allowMultipleFills,
            allowPartialFills: mergedExtra.allowPartialFills,
            orderExpirationDelay: mergedExtra.orderExpirationDelay,
            source: mergedExtra.source,
            gasBudget: extra.gasBudget,
            gasPrice: extra.gasPrice,
            sponsor: extra.sponsor
        }

        this.details = details
        this.escrowParams = escrowParams

        // Validations
        assertUInteger(this.orderConfig.srcAmount, 2n ** 64n - 1n)
        assertUInteger(this.orderConfig.minDstAmount, 2n ** 64n - 1n)
        assertUInteger(this.orderConfig.salt, 2n ** 64n - 1n)
        assertUInteger(this.orderConfig.deadline, 2n ** 64n - 1n)
    }

    static new(
        orderInfo: SuiOrderInfoData,
        escrowParams: SuiEscrowParams,
        details: SuiDetails,
        extra: SuiExtra = {}
    ): SuiCrossChainOrder {
        return new SuiCrossChainOrder(orderInfo, escrowParams, details, extra)
    }

    public get hashLock(): HashLock {
        return this.escrowParams.hashLock
    }

    public get timeLocks(): TimeLocks {
        return this.escrowParams.timeLocks
    }

    public get srcSafetyDeposit(): bigint {
        return this.escrowParams.srcSafetyDeposit
    }

    public get dstSafetyDeposit(): bigint {
        return this.escrowParams.dstSafetyDeposit
    }

    public get dstChainId(): SupportedChain {
        return this.escrowParams.dstChainId
    }

    public get maker(): SuiAddress {
        return this.orderConfig.maker
    }

    public get takerAsset(): AddressLike {
        return this.orderConfig.dstToken
    }

    public get makerAsset(): SuiAddress {
        return this.orderConfig.srcToken
    }

    public get takingAmount(): bigint {
        return this.orderConfig.minDstAmount
    }

    public get makingAmount(): bigint {
        return this.orderConfig.srcAmount
    }

    public get receiver(): AddressLike {
        return this.orderConfig.receiver
    }

    public get deadline(): bigint {
        return this.orderConfig.deadline
    }

    public get auctionStartTime(): bigint {
        return this.details.auction.startTime
    }

    public get auctionEndTime(): bigint {
        return this.details.auction.startTime + this.details.auction.duration
    }

    public get partialFillAllowed(): boolean {
        return this.orderConfig.allowPartialFills
    }

    public get multipleFillsAllowed(): boolean {
        return this.orderConfig.allowMultipleFills
    }

    public get salt(): bigint {
        return this.orderConfig.salt
    }

    public get source(): string {
        return this.orderConfig.source
    }

    public get gasBudget(): bigint | undefined {
        return this.orderConfig.gasBudget
    }

    public get gasPrice(): bigint | undefined {
        return this.orderConfig.gasPrice
    }

    public get sponsor(): SuiAddress | undefined {
        return this.orderConfig.sponsor
    }

    public getCalculator(): AuctionCalculator {
        const details = this.details.auction

        return new AuctionCalculator(
            details.startTime,
            details.duration,
            details.initialRateBump,
            details.points,
            0n // no taker fee
        )
    }

    public getOrderHash(srcChainId: number): string {
        return this.getOrderHashBuffer(srcChainId).toString('hex')
    }

    public getOrderHashBuffer(srcChainId: number): Buffer {
        assert(
            srcChainId === NetworkEnum.SUI,
            'Unsupported source chain for Sui order'
        )

        // Create a deterministic hash from order parameters
        const orderData = {
            srcToken: this.orderConfig.srcToken.toString(),
            dstToken: this.orderConfig.dstToken.toString(),
            maker: this.orderConfig.maker.toString(),
            receiver: this.orderConfig.receiver.toString(),
            srcAmount: this.orderConfig.srcAmount.toString(),
            minDstAmount: this.orderConfig.minDstAmount.toString(),
            deadline: this.orderConfig.deadline.toString(),
            salt: this.orderConfig.salt.toString(),
            srcChainId: srcChainId.toString(),
            dstChainId: this.escrowParams.dstChainId.toString(),
            hashLock: this.escrowParams.hashLock.toString(),
            timeLocks: this.escrowParams.timeLocks.toString()
        }

        const serialized = bcs
            .string()
            .serialize(JSON.stringify(orderData))
            .toBytes()
        return Buffer.from(keccak256(serialized).slice(2), 'hex')
    }

    public toJSON(): SuiOrderJSON {
        return {
            orderInfo: {
                srcToken: this.orderConfig.srcToken.toString(),
                dstToken: this.orderConfig.dstToken.toString(),
                maker: this.orderConfig.maker.toString(),
                srcAmount: this.orderConfig.srcAmount.toString(),
                minDstAmount: this.orderConfig.minDstAmount.toString(),
                receiver: this.orderConfig.receiver.toString()
            },
            escrowParams: {
                hashLock: this.escrowParams.hashLock.toString(),
                srcChainId: NetworkEnum.SUI,
                dstChainId: this.escrowParams.dstChainId,
                srcSafetyDeposit: this.escrowParams.srcSafetyDeposit.toString(),
                dstSafetyDeposit: this.escrowParams.dstSafetyDeposit.toString(),
                timeLocks: this.escrowParams.timeLocks.toString()
            },
            details: {
                auction: {
                    startTime: this.details.auction.startTime.toString(),
                    duration: this.details.auction.duration.toString(),
                    initialRateBump: Number(
                        this.details.auction.initialRateBump
                    ),
                    points: this.details.auction.points.map((point) => ({
                        coefficient: point.coefficient,
                        delay: point.delay
                    }))
                },
                resolvingStartTime: this.details.resolvingStartTime?.toString()
            },
            extra: {
                orderExpirationDelay:
                    this.orderConfig.orderExpirationDelay.toString(),
                source: this.orderConfig.source,
                allowMultipleFills: this.orderConfig.allowMultipleFills,
                allowPartialFills: this.orderConfig.allowPartialFills,
                salt: this.orderConfig.salt.toString(),
                gasBudget: this.orderConfig.gasBudget?.toString(),
                gasPrice: this.orderConfig.gasPrice?.toString(),
                sponsor: this.orderConfig.sponsor?.toString()
            }
        }
    }

    /**
     * Create order JSON with injected source tracking code
     */
    public toJSONWithTrackCode(trackCode?: bigint): SuiOrderJSON {
        const json = this.toJSON()

        if (trackCode !== undefined) {
            // Inject track code into salt similar to SVM implementation
            const saltWithTrack = injectTrackCode(
                this.orderConfig.salt,
                trackCode.toString()
            )
            json.extra.salt = saltWithTrack.toString()
        }

        return json
    }

    /**
     * Validate that the order configuration is valid for Sui
     */
    public validate(): void {
        assert(
            this.orderConfig.srcAmount > 0n,
            'Source amount must be positive'
        )
        assert(
            this.orderConfig.minDstAmount > 0n,
            'Min destination amount must be positive'
        )
        assert(
            this.orderConfig.deadline > now(),
            'Order deadline must be in the future'
        )
        assert(
            this.details.auction.startTime <= this.orderConfig.deadline,
            'Auction start time must be before deadline'
        )

        // Sui-specific validations
        if (this.orderConfig.gasBudget !== undefined) {
            assert(
                this.orderConfig.gasBudget > 0n,
                'Gas budget must be positive'
            )
        }

        if (this.orderConfig.gasPrice !== undefined) {
            assert(this.orderConfig.gasPrice > 0n, 'Gas price must be positive')
        }
    }

    /**
     * Get Move transaction payload for creating the order on Sui
     */
    public getMoveTransactionPayload(): {
        packageId: string
        module: string
        function: string
        arguments: any[]
        typeArguments: string[]
    } {
        return {
            packageId: '0x1', // This should be the actual package ID deployed on Sui
            module: 'cross_chain_escrow',
            function: 'create_order',
            arguments: [
                this.orderConfig.srcToken.toString(),
                this.orderConfig.srcAmount.toString(),
                this.orderConfig.receiver.toString(),
                this.orderConfig.minDstAmount.toString(),
                this.orderConfig.deadline.toString(),
                this.escrowParams.hashLock.toBuffer(),
                this.escrowParams.timeLocks.toString(),
                this.escrowParams.srcSafetyDeposit.toString(),
                this.escrowParams.dstSafetyDeposit.toString(),
                this.escrowParams.dstChainId
            ],
            typeArguments: [this.orderConfig.srcToken.toTypeArg()]
        }
    }
}
