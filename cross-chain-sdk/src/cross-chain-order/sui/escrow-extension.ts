import {bcs} from '@mysten/bcs'
import {BitMask, BN, trim0x, UINT_64_MAX} from '@1inch/byte-utils'
import assert from 'assert'
import {AddressComplement} from '../../domains/addresses/address-complement'
import {AuctionDetails} from '../../domains/auction-details'
import {HashLock} from '../../domains/hash-lock'
import {TimeLocks} from '../../domains/time-locks'
import {SupportedChain} from '../../chains'
import {
    AddressLike,
    SuiAddress,
    EvmAddress as EvmAddressClass,
    createAddress
} from '../../domains/addresses'
import {MoveAddress, EvmAddress as EvmAddressBcs} from '../utils'

/**
 * Sui-specific escrow extension for cross-chain orders
 * Contains escrow-specific data for Sui orders including:
 * - hashLock: secret hash for atomic swaps (32 bytes)
 * - dstChainId: destination chain identifier (u64)
 * - dstToken: destination token address (variable length for different chains)
 * - srcSafetyDeposit: source safety deposit (packed u64, high 32 bits)
 * - dstSafetyDeposit: destination safety deposit (packed u64, low 32 bits)
 * - timeLocks: time locks for the order (u256)
 */
export class SuiEscrowExtension {
    private static ESCROW_DATA_BCS_STRUCT = bcs.struct('EscrowData', {
        hashLock: bcs.fixedArray(32, bcs.u8()), // 32-byte hash lock
        dstChainId: bcs.u64(), // destination chain identifier
        dstToken: bcs.vector(bcs.u8()), // destination token address as bytes
        srcSafetyDeposit: bcs.u64(), // source safety deposit
        dstSafetyDeposit: bcs.u64(), // destination safety deposit
        timeLocks: bcs.u256() // time locks as u256
    })

    // eslint-disable-next-line max-params
    constructor(
        public readonly makerAsset: SuiAddress, // Source token address on Sui
        public readonly takerAsset: AddressLike, // Destination token address
        public readonly makingAmount: bigint, // Amount being offered (source)
        public readonly takingAmount: bigint, // Amount being requested (destination)
        public readonly maker: SuiAddress, // Order creator address on Sui
        public readonly receiver: AddressLike, // Final recipient address
        public readonly auctionDetails: AuctionDetails, // Auction parameters
        public readonly hashLockInfo: HashLock, // Secret hash for atomic swap
        public readonly dstChainId: SupportedChain, // Destination chain identifier
        public readonly dstToken: AddressLike, // Destination token address
        public readonly srcSafetyDeposit: bigint, // Source chain safety deposit
        public readonly dstSafetyDeposit: bigint, // Destination chain safety deposit
        public readonly timeLocks: TimeLocks, // Time-based constraints
        public readonly salt: bigint = 0n, // Unique order identifier
        public readonly dstAddressFirstPart = AddressComplement.ZERO // Address complement
    ) {
        // Validation for Sui-specific constraints
        assert(
            srcSafetyDeposit <= UINT_64_MAX,
            'Source safety deposit too large for Sui u64'
        )
        assert(
            dstSafetyDeposit <= UINT_64_MAX,
            'Destination safety deposit too large for Sui u64'
        )
        assert(
            makingAmount <= UINT_64_MAX,
            'Making amount too large for Sui u64'
        )
        assert(
            takingAmount <= UINT_64_MAX,
            'Taking amount too large for Sui u64'
        )
        assert(salt <= UINT_64_MAX, 'Salt too large for Sui u64')

        this.dstToken = dstToken.zeroAsNative()
    }

    /**
     * Create SuiEscrowExtension from BCS encoded bytes
     * @param bytes BCS encoded escrow data
     */
    public static decode(bytes: Uint8Array): {
        hashLock: HashLock
        dstChainId: number
        dstToken: AddressLike
        srcSafetyDeposit: bigint
        dstSafetyDeposit: bigint
        timeLocks: TimeLocks
    } {
        const decoded = SuiEscrowExtension.ESCROW_DATA_BCS_STRUCT.parse(bytes)

        const convertedData = {
            hashLock: new Uint8Array(decoded.hashLock),
            dstChainId: BigInt(decoded.dstChainId),
            dstToken: new Uint8Array(decoded.dstToken),
            srcSafetyDeposit: BigInt(decoded.srcSafetyDeposit),
            dstSafetyDeposit: BigInt(decoded.dstSafetyDeposit),
            timeLocks: BigInt(decoded.timeLocks)
        }

        return SuiEscrowExtension.decodeEscrowData(convertedData)
    }

