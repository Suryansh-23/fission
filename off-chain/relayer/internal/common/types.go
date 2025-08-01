package common

import (
	"encoding/json"
	"math/big"

	"github.com/google/uuid"
)

/*
TS Equivalent:

	export type QuoterRequestParams = {
		srcChain: SupportedChain
		dstChain: SupportedChain
		srcTokenAddress: string
		dstTokenAddress: string
		amount: string
		walletAddress: string
	}
*/

type QuoteRequestParams struct {
	SrcChain        string `schema:"srcChain"`
	DstChain        string `schema:"dstChain"`
	SrcTokenAddress string `schema:"srcTokenAddress"`
	DstTokenAddress string `schema:"dstTokenAddress"`
	Amount          string `schema:"amount"`
	WalletAddress   string `schema:"walletAddress"`
}

/*
TS Equivalent:

	export type QuoterResponse = {
	    quoteId: string | null
	    srcTokenAmount: string
	    dstTokenAmount: string
	    presets: QuoterPresets
	    srcEscrowFactory: string
	    dstEscrowFactory: string
	    recommendedPreset: PresetEnum
	    prices: Cost
	    volume: Cost
	    whitelist: string[]
	    takerAddresses?: string[]
	    timeLocks: TimeLocksRaw
	    srcSafetyDeposit: string
	    dstSafetyDeposit: string
	    autoK: number
	}
*/
type Quote struct {
	QuoteID           uuid.UUID     `json:"quoteId"`
	SrcTokenAmount    string        `json:"srcTokenAmount"`
	DstTokenAmount    string        `json:"dstTokenAmount"`
	Presets           QuoterPresets `json:"presets"`
	SrcEscrowFactory  string        `json:"srcEscrowFactory"`
	DstEscrowFactory  string        `json:"dstEscrowFactory"`
	RecommendedPreset PresetEnum    `json:"recommendedPreset"`
	Prices            Cost          `json:"prices"`
	Volume            Cost          `json:"volume"`
	Whitelist         []string      `json:"whitelist"`
	TakerAddresses    []string      `json:"takerAddresses,omitempty"`
	TimeLocks         TimeLocksRaw  `json:"timeLocks"`
	SrcSafetyDeposit  string        `json:"srcSafetyDeposit"`
	DstSafetyDeposit  string        `json:"dstSafetyDeposit"`
	AutoK             float64       `json:"autoK"`
}

/*
TS Equivalent:

	export type QuoterPresets = {
	    fast: PresetData
	    medium: PresetData
	    slow: PresetData
	    custom?: PresetData
	}
*/
type QuoterPresets = map[PresetEnum]PresetData

/*
TS Equivalent:

	export type PresetData = {
	    auctionDuration: number
	    startAuctionIn: number
	    initialRateBump: number
	    auctionStartAmount: string
	    startAmount: string
	    auctionEndAmount: string
	    costInDstToken: string
	    points: AuctionPoint[]
	    allowPartialFills: boolean
	    allowMultipleFills: boolean
	    gasCost: {
	        gasBumpEstimate: number
	        gasPriceEstimate: string
	    }
	    exclusiveResolver: string | null
	    secretsCount: number
	}
*/
type PresetData struct {
	AuctionDuration    int64          `json:"auctionDuration"`
	StartAuctionIn     int64          `json:"startAuctionIn"`
	InitialRateBump    float64        `json:"initialRateBump"`
	AuctionStartAmount string         `json:"auctionStartAmount"`
	StartAmount        string         `json:"startAmount"`
	AuctionEndAmount   string         `json:"auctionEndAmount"`
	CostInDstToken     string         `json:"costInDstToken"`
	Points             []AuctionPoint `json:"points"`
	AllowPartialFills  bool           `json:"allowPartialFills"`
	AllowMultipleFills bool           `json:"allowMultipleFills"`
	GasCost            struct {
		GasBumpEstimate  float64 `json:"gasBumpEstimate"`
		GasPriceEstimate string  `json:"gasPriceEstimate"`
	} `json:"gasCost"`
	ExclusiveResolver *string `json:"exclusiveResolver,omitempty"` // Optional field
	SecretsCount      int     `json:"secretsCount"`
}

/*
TS Equivalent:

	export type AuctionPoint = {
		delay: number
		coefficient: number
	}
*/
type AuctionPoint struct {
	Delay       int64   `json:"delay"`
	Coefficient float64 `json:"coefficient"`
}

/*
TS Equivalent:
export enum PresetEnum {
	Fast = "fast",
	Medium = "medium",
	Slow = "slow",
	Custom = "custom"
}
*/

type PresetEnum string

const (
	PresetFast   PresetEnum = "fast"
	PresetMedium PresetEnum = "medium"
	PresetSlow   PresetEnum = "slow"
	PresetCustom PresetEnum = "custom"
)

/*
TS Equivalent:

	export type Cost = {
		usd: {
			srcToken: string
			dstToken: string
		}
	}
*/
type Cost struct {
	USD struct {
		SrcToken string `json:"srcToken"`
		DstToken string `json:"dstToken"`
	} `json:"usd"`
}

