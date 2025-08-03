import {encodeCancelOrder, MakerTraits} from '@1inch/fusion-sdk'
import assert from 'assert'
import {
    OrderInfo,
    OrderParams,
    PreparedOrder,
    QuoteParams,
    QuoteCustomPresetParams,
    CrossChainSDKConfigParams
} from './types'
import {
    EvmAddress as Address,
    EvmAddress,
    SuiAddress,
    AddressLike
} from '../domains/addresses'
import {BaseOrder} from '../cross-chain-order/base-order'
import {EvmCrossChainOrder} from '../cross-chain-order/evm'
import {
    FusionApi,
    Quote,
    QuoterRequest,
    RelayerRequest,
    QuoterCustomPresetRequest,
    ActiveOrdersRequest,
    ActiveOrdersRequestParams,
    ActiveOrdersResponse,
    OrdersByMakerParams,
    OrdersByMakerRequest,
    OrdersByMakerResponse,
    OrderStatusRequest,
    OrderStatusResponse,
    ReadyToAcceptSecretFills,
    PublishedSecretsResponse,
    ReadyToExecutePublicActions,
    QuoterRequestParams
} from '../api'
import {SuiCrossChainOrder, SuiOrderJSON} from '../cross-chain-order/sui'
import {NetworkEnum, SupportedChain} from '../chains'

export class SDK {
    public readonly api: FusionApi

    constructor(private readonly config: CrossChainSDKConfigParams) {
        this.api = new FusionApi({
            url: config.url,
            httpProvider: config.httpProvider,
            authKey: config.authKey
        })
    }

    async getActiveOrders(
        params: ActiveOrdersRequestParams = {}
    ): Promise<ActiveOrdersResponse> {
        const request = new ActiveOrdersRequest(params)

        return this.api.getActiveOrders(request)
    }

    async getOrderStatus(orderHash: string): Promise<OrderStatusResponse> {
        const request = new OrderStatusRequest({orderHash})

        return this.api.getOrderStatus(request)
    }

    async getOrdersByMaker(
        params: OrdersByMakerParams
    ): Promise<OrdersByMakerResponse> {
        const request = new OrdersByMakerRequest(params)

        return this.api.getOrdersByMaker(request)
    }

    async getReadyToAcceptSecretFills(
        orderHash: string
    ): Promise<ReadyToAcceptSecretFills> {
        return this.api.getReadyToAcceptSecretFills(orderHash)
    }

    async getReadyToExecutePublicActions(): Promise<ReadyToExecutePublicActions> {
        return this.api.getReadyToExecutePublicActions()
    }

    async getPublishedSecrets(
        orderHash: string
    ): Promise<PublishedSecretsResponse> {
        return this.api.getPublishedSecrets(orderHash)
    }

    async submitSecret(orderHash: string, secret: string): Promise<void> {
        return this.api.submitSecret(orderHash, secret)
    }

    async getQuote(params: QuoteParams): Promise<Quote> {
        const quoteParams: QuoterRequestParams = {
            srcChain: params.srcChainId,
            dstChain: params.dstChainId,
            srcTokenAddress: params.srcTokenAddress,
            dstTokenAddress: params.dstTokenAddress,
            amount: params.amount,
            walletAddress: params.walletAddress || Address.ZERO.toString(),
            permit: params.permit,
            enableEstimate: !!params.enableEstimate,
            fee: params?.takingFeeBps,
            source: params.source,
            isPermit2: params.isPermit2
        }

        if (QuoterRequest.isEvmRequest(quoteParams)) {
            const req = QuoterRequest.forEVM(quoteParams)

            return this.api.getQuote(req)
        }

        if (QuoterRequest.isSolanaRequest(quoteParams)) {
            const req = QuoterRequest.forSolana(quoteParams)

            return this.api.getQuote(req)
        }

        if (QuoterRequest.isSuiRequest(quoteParams)) {
            const req = QuoterRequest.forSui(quoteParams)

            return this.api.getQuote(req)
        }

        throw new Error('unknown request src chain')
    }

    async getQuoteWithCustomPreset(
        params: QuoteParams,
        body: QuoteCustomPresetParams
    ): Promise<Quote> {
        const quoteParams: QuoterRequestParams = {
            srcChain: params.srcChainId,
            dstChain: params.dstChainId,
            srcTokenAddress: params.srcTokenAddress,
            dstTokenAddress: params.dstTokenAddress,
            amount: params.amount,
            walletAddress: params.walletAddress || Address.ZERO.toString(),
            permit: params.permit,
            enableEstimate: !!params.enableEstimate,
            fee: params?.takingFeeBps,
            source: params.source,
            isPermit2: params.isPermit2
        }

        const bodyRequest = new QuoterCustomPresetRequest({
            customPreset: body.customPreset
        })

        if (QuoterRequest.isEvmRequest(quoteParams)) {
            const req = QuoterRequest.forEVM(quoteParams)

            return this.api.getQuoteWithCustomPreset(req, bodyRequest)
        }

        if (QuoterRequest.isSolanaRequest(quoteParams)) {
            const req = QuoterRequest.forSolana(quoteParams)

            return this.api.getQuoteWithCustomPreset(req, bodyRequest)
        }

        throw new Error('unknown request src chain')
    }