    /**
     * Create SuiEscrowExtension from hex string
     * @param hex 0x prefixed hex string
     */
    public static decodeFromHex(hex: string): {
        hashLock: HashLock
        dstChainId: number
        dstToken: AddressLike
        srcSafetyDeposit: bigint
        dstSafetyDeposit: bigint
        timeLocks: TimeLocks
    } {
        const bytes = new Uint8Array(Buffer.from(hex.slice(2), 'hex'))
        return SuiEscrowExtension.decode(bytes)
    }

    /**
     * Decode escrow data from parsed BCS struct
     */
    private static decodeEscrowData(data: {
        hashLock: Uint8Array
        dstChainId: bigint
        dstToken: Uint8Array
        srcSafetyDeposit: bigint
        dstSafetyDeposit: bigint
        timeLocks: bigint
    }): {
        hashLock: HashLock
        dstChainId: number
        dstToken: AddressLike
        srcSafetyDeposit: bigint
        dstSafetyDeposit: bigint
        timeLocks: TimeLocks
    } {
        return {
            hashLock: HashLock.fromString(
                '0x' + Buffer.from(data.hashLock).toString('hex')
            ),
            dstChainId: Number(data.dstChainId),
            dstToken: createAddress(
                '0x' + Buffer.from(data.dstToken).toString('hex'),
                Number(data.dstChainId)
            ),
            srcSafetyDeposit: data.srcSafetyDeposit,
            dstSafetyDeposit: data.dstSafetyDeposit,
            timeLocks: TimeLocks.fromBigInt(data.timeLocks)
        }
    }

    /**
     * Encode the escrow extension to BCS bytes
     */
    public encode(): Uint8Array {
        const escrowData = {
            hashLock: Array.from(this.hashLockInfo.toBuffer()),
            dstChainId: BigInt(this.dstChainId),
            dstToken: Array.from(this.encodeDestinationToken()),
            srcSafetyDeposit: this.srcSafetyDeposit,
            dstSafetyDeposit: this.dstSafetyDeposit,
            timeLocks: this.timeLocks.build()
        }

        return SuiEscrowExtension.ESCROW_DATA_BCS_STRUCT.serialize(
            escrowData
        ).toBytes()
    }

    /**
     * Encode to hex string with 0x prefix
     */
    public encodeToHex(): string {
        return '0x' + Buffer.from(this.encode()).toString('hex')
    }

    /**
     * Pack safety deposits into a single u64
     * src in high 32 bits, dst in low 32 bits
     */
    private packSafetyDeposits(): bigint {
        return (this.srcSafetyDeposit << 32n) | this.dstSafetyDeposit
    }

    /**
     * Encode destination token address based on the destination chain
     */
    private encodeDestinationToken(): Uint8Array {
        // For EVM chains, use standard 20-byte address
        if (this.dstToken instanceof EvmAddressClass) {
            return this.dstToken.toBuffer()
        }

        // For other chains, convert to bytes
        return this.dstToken.toBuffer()
    }

    /**
     * Get the order hash for Sui using BCS serialization
     */
    public getOrderHash(): string {
        const orderHashStruct = bcs.struct('SuiOrderHash', {
            salt: bcs.u64(),
            maker: MoveAddress,
            receiver: EvmAddressBcs,
            makerAsset: MoveAddress,
            takerAsset: EvmAddressBcs,
            makingAmount: bcs.u64(),
            takingAmount: bcs.u64(),
            escrowData: bcs.vector(bcs.u8())
        })

        const orderData = {
            salt: this.salt,
            maker: this.maker.toString(),
            receiver: this.receiver.toString(),
            makerAsset: this.makerAsset.toString(),
            takerAsset: this.takerAsset.toString(),
            makingAmount: this.makingAmount,
            takingAmount: this.takingAmount,
            escrowData: Array.from(this.encode())
        }

        const serialized = orderHashStruct.serialize(orderData).toBytes()

        // Use keccak256 for compatibility with EVM chains
        const {keccak256} = require('ethers')
        return keccak256(serialized)
    }

    /**
     * Get the order hash as a buffer
     */
    public getOrderHashBuffer(): Buffer {
        return Buffer.from(this.getOrderHash().slice(2), 'hex')
    }

