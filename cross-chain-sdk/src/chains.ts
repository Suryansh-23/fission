import {TupleToUnion} from './type-utils'

export enum NetworkEnum {
    ETHEREUM = 1,
    POLYGON = 137,
    ZKSYNC = 324,
    BINANCE = 56,
    ARBITRUM = 42161,
    AVALANCHE = 43114,
    OPTIMISM = 10,
    FANTOM = 250,
    GNOSIS = 100,
    COINBASE = 8453,
    LINEA = 59144,
    SONIC = 146,
    UNICHAIN = 130,
    SOLANA = 501,
    // sui is contradicting but the other chain is not used generally
    SUI = 101
}

export const SupportedChains = [
    NetworkEnum.ETHEREUM,
    NetworkEnum.POLYGON,
    NetworkEnum.BINANCE,
    NetworkEnum.OPTIMISM,
    NetworkEnum.ARBITRUM,
    NetworkEnum.AVALANCHE,
    NetworkEnum.GNOSIS,
    NetworkEnum.COINBASE,
    NetworkEnum.ZKSYNC,
    NetworkEnum.LINEA,
    NetworkEnum.SONIC,
    NetworkEnum.UNICHAIN,
    NetworkEnum.SOLANA,
    NetworkEnum.SUI
] as const

type UnsupportedChain = Exclude<
    NetworkEnum,
    TupleToUnion<typeof SupportedChains>
>

export type SupportedChain = Exclude<NetworkEnum, UnsupportedChain>
export type EvmChain = Exclude<
    SupportedChain,
    NetworkEnum.SOLANA | NetworkEnum.SUI
>
export type SolanaChain = NetworkEnum.SOLANA
export type SuiChain = NetworkEnum.SUI

export const isSupportedChain = (chain: unknown): chain is SupportedChain =>
    SupportedChains.includes(chain as number)

export const isEvm = (chain: SupportedChain): chain is EvmChain => {
    return (
        SupportedChains.includes(chain as number) &&
        chain !== NetworkEnum.SOLANA &&
        chain !== NetworkEnum.SUI
    )
}

export const isSolana = (chain: SupportedChain): chain is SolanaChain => {
    return chain === NetworkEnum.SOLANA
}

export const isSui = (chain: SupportedChain): chain is SuiChain => {
    return chain === NetworkEnum.SUI
}
