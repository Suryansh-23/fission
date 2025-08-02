import {LimitOrderV4Struct} from '@1inch/fusion-sdk'
import {SupportedChain} from '../../chains'

export type SuiOrderInfo = {
    srcToken: string
    dstToken: string
    maker: string
    srcAmount: string
    minDstAmount: string
    receiver: string
}

export type RelayerRequestParams = {
    srcChainId: SupportedChain
    order: LimitOrderV4Struct
    signature: string
    quoteId: string
    extension: string
    secretHashes?: string[]
    makerPubKey?: `0x${string}`
}

export type RelayerApiConfig = {
    url: string
    authKey?: string
}
