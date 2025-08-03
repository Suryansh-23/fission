import {SuiCrossChainOrder} from './sui-cross-chain-order'
import {SuiEscrowParams, SuiDetails, SuiExtra, SuiOrderInfoData} from './types'
import {NetworkEnum} from '../../chains'
import {SuiAddress, EvmAddress} from '../../domains/addresses'
import {HashLock} from '../../domains/hash-lock'
import {TimeLocks} from '../../domains/time-locks'
import {AuctionDetails} from '../../domains/auction-details'
import {now} from '../../utils/time'

describe('SuiCrossChainOrder', () => {
    const mockHashLock = HashLock.fromString(
        '0x1234567890123456789012345678901234567890123456789012345678901234'
    )
    const mockTimeLocks = TimeLocks.new({
        srcWithdrawal: 3600n,
        srcPublicWithdrawal: 7200n,
        srcCancellation: 86400n,
        srcPublicCancellation: 172800n,
        dstWithdrawal: 1800n,
        dstPublicWithdrawal: 3600n,
        dstCancellation: 43200n
    })

    const mockOrderInfo: SuiOrderInfoData = {
        makerAsset: new SuiAddress(
            '0x0000000000000000000000000000000000000000000000000000000000000002'
        ),
        takerAsset: EvmAddress.fromString(
            '0x1234567890123456789012345678901234567890'
        ), // EVM address for Ethereum destination
        makingAmount: 1000000000n, // 1 SUI
        takingAmount: 2000000n, // 2 USDC
        maker: new SuiAddress(
            '0x0000000000000000000000000000000000000000000000000000000000000001'
        ),
        receiver: EvmAddress.fromString(
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        ), // EVM receiver address
        salt: 12345n
    }

    const mockEscrowParams: SuiEscrowParams = {
        hashLock: mockHashLock,
        srcChainId: NetworkEnum.SUI,
        dstChainId: NetworkEnum.ETHEREUM,
        srcSafetyDeposit: 100000n,
        dstSafetyDeposit: 200000n,
        timeLocks: mockTimeLocks
    }

    const mockDetails: SuiDetails = {
        auction: AuctionDetails.noAuction(300n, BigInt(now()) + 60n)
    }

    it('should create a Sui cross-chain order', () => {
        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails
        )

        expect(order.maker).toEqual(mockOrderInfo.maker)
        expect(order.makerAsset).toEqual(mockOrderInfo.makerAsset)
        expect(order.takerAsset).toEqual(mockOrderInfo.takerAsset)
        expect(order.makingAmount).toBe(mockOrderInfo.makingAmount)
        expect(order.takingAmount).toBe(mockOrderInfo.takingAmount)
        expect(order.dstChainId).toBe(NetworkEnum.ETHEREUM)
        expect(order.srcSafetyDeposit).toBe(100000n)
        expect(order.dstSafetyDeposit).toBe(200000n)
    })

    it('should handle extra parameters', () => {
        const extra: SuiExtra = {
            orderExpirationDelay: 30n,
            allowMultipleFills: false,
            allowPartialFills: false,
            source: 'test-app',
            gasBudget: 1000000n,
            gasPrice: 1000n,
            sponsor: new SuiAddress(
                '0x0000000000000000000000000000000000000000000000000000000000000003'
            )
        }

        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails,
            extra
        )

        expect(order.multipleFillsAllowed).toBe(false)
        expect(order.partialFillAllowed).toBe(false)
        expect(order.source).toBe('test-app')
        expect(order.gasBudget).toBe(1000000n)
        expect(order.gasPrice).toBe(1000n)
        expect(order.sponsor).toEqual(extra.sponsor)
    })

    it('should generate order hash', () => {
        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails
        )
        const hash = order.getOrderHash(NetworkEnum.SUI)

        expect(typeof hash).toBe('string')
        expect(hash.length).toBe(66) // 32 bytes as hex string with 0x prefix
    })

    it('should serialize to JSON', () => {
        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails
        )
        const json = order.toJSON()

        expect(json.orderInfo.makerAsset).toBe(
            mockOrderInfo.makerAsset.toString()
        )
        expect(json.orderInfo.takerAsset).toBe(
            mockOrderInfo.takerAsset.toString()
        )
        expect(json.orderInfo.maker).toBe(mockOrderInfo.maker.toString())
        expect(json.orderInfo.makingAmount).toBe(
            mockOrderInfo.makingAmount.toString()
        )
        expect(json.orderInfo.takingAmount).toBe(
            mockOrderInfo.takingAmount.toString()
        )
        expect(json.escrowParams.srcChainId).toBe(NetworkEnum.SUI)
        expect(json.escrowParams.dstChainId).toBe(NetworkEnum.ETHEREUM)
        expect(json.extra.allowMultipleFills).toBe(true)
        expect(json.extra.allowPartialFills).toBe(true)
        expect(json.extra.source).toBe('sdk')
    })

    it('should generate Move transaction payload', () => {
        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails
        )
        const payload = order.getMoveTransactionPayload()

        expect(payload.packageId).toBe('0x1')
        expect(payload.module).toBe('cross_chain_escrow')
        expect(payload.function).toBe('create_order')
        expect(payload.arguments).toHaveLength(10)
        expect(payload.typeArguments).toHaveLength(1)
    })

    it('should validate order configuration', () => {
        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails
        )

        expect(() => order.validate()).not.toThrow()
    })

    it('should throw error for invalid amounts', () => {
        const invalidOrderInfo = {
            ...mockOrderInfo,
            makingAmount: 0n
        }

        const order = SuiCrossChainOrder.new(
            invalidOrderInfo,
            mockEscrowParams,
            mockDetails
        )

        expect(() => order.validate()).toThrow('Source amount must be positive')
    })

    it('should create JSON with track code', () => {
        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails
        )
        const trackCode = 0x12345678n
        const json = order.toJSONWithTrackCode(trackCode)

        expect(json.extra.salt).not.toBe(mockOrderInfo.salt!.toString())
        // The salt should be modified with the track code
    })

    it('should use default receiver if not provided', () => {
        const orderInfoWithoutReceiver = {
            ...mockOrderInfo,
            receiver: undefined
        }

        const order = SuiCrossChainOrder.new(
            orderInfoWithoutReceiver,
            mockEscrowParams,
            mockDetails
        )

        expect(order.receiver).toBeDefined()
        // Should use a converted address based on maker and destination chain
    })

    it('should get auction calculator', () => {
        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails
        )
        const calculator = order.getCalculator()

        expect(calculator).toBeDefined()
        expect(typeof calculator.calcRateBump).toBe('function')
    })

    it('should handle auction times correctly', () => {
        const order = SuiCrossChainOrder.new(
            mockOrderInfo,
            mockEscrowParams,
            mockDetails
        )

        expect(order.auctionStartTime).toBe(mockDetails.auction.startTime)
        expect(order.auctionEndTime).toBe(
            mockDetails.auction.startTime + mockDetails.auction.duration
        )
        expect(order.deadline).toBeGreaterThan(order.auctionEndTime)
    })
})