/*
TS Equivalent:

	export type TimeLocksRaw = {
		srcWithdrawal: number
	srcPublicWithdrawal: number
	    srcCancellation: number
	    srcPublicCancellation: number
	    dstWithdrawal: number
	    dstPublicWithdrawal: number
	    dstCancellation: number
	}
*/
type TimeLocksRaw struct {
	SrcWithdrawal         int64 `json:"srcWithdrawal"`
	SrcPublicWithdrawal   int64 `json:"srcPublicWithdrawal"`
	SrcCancellation       int64 `json:"srcCancellation"`
	SrcPublicCancellation int64 `json:"srcPublicCancellation"`
	DstWithdrawal         int64 `json:"dstWithdrawal"`
	DstPublicWithdrawal   int64 `json:"dstPublicWithdrawal"`
	DstCancellation       int64 `json:"dstCancellation"`
}

/*
TS Equivalent:

	export type Order = {
		srcChainId: SupportedChain
		order: LimitOrderV4Struct
		relayerSignature: string
		signature?: string
		quoteId: string
		extension: string
		secretHashes?: string[]
	}
*/
type Order struct {
	SrcChainID       ChainID    `json:"srcChainId"`
	LimitOrder       LimitOrder `json:"order"`
	RelayerSignature string     `json:"relayerSignature,omitempty"` // Optional field
	Signature        string     `json:"signature"`
	QuoteID          uuid.UUID  `json:"quoteId"`
	Extension        string     `json:"extension"`
	SecretHashes     []string   `json:"secretHashes,omitempty"`
}

func (o *Order) UnmarshalJSON(bytes []byte) error {
	var alias struct {
		SrcChainID       big.Int    `json:"srcChainId"`
		LimitOrder       LimitOrder `json:"order"`
		RelayerSignature string     `json:"relayerSignature,omitempty"` // Optional field
		Signature        string     `json:"signature"`
		QuoteID          uuid.UUID  `json:"quoteId"`
		Extension        string     `json:"extension"`
		SecretHashes     []string   `json:"secretHashes"`
	}

	err := json.Unmarshal(bytes, &alias)
	if err != nil {
		return err
	}

	o.SrcChainID = GetChainID(alias.SrcChainID)
	o.LimitOrder = alias.LimitOrder
	o.RelayerSignature = alias.RelayerSignature
	o.Signature = alias.Signature
	o.QuoteID = alias.QuoteID
	o.Extension = alias.Extension
	o.SecretHashes = alias.SecretHashes

	return nil
}

/*
TS Equivalent:

	export type LimitOrderV4Struct = {
		salt: string
		maker: string
		receiver: string
		makerAsset: string
		takerAsset: string
		makingAmount: string
		takingAmount: string
		makerTraits: string
	}
*/
type LimitOrder struct {
	Salt         string `json:"salt"`
	Maker        string `json:"maker"`
	Receiver     string `json:"receiver"`
	MakerAsset   string `json:"makerAsset"`
	TakerAsset   string `json:"takerAsset"`
	MakingAmount string `json:"makingAmount"`
	TakingAmount string `json:"takingAmount"`
	/**
	 * The MakerTraits type is an uint256, and different parts of the number are used to encode different traits.
	 * High bits are used for flags
	 * 255 bit `NO_PARTIAL_FILLS_FLAG`          - if set, the order does not allow partial fills
	 * 254 bit `ALLOW_MULTIPLE_FILLS_FLAG`      - if set, the order permits multiple fills
	 * 253 bit                                  - unused
	 * 252 bit `PRE_INTERACTION_CALL_FLAG`      - if set, the order requires pre-interaction call
	 * 251 bit `POST_INTERACTION_CALL_FLAG`     - if set, the order requires post-interaction call
	 * 250 bit `NEED_CHECK_EPOCH_MANAGER_FLAG`  - if set, the order requires to check the epoch manager
	 * 249 bit `HAS_EXTENSION_FLAG`             - if set, the order has extension(s)
	 * 248 bit `USE_PERMIT2_FLAG`               - if set, the order uses permit2
	 * 247 bit `UNWRAP_WETH_FLAG`               - if set, the order requires to unwrap WETH
	 *
	 * Low 200 bits are used for allowed sender, expiration, nonceOrEpoch, and series
	 * uint80 last 10 bytes of allowed sender address (0 if any)
	 * uint40 expiration timestamp (0 if none)
	 * uint40 nonce or epoch
	 * uint40 series
	 */
	MakerTraits string `json:"makerTraits"`
}

/*
TS Equivalent:

	export type SecretSubmission {
		orderHash: string
		secret: string
	}
*/
type Secret struct {
	OrderHash string `json:"orderHash"`
	Secret    string `json:"secret"`
}

