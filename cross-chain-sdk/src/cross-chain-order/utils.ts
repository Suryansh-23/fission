import { bcs, fromHex, toHex } from '@mysten/bcs'
import bigInt, { BigInteger } from 'big-integer'

const zero = bigInt(0)
const n256 = bigInt(256)

export const toLittleEndian = (bigNumber: BigInteger): Uint8Array => {
    let result = new Uint8Array(
        Math.min(
            32,
            bigNumber.bitLength().toJSNumber() / 8 +
                (bigNumber.bitLength().toJSNumber() % 8 === 0 ? 0 : 1)
        )
    )
    let i = 0

    while (bigNumber.greater(zero)) {
        result[i] = bigNumber.mod(n256).toJSNumber()
        bigNumber = bigNumber.divide(n256)
        i += 1
    }
    return result
}

export const toBigEndian = (bigNumber: BigInteger): Uint8Array => {
    return toLittleEndian(bigNumber).reverse()
}

export const MoveAddress = bcs.byteVector().transform({
    // To change the input type, you need to provide a type definition for the input
    input: (val: string) => fromHex(val),
    output: (val: Uint8Array) => '0x' + toHex(val)
})

export const EvmAddress = bcs.byteVector().transform({
    // To change the input type, you need to provide a type definition for the input
    input: (val: string) => fromHex(val),
    output: (val) => toHex(new Uint8Array(val))
})