    async createOrder(
        quote: Quote,
        params: OrderParams
    ): Promise<PreparedOrder> {
        if (!quote.quoteId) {
            throw new Error('request quote with enableEstimate=true')
        }

        // prevents doing SUI -> ETH
        // assert(quote.isEvmQuote(), 'cannot use non-evm quote')

        const relayerParams = {
            hashLock: params.hashLock,
            receiver: params.receiver
                ? quote.dstChainId === NetworkEnum.SUI
                    ? SuiAddress.fromUnknown(params.receiver)
                    : EvmAddress.fromString(params.receiver)
                : undefined,
            preset: params.preset,
            nonce: params.nonce,
            takingFeeReceiver: params.fee?.takingFeeReceiver,
            permit: params.permit,
            isPermit2: params.isPermit2
        }

        let order: BaseOrder<any, any>
        if (quote.isEvmQuote()) {
            order = quote.createEvmOrder(relayerParams)
        } else if (quote.isSuiQuote()) {
            order = quote.createSuiOrder(relayerParams)
        } else {
            // we don't support this quote type
            throw new Error('unsupported quote type')
        }

        const hash = order.getOrderHash(quote.srcChainId)

        return {order, hash, quoteId: quote.quoteId}
    }

    public async submitOrder(
        srcChainId: SupportedChain,
        order: BaseOrder<AddressLike, any>,
        quoteId: string,
        secretHashes: string[],
        makerPubKey?: `0x${string}`,
        signature?: `0x${string}`
    ): Promise<OrderInfo> {
        if (!this.config.blockchainProvider) {
            throw new Error('blockchainProvider has not set to config')
        }

        if (!order.multipleFillsAllowed && secretHashes.length > 1) {
            throw new Error(
                'with disabled multiple fills you provided secretHashes > 1'
            )
        } else if (order.multipleFillsAllowed && secretHashes) {
            const secretCount = order.hashLock.getPartsCount() + 1n

            if (secretHashes.length !== Number(secretCount)) {
                throw new Error(
                    'secretHashes length should be equal to number of secrets'
                )
            }
        }

        if (srcChainId === NetworkEnum.SUI) {
            assert(signature, 'signature is required for SUI orders')
            assert(makerPubKey, 'makerPubKey is required for SUI orders')

            // For Sui orders, we need to handle differently
            // The order should be a SuiCrossChainOrder
            const suiOrder = order as unknown as SuiCrossChainOrder
            const orderJSON = order.toJSON() as SuiOrderJSON

            const relayerRequest = new RelayerRequest({
                srcChainId,
                order: orderJSON.orderInfo,
                signature,
                quoteId,
                extension: suiOrder.escrowExtension.encodeToHex(),
                secretHashes: secretHashes,
                makerPubKey: makerPubKey
            })

            await this.api.submitOrder(relayerRequest)

            return {
                order: orderJSON.orderInfo,
                signature,
                quoteId,
                orderHash: order.getOrderHash(srcChainId),
                extension: relayerRequest.extension
            }
        } else {
            // EVM order handling
            const evmOrder = order as unknown as EvmCrossChainOrder
            const orderStruct = evmOrder.build()

            signature = (await this.config.blockchainProvider.signTypedData(
                orderStruct.maker,
                evmOrder.getTypedData(srcChainId)
            )) as `0x${string}`

            const relayerRequest = new RelayerRequest({
                srcChainId,
                order: {
                    ...orderStruct,
                    takerAsset: evmOrder.takerAsset.toString(),
                    receiver: evmOrder.receiver.toString()
                },
                signature,
                quoteId,
                extension: evmOrder.extension.encode(),
                secretHashes: secretHashes,
                makerPubKey: makerPubKey
            })

            await this.api.submitOrder(relayerRequest)

            return {
                order: orderStruct,
                signature,
                quoteId,
                orderHash: evmOrder.getOrderHash(srcChainId),
                extension: relayerRequest.extension
            }
        }
    }

    async placeOrder(quote: Quote, params: OrderParams): Promise<OrderInfo> {
        const {order, quoteId} = await this.createOrder(quote, params)

        return this.submitOrder(
            quote.srcChainId,
            order,
            quoteId,
            params.secretHashes
        )
    }

    async buildCancelOrderCallData(orderHash: string): Promise<string> {
        const getOrderRequest = new OrderStatusRequest({orderHash})
        const orderData = await this.api.getOrderStatus(getOrderRequest)

        if (!orderData) {
            throw new Error(
                `Can not get order with the specified orderHash ${orderHash}`
            )
        }

        const {order} = orderData

        return encodeCancelOrder(
            orderHash,
            new MakerTraits(BigInt(order.makerTraits))
        )
    }
}
