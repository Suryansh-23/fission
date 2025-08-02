import {
    BlockchainProviderConnector,
    HttpProviderConnector,
    LimitOrderV4Struct
} from '@1inch/fusion-sdk'
import {CustomPreset, PresetEnum} from '../api'
import {SupportedChain} from '../chains'
import {BaseOrder} from '../cross-chain-order/base-order'
import {AddressLike} from '../domains/addresses'
import {HashLock} from '../domains/hash-lock'

export type CrossChainSDKConfigParams = {
    url: string
    authKey?: string
    blockchainProvider?: BlockchainProviderConnector
    httpProvider?: HttpProviderConnector
}

export type QuoteParams<
    SrcChain extends SupportedChain = SupportedChain,
    DstChain extends SupportedChain = SupportedChain
> = {
    srcChainId: SrcChain
    dstChainId: DstChain
    srcTokenAddress: string
    dstTokenAddress: string
    amount: string
    walletAddress?: string
    enableEstimate?: boolean
    permit?: string
    takingFeeBps?: number // 100 == 1%
    source?: string
    isPermit2?: boolean
}

export type QuoteCustomPresetParams = {
    customPreset: CustomPreset
}

export type OrderParams = {
    walletAddress: string
    hashLock: HashLock
    secretHashes: string[]
    permit?: string // without the first 20 bytes of token address
    receiver?: string // by default: walletAddress (makerAddress)
    preset?: PresetEnum // by default: recommended preset
    /**
     * Unique for `walletAddress` can be serial or random generated
     *
     * @see randBigInt
     */
    nonce?: bigint
    fee?: TakingFeeInfo
    source?: string
    isPermit2?: boolean
    customPreset?: CustomPreset
}

export type TakingFeeInfo = {
    takingFeeBps: number // 100 == 1%
    takingFeeReceiver: string
}

export type OrderInfo = {
    order: LimitOrderV4Struct
    signature: string
    quoteId: string
    orderHash: string
    extension: string
}

export type PreparedOrder = {
    order: BaseOrder<AddressLike, any>
    hash: string
    quoteId: string
}
