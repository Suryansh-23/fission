import {bcs} from '@mysten/bcs'
import {hexToUint8Array, uint8ArrayToHex} from '@1inch/byte-utils'
import {hexlify} from 'ethers'
import {UINT_160_MAX} from '@1inch/fusion-sdk'
import {AddressLike, HexString} from './types'
import {AddressComplement} from './address-complement'
import {EvmAddress} from './evm-address'
import {isBigintString} from '../../utils/numbers/is-bigint-string'

export class SuiAddress implements AddressLike {
    public static readonly ZERO = SuiAddress.fromBigInt(0n)

    public static readonly NATIVE = new SuiAddress(
        '0x0000000000000000000000000000000000000000000000000000000000000002'
    )

    public static readonly SUI_FRAMEWORK_PACKAGE_ID = new SuiAddress(
        '0x0000000000000000000000000000000000000000000000000000000000000002'
    )

    public static readonly CLOCK_OBJECT_ID = new SuiAddress(
        '0x0000000000000000000000000000000000000000000000000000000000000006'
    )

    public static readonly SUI_TYPE_ARG = '0x2::sui::SUI'

    private readonly inner: string

    constructor(value: string) {
        // Normalize the address - remove 0x prefix if present for validation
        const normalized = value.startsWith('0x') ? value.slice(2) : value

        // Check if it's a valid Sui address format
        if (!/^[0-9a-fA-F]{1,64}$/.test(normalized)) {
            throw new Error(`${value} is not a valid Sui address.`)
        }

        // Pad to 64 characters (32 bytes) and add 0x prefix
        this.inner = '0x' + normalized.padStart(64, '0')
    }

    static fromString(str: string): SuiAddress {
        return new SuiAddress(str)
    }

    /**
     * @see splitToParts
     */
    static fromParts(parts: [AddressComplement, EvmAddress]): SuiAddress {
        const highBits = parts[0].inner
        const lowBits = parts[1].toBigint()
        const address = (highBits << 160n) | lowBits

        return SuiAddress.fromBigInt(address)
    }

    static fromUnknown(val: unknown): SuiAddress {
        if (!val) {
            throw new Error('invalid address')
        }

        if (typeof val === 'string') {
            if (isBigintString(val)) {
                return SuiAddress.fromBigInt(BigInt(val))
            }

            return new SuiAddress(val)
        }

        if (typeof val === 'bigint') {
            return SuiAddress.fromBigInt(val)
        }

        if (
            typeof val === 'object' &&
            'toBuffer' in val &&
            typeof val.toBuffer === 'function'
        ) {
            const buffer = val.toBuffer()

            if (buffer instanceof Buffer || buffer instanceof Uint8Array) {
                return SuiAddress.fromBuffer(buffer)
            }
        }

        throw new Error('invalid address')
    }

    static fromBuffer(buf: Buffer | Uint8Array): SuiAddress {
        const hex = uint8ArrayToHex(buf)
        return new SuiAddress(hex)
    }

    static fromBigInt(val: bigint): SuiAddress {
        const buffer = hexToUint8Array(
            '0x' + val.toString(16).padStart(64, '0')
        )

        return SuiAddress.fromBuffer(buffer)
    }

    /**
     * Converts address to short form (removes leading zeros after 0x)
     */
    public toShortString(): string {
        return '0x' + this.inner.slice(2).replace(/^0+/, '') || '0x0'
    }

    public nativeAsZero(): this {
        return this
    }

    public zeroAsNative(): this {
        return this
    }

    toString(): string {
        return this.inner
    }

    toJSON(): string {
        return this.toString()
    }

    public toBuffer(): Buffer {
        return Buffer.from(this.inner.slice(2), 'hex')
    }

    public equal(other: AddressLike): boolean {
        return this.toBuffer().equals(other.toBuffer())
    }

    public isNative(): boolean {
        return this.equal(SuiAddress.NATIVE)
    }

    public isZero(): boolean {
        return this.equal(SuiAddress.ZERO)
    }

    public toHex(): HexString {
        return this.inner as HexString
    }

    public toBigint(): bigint {
        return BigInt(this.inner)
    }

    public splitToParts(): [AddressComplement, EvmAddress] {
        const bn = this.toBigint()

        return [
            new AddressComplement(bn >> 160n),
            EvmAddress.fromBigInt(bn & UINT_160_MAX)
        ]
    }

    /**
     * Formats address for use in Move type arguments
     */
    public toTypeArg(): string {
        return this.toShortString()
    }

    /**
     * Serializes the address using BCS (Binary Canonical Serialization)
     */
    public toBcs(): Uint8Array {
        return bcs.string().serialize(this.inner).toBytes()
    }

    /**
     * Creates a SuiAddress from BCS serialized data
     */
    static fromBcs(data: Uint8Array): SuiAddress {
        const address = bcs.string().parse(data)
        return new SuiAddress(address)
    }
}
