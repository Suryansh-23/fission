import {EvmChain, SolanaChain, SuiChain, SupportedChain} from './chains'
import {EvmAddress, SolanaAddress, SuiAddress} from './domains'

export type TupleToUnion<ArrayType> = ArrayType extends readonly unknown[]
    ? ArrayType[number]
    : never

export type AddressForChain<Chain extends SupportedChain> =
    Chain extends EvmChain
        ? EvmAddress
        : Chain extends SolanaChain
          ? SolanaAddress
          : Chain extends SuiChain
            ? SuiAddress
            : never