/*
TS Equivalent:

	export type OrderStatusResponse = {
		status: OrderStatus
		order: LimitOrderV4Struct
		extension: string
		points: AuctionPoint[] | null
		cancelTx: string | null
		fills: Fill[]
		createdAt: string
		auctionStartDate: number
		auctionDuration: number
		initialRateBump: number
		isNativeCurrency: boolean
		fromTokenToUsdPrice: string
		toTokenToUsdPrice: string
	}
*/
type OrderStatus struct {
	Status              OrderStatusMode `json:"status"`
	Order               *LimitOrder     `json:"order"`
	Extension           string          `json:"extension"`
	Points              []AuctionPoint  `json:"points"`
	CancelTx            *string         `json:"cancelTx"`
	Fills               []Fill          `json:"fills"`
	CreatedAt           string          `json:"createdAt"`
	AuctionStartDate    int64           `json:"auctionStartDate"`
	AuctionDuration     int64           `json:"auctionDuration"`
	InitialRateBump     float64         `json:"initialRateBump"`
	IsNativeCurrency    bool            `json:"isNativeCurrency"`
	FromTokenToUsdPrice string          `json:"fromTokenToUsdPrice"`
	ToTokenToUsdPrice   string          `json:"toTokenToUsdPrice"`
}

/*
TS Equivalent:

	export enum OrderStatusMode {
		Pending = 'pending',
		Executed = 'executed',
		Expired = 'expired',
		Cancelled = 'cancelled',
		Refunding = 'refunding',
		Refunded = 'refunded'
	}
*/
type OrderStatusMode string

const (
	OrderStatusPending   OrderStatusMode = "pending"
	OrderStatusExecuted  OrderStatusMode = "executed"
	OrderStatusExpired   OrderStatusMode = "expired"
	OrderStatusCancelled OrderStatusMode = "cancelled"
	OrderStatusRefunding OrderStatusMode = "refunding"
	OrderStatusRefunded  OrderStatusMode = "refunded"
)

/*
TS Equivalent:

	export type Fill = {
		status: FillStatus
		txHash: string
		filledMakerAmount: string
		filledAuctionTakerAmount: string
		escrowEvents: EscrowEventData[]
	}
*/
type Fill struct {
	Status                   FillStatus        `json:"status"`
	TxHash                   string            `json:"txHash"`
	FilledMakerAmount        string            `json:"filledMakerAmount"`
	FilledAuctionTakerAmount string            `json:"filledAuctionTakerAmount"`
	EscrowEvents             []EscrowEventData `json:"escrowEvents"`
}

/*
TS Equivalent:

	export enum FillStatus {
		Pending = 'pending',
		Executed = 'executed',
		Refunding = 'refunding',
		Refunded = 'refunded'
	}
*/
type FillStatus string

const (
	Pending   FillStatus = "pending"
	Executed  FillStatus = "executed"
	Refunding FillStatus = "refunding"
	Refunded  FillStatus = "refunded"
)

/*
TS Equivalent:

	export type EscrowEventData = {
		transactionHash: string
		escrow: string
		side: EscrowEventSide
		action: EscrowEventAction
		blockTimestamp: number
	}
*/
type EscrowEventData struct {
	TransactionHash string            `json:"transactionHash"`
	Escrow          string            `json:"escrow"`
	Side            EscrowEventSide   `json:"side"`
	Action          EscrowEventAction `json:"action"`
	BlockTimestamp  int64             `json:"blockTimestamp"`
}

/*
TS Equivalent:

	export enum EscrowEventSide {
		Src = 'src',
		Dst = 'dst'
	}
*/
type EscrowEventSide string

const (
	Src EscrowEventSide = "src"
	Dst EscrowEventSide = "dst"
)

/*
TS Equivalent:

	export enum EscrowEventAction {
		SrcEscrowCreated = 'src_escrow_created',
		DstEscrowCreated = 'dst_escrow_created',
		Withdrawn = 'withdrawn',
		FundsRescued = 'funds_rescued',
		EscrowCancelled = 'escrow_cancelled'
	}
*/
type EscrowEventAction string

const (
	SrcEscrowCreated EscrowEventAction = "src_escrow_created"
	DstEscrowCreated EscrowEventAction = "dst_escrow_created"
	Withdrawn        EscrowEventAction = "withdrawn"
	FundsRescued     EscrowEventAction = "funds_rescued"
	EscrowCancelled  EscrowEventAction = "escrow_cancelled"
)

/*
TS Equivalent:

		export type ReadyToAcceptSecretFills = {
	 	   fills: ReadyToAcceptSecretFill[]
		}
*/
type ReadyToAcceptSecretFills struct {
	Fills []ReadyToAcceptSecretFill `json:"fills"`
}

/*
TS Equivalent:

	export type ReadyToAcceptSecretFill = {
		idx: number
		srcEscrowDeployTxHash: string
		dstEscrowDeployTxHash: string
	}
*/
type ReadyToAcceptSecretFill struct {
	Idx                   int    `json:"idx"`
	SrcEscrowDeployTxHash string `json:"srcEscrowDeployTxHash"`
	DstEscrowDeployTxHash string `json:"dstEscrowDeployTxHash"`
}
