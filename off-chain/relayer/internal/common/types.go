package common

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
type QuoteResponse struct {
	QuoteID           string        `json:"quoteId"`
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
type QuoterPresets struct {
	Fast   PresetData  `json:"fast"`
	Medium PresetData  `json:"medium"`
	Slow   PresetData  `json:"slow"`
	Custom *PresetData `json:"custom,omitempty"` // Optional field
}

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
	RelayerSignature string     `json:"relayerSignature, omitempty"` // Optional field
	Signature        string     `json:"signature"`
	QuoteID          string     `json:"quoteId"`
	Extension        string     `json:"extension"`
	SecretHashes     []string   `json:"secretHashes"`
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
	MakerTraits  string `json:"makerTraits"`
}
