import {LimitOrderV4Struct} from '@1inch/fusion-sdk'
import {RelayerRequestParams} from './types'
import {SupportedChain} from '../../chains'

export class RelayerRequest {
    public readonly order: LimitOrderV4Struct

    public readonly signature: string

    public readonly quoteId: string

    public readonly extension: string

    public readonly srcChainId: SupportedChain

    public readonly secretHashes?: string[]

    public readonly makerPubKey?: `0x${string}`

    constructor(params: RelayerRequestParams) {
        this.order = params.order
        this.signature = params.signature
        this.quoteId = params.quoteId
        this.extension = params.extension
        this.srcChainId = params.srcChainId
        this.secretHashes = params.secretHashes
        this.makerPubKey = params.makerPubKey
    }

    static new(params: RelayerRequestParams): RelayerRequest {
        return new RelayerRequest(params)
    }

    build(): RelayerRequestParams {
        return {
            order: this.order,
            signature: this.signature,
            quoteId: this.quoteId,
            extension: this.extension,
            srcChainId: this.srcChainId,
            secretHashes: this.secretHashes
        }
    }
}
