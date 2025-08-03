import {SuiEscrowExtension} from './escrow-extension'
import {SuiAddress, EvmAddress} from '../../domains/addresses'
import {HashLock} from '../../domains/hash-lock'
import {TimeLocks} from '../../domains/time-locks'
import {AuctionDetails} from '../../domains/auction-details'
import {NetworkEnum} from '../../chains'

describe('SuiEscrowExtension', () => {
    const mockSuiAddress = new SuiAddress(
        '0x1234567890abcdef1234567890abcdef12345678'
    )
    const mockDestAddress = new SuiAddress(
        '0xabcdef1234567890abcdef1234567890abcdef12'
    )
    const mockEvmAddress = EvmAddress.fromString(
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
    )
    const mockHashLock = HashLock.forSingleFill('0x' + '00'.repeat(32))
    const mockTimeLocks = TimeLocks.new({
        srcWithdrawal: 300n,
        srcPublicWithdrawal: 600n,
        srcCancellation: 1200n,
        srcPublicCancellation: 1800n,
        dstWithdrawal: 300n,
        dstPublicWithdrawal: 600n,
        dstCancellation: 1200n
    })
    const mockAuctionDetails = AuctionDetails.noAuction(
        300n,
        BigInt(Math.floor(Date.now() / 1000) + 3600)
    )

    describe('constructor', () => {
        it('should create a new SuiEscrowExtension instance', () => {
            const extension = new SuiEscrowExtension(
                mockSuiAddress, // makerAsset
                mockDestAddress, // takerAsset
                1000000n, // makingAmount (1 SUI)
                2000000n, // takingAmount (2 units on dest chain)
                mockSuiAddress, // maker
                mockDestAddress, // receiver
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM, // dstChainId
                mockEvmAddress, // dstToken
                100000n, // srcSafetyDeposit
                200000n, // dstSafetyDeposit
                mockTimeLocks,
                42n // salt
            )

            expect(extension.makerAsset).toBe(mockSuiAddress)
            expect(extension.takingAmount).toBe(2000000n)
            expect(extension.hashLockInfo).toBe(mockHashLock)
            expect(extension.dstChainId).toBe(NetworkEnum.ETHEREUM)
            expect(extension.srcSafetyDeposit).toBe(100000n)
            expect(extension.dstSafetyDeposit).toBe(200000n)
        })

        it('should throw error for amounts too large for Sui u64', () => {
            expect(() => {
                new SuiEscrowExtension(
                    mockSuiAddress,
                    mockDestAddress,
                    2n ** 64n, // Too large for u64
                    1000000n,
                    mockSuiAddress,
                    mockDestAddress,
                    mockAuctionDetails,
                    mockHashLock,
                    NetworkEnum.ETHEREUM,
                    mockEvmAddress, // Use EVM address for Ethereum destination
                    100000n,
                    200000n,
                    mockTimeLocks
                )
            }).toThrow('Making amount too large for Sui u64')
        })
    })

    describe('encode/decode', () => {
        let extension: SuiEscrowExtension

        beforeEach(() => {
            extension = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress, // Use EVM address for Ethereum destination
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )
        })

        it('should encode to BCS bytes', () => {
            const encoded = extension.encode()
            expect(encoded).toBeInstanceOf(Uint8Array)
            expect(encoded.length).toBeGreaterThan(0)
        })

        it('should encode to hex string', () => {
            const hex = extension.encodeToHex()
            expect(hex).toMatch(/^0x[0-9a-fA-F]+$/)
        })

        it('should decode from hex string', () => {
            const hex = extension.encodeToHex()
            const decoded = SuiEscrowExtension.decodeFromHex(hex)

            expect(decoded.hashLock.toString()).toBe(mockHashLock.toString())
            expect(decoded.dstChainId).toBe(NetworkEnum.ETHEREUM)
            expect(decoded.srcSafetyDeposit).toBe(100000n)
            expect(decoded.dstSafetyDeposit).toBe(200000n)
        })
    })

    describe('getOrderHash', () => {
        it('should generate consistent order hash', () => {
            const extension = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )

            const hash1 = extension.getOrderHash()
            const hash2 = extension.getOrderHash()

            expect(hash1).toBe(hash2)
            expect(hash1).toMatch(/^0x[0-9a-fA-F]{64}$/)
        })

        it('should generate different hashes for different extensions', () => {
            const extension1 = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )

            const extension2 = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                43n // Different salt
            )

            expect(extension1.getOrderHash()).not.toBe(
                extension2.getOrderHash()
            )
        })
    })

    describe('toMoveTransactionArgs', () => {
        it('should generate correct Move transaction arguments', () => {
            const extension = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )

            const args = extension.toMoveTransactionArgs()

            expect(args.makerAsset).toBe(mockSuiAddress.toString())
            expect(args.makingAmount).toBe('1000000')
            expect(args.salt).toBe('42')
            expect(args.escrowData).toMatch(/^0x[0-9a-fA-F]+$/)
            expect(typeof args.auctionInitialRateBump).toBe('number')
        })
    })

    describe('getMoveCallData', () => {
        it('should generate correct Move call data', () => {
            const extension = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )

            const callData = extension.getMoveCallData()

            expect(callData.packageId).toBe('0x1')
            expect(callData.module).toBe('cross_chain_escrow')
            expect(callData.function).toBe('create_escrow_order')
            expect(callData.arguments).toHaveLength(10)
            expect(callData.typeArguments).toHaveLength(1)
        })
    })

    describe('validate', () => {
        it('should pass validation for valid extension', () => {
            const extension = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )

            expect(() => extension.validate()).not.toThrow()
        })

        it('should fail validation for zero making amount', () => {
            const extension = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                0n, // Invalid
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )

            expect(() => extension.validate()).toThrow(
                'Making amount must be positive'
            )
        })
    })

    describe('clone', () => {
        it('should create a copy with updated values', () => {
            const original = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )

            const cloned = original.clone({
                srcSafetyDeposit: 150000n,
                salt: 99n
            })

            expect(cloned.srcSafetyDeposit).toBe(150000n)
            expect(cloned.salt).toBe(99n)
            expect(cloned.dstSafetyDeposit).toBe(200000n) // Unchanged
            expect(cloned.makingAmount).toBe(1000000n) // Unchanged
        })
    })

    describe('toJSON', () => {
        it('should serialize to JSON correctly', () => {
            const extension = new SuiEscrowExtension(
                mockSuiAddress,
                mockDestAddress,
                1000000n,
                2000000n,
                mockSuiAddress,
                mockDestAddress,
                mockAuctionDetails,
                mockHashLock,
                NetworkEnum.ETHEREUM,
                mockEvmAddress,
                100000n,
                200000n,
                mockTimeLocks,
                42n
            )

            const json = extension.toJSON()

            expect(json.makingAmount).toBe('1000000')
            expect(json.takingAmount).toBe('2000000')
            expect(json.salt).toBe('42')
            expect(json.dstChainId).toBe(NetworkEnum.ETHEREUM)
            expect(json.srcSafetyDeposit).toBe('100000')
            expect(json.dstSafetyDeposit).toBe('200000')
            expect(typeof json.auctionDetails.initialRateBump).toBe('number')
        })
    })
})
