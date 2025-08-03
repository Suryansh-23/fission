import {SuiCrossChainOrder} from './sui-cross-chain-order'
import {SuiEscrowExtension} from './escrow-extension'
import {SuiEscrowParams, SuiDetails, SuiExtra, SuiOrderInfoData} from './types'
import {NetworkEnum} from '../../chains'
import {SuiAddress, EvmAddress} from '../../domains/addresses'
import {HashLock} from '../../domains/hash-lock'
import {TimeLocks} from '../../domains/time-locks'
import {AuctionDetails} from '../../domains/auction-details'
import {now} from '../../utils/time'

describe('SuiCrossChainOrder Integration with EscrowExtension', () => {
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

    const auctionDetails = AuctionDetails.noAuction(300n, BigInt(now()) + 60n)

    const mockOrderInfo: SuiOrderInfoData = {
        makerAsset: new SuiAddress(
            '0x0000000000000000000000000000000000000000000000000000000000000002'
        ),
        takerAsset: EvmAddress.fromString(
            '0x1234567890123456789012345678901234567890'
        ),
        makingAmount: 1000000000n,
        takingAmount: 2000000n,
        maker: new SuiAddress(
            '0x0000000000000000000000000000000000000000000000000000000000000001'
        ),
        receiver: EvmAddress.fromString(
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
        ),
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
        auction: auctionDetails
    }

    describe('EscrowExtension access pattern like EVM', () => {
        it('should provide escrowExtension getter like EVM implementation', () => {
            const order = SuiCrossChainOrder.new(
                mockOrderInfo,
                mockEscrowParams,
                mockDetails
            )

            // Test the escrowExtension getter (like EVM pattern)
            expect(order.escrowExtension).toBeDefined()
            expect(order.escrowExtension).toBeInstanceOf(SuiEscrowExtension)
        })

        it('should access hashLockInfo through escrowExtension like resolver code', () => {
            const order = SuiCrossChainOrder.new(
                mockOrderInfo,
                mockEscrowParams,
                mockDetails
            )

            // This is how the resolver code accesses it:
            // crossChainOrder.escrowExtension.hashLockInfo.toBuffer()
            const hashLockBuffer = order.escrowExtension.hashLockInfo.toBuffer()
            expect(hashLockBuffer).toBeInstanceOf(Buffer)
            expect(hashLockBuffer.length).toBe(32)
        })

        it('should access dstSafetyDeposit through escrowExtension like resolver code', () => {
            const order = SuiCrossChainOrder.new(
                mockOrderInfo,
                mockEscrowParams,
                mockDetails
            )

            // This is how the resolver code accesses it:
            // crossChainOrder.escrowExtension.dstSafetyDeposit
            const dstSafetyDeposit = order.escrowExtension.dstSafetyDeposit
            expect(dstSafetyDeposit).toBe(200000n)
        })

        it('should provide direct getters for convenience (maintains backward compatibility)', () => {
            const order = SuiCrossChainOrder.new(
                mockOrderInfo,
                mockEscrowParams,
                mockDetails
            )

            // These should still work for convenience
            expect(order.hashLock).toEqual(mockHashLock)
            expect(order.timeLocks).toEqual(mockTimeLocks)
            expect(order.srcSafetyDeposit).toBe(100000n)
            expect(order.dstSafetyDeposit).toBe(200000n)
            expect(order.dstChainId).toBe(NetworkEnum.ETHEREUM)
        })

        it('should allow creating from escrow extension directly', () => {
            // Create escrow extension directly
            const escrowExtension = new SuiEscrowExtension(
                mockOrderInfo.makerAsset,
                mockOrderInfo.takerAsset,
                mockOrderInfo.makingAmount,
                mockOrderInfo.takingAmount,
                mockOrderInfo.maker,
                mockOrderInfo.receiver!,
                auctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockOrderInfo.takerAsset,
                100000n,
                200000n,
                mockTimeLocks,
                mockOrderInfo.salt
            )

            // Create order from escrow extension
            const order = SuiCrossChainOrder.fromEscrowExtension(
                escrowExtension,
                mockDetails
            )

            expect(order.escrowExtension).toBe(escrowExtension)
            expect(order.hashLock).toEqual(mockHashLock)
            expect(order.makingAmount).toBe(1000000000n)
        })
    })

    describe('Encode/Decode workflow like EVM', () => {
        it('should encode and decode escrow extension data', () => {
            const order = SuiCrossChainOrder.new(
                mockOrderInfo,
                mockEscrowParams,
                mockDetails
            )

            // Encode the escrow extension
            const encoded = order.escrowExtension.encodeToHex()
            expect(encoded).toMatch(/^0x[0-9a-fA-F]+$/)

            // Decode the escrow extension
            const decoded = SuiEscrowExtension.decodeFromHex(encoded)
            expect(decoded.hashLock.toString()).toBe(mockHashLock.toString())
            expect(decoded.dstChainId).toBe(NetworkEnum.ETHEREUM)
            expect(decoded.srcSafetyDeposit).toBe(100000n)
            expect(decoded.dstSafetyDeposit).toBe(200000n)
        })
    })
})
