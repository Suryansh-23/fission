import {bcs, fromHex, toHex} from '@mysten/bcs'
import bigInt, {BigInteger} from 'big-integer'

const zero = bigInt(0)
const n256 = bigInt(256)

export const toLittleEndian = (bigNumber: BigInteger): Uint8Array => {
    let result = new Uint8Array(32)
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

export const MoveAddress = bcs.bytes(32).transform({
    // To change the input type, you need to provide a type definition for the input
    input: (val: string) => fromHex(val),
    output: (val) => toHex(val)
})