    /**
     * Convert to Move transaction arguments for Sui
     */
    public toMoveTransactionArgs(): {
        makerAsset: string
        takerAsset: string
        makingAmount: string
        takingAmount: string
        maker: string
        receiver: string
        salt: string
        escrowData: string
        auctionStartTime: string
        auctionDuration: string
        auctionInitialRateBump: number
    } {
        return {
            makerAsset: this.makerAsset.toString(),
            takerAsset: this.takerAsset.toString(),
            makingAmount: this.makingAmount.toString(),
            takingAmount: this.takingAmount.toString(),
            maker: this.maker.toString(),
            receiver: this.receiver.toString(),
            salt: this.salt.toString(),
            escrowData: this.encodeToHex(),
            auctionStartTime: this.auctionDetails.startTime.toString(),
            auctionDuration: this.auctionDetails.duration.toString(),
            auctionInitialRateBump: Number(this.auctionDetails.initialRateBump)
        }
    }

    /**
     * Validate the escrow extension data
     */
    public validate(): void {
        assert(this.makingAmount > 0n, 'Making amount must be positive')
        assert(this.takingAmount > 0n, 'Taking amount must be positive')
        assert(
            this.srcSafetyDeposit >= 0n,
            'Source safety deposit must be non-negative'
        )
        assert(
            this.dstSafetyDeposit >= 0n,
            'Destination safety deposit must be non-negative'
        )

        // Validate auction details
        assert(
            this.auctionDetails.startTime > 0n,
            'Auction start time must be positive'
        )
        assert(
            this.auctionDetails.duration > 0n,
            'Auction duration must be positive'
        )

        // Validate time locks
        const now = BigInt(Math.floor(Date.now() / 1000))
        assert(
            this.auctionDetails.startTime >= now,
            'Auction start time must be in the future'
        )
    }

    /**
     * Create a simplified JSON representation
     */
    public toJSON(): {
        makerAsset: string
        takerAsset: string
        makingAmount: string
        takingAmount: string
        maker: string
        receiver: string
        salt: string
        hashLock: string
        dstChainId: number
        dstToken: string
        srcSafetyDeposit: string
        dstSafetyDeposit: string
        timeLocks: string
        auctionDetails: {
            startTime: string
            duration: string
            initialRateBump: number
            points: Array<{coefficient: number; delay: number}>
        }
    } {
        return {
            makerAsset: this.makerAsset.toString(),
            takerAsset: this.takerAsset.toString(),
            makingAmount: this.makingAmount.toString(),
            takingAmount: this.takingAmount.toString(),
            maker: this.maker.toString(),
            receiver: this.receiver.toString(),
            salt: this.salt.toString(),
            hashLock: this.hashLockInfo.toString(),
            dstChainId: this.dstChainId,
            dstToken: this.dstToken.toString(),
            srcSafetyDeposit: this.srcSafetyDeposit.toString(),
            dstSafetyDeposit: this.dstSafetyDeposit.toString(),
            timeLocks: this.timeLocks.toJSON(),
            auctionDetails: {
                startTime: this.auctionDetails.startTime.toString(),
                duration: this.auctionDetails.duration.toString(),
                initialRateBump: Number(this.auctionDetails.initialRateBump),
                points: this.auctionDetails.points
            }
        }
    }

    /**
     * Create Move function call data for order creation
     */
    public getMoveCallData(): {
        packageId: string
        module: string
        function: string
        arguments: string[]
        typeArguments: string[]
    } {
        return {
            packageId: '0x1', // Replace with actual package ID when deployed
            module: 'cross_chain_escrow',
            function: 'create_escrow_order',
            arguments: [
                this.makerAsset.toString(),
                this.makingAmount.toString(),
                this.takerAsset.toString(),
                this.takingAmount.toString(),
                this.receiver.toString(),
                this.salt.toString(),
                this.encodeToHex(),
                this.auctionDetails.startTime.toString(),
                this.auctionDetails.duration.toString(),
                this.auctionDetails.initialRateBump.toString()
            ],
            typeArguments: [this.makerAsset.toTypeArg()]
        }
    }

    /**
     * Clone the extension with updated parameters
     */
    public clone(
        updates: Partial<{
            srcSafetyDeposit: bigint
            dstSafetyDeposit: bigint
            timeLocks: TimeLocks
            salt: bigint
        }>
    ): SuiEscrowExtension {
        return new SuiEscrowExtension(
            this.makerAsset,
            this.takerAsset,
            this.makingAmount,
            this.takingAmount,
            this.maker,
            this.receiver,
            this.auctionDetails,
            this.hashLockInfo,
            this.dstChainId,
            this.dstToken,
            updates.srcSafetyDeposit ?? this.srcSafetyDeposit,
            updates.dstSafetyDeposit ?? this.dstSafetyDeposit,
            updates.timeLocks ?? this.timeLocks,
            updates.salt ?? this.salt,
            this.dstAddressFirstPart
        )
    }
}
