package chain

import (
	"context"
	"errors"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

// — ABI JSON for the event (only the SrcEscrowCreated part) —
const escrowABI = `[
	{
        "anonymous": false,
        "inputs": [
            {
                "components": [
                    {
                        "internalType": "bytes32",
                        "name": "orderHash",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "bytes32",
                        "name": "hashlock",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "Address",
                        "name": "maker",
                        "type": "uint256"
                    },
                    {
                        "internalType": "Address",
                        "name": "taker",
                        "type": "uint256"
                    },
                    {
                        "internalType": "Address",
                        "name": "token",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "amount",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "safetyDeposit",
                        "type": "uint256"
                    },
                    {
                        "internalType": "Timelocks",
                        "name": "timelocks",
                        "type": "uint256"
                    }
                ],
                "indexed": false,
                "internalType": "struct IBaseEscrow.Immutables",
                "name": "srcImmutables",
                "type": "tuple"
            },
            {
                "components": [
                    {
                        "internalType": "Address",
                        "name": "maker",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "amount",
                        "type": "uint256"
                    },
                    {
                        "internalType": "Address",
                        "name": "token",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "safetyDeposit",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "chainId",
                        "type": "uint256"
                    }
                ],
                "indexed": false,
                "internalType": "struct IEscrowFactory.DstImmutablesComplement",
                "name": "dstImmutablesComplement",
                "type": "tuple"
            }
        ],
        "name": "SrcEscrowCreated",
        "type": "event"
    }
]`

// --- Go types matching the Solidity structs, with `abi` tags for UnpackIntoInterface ---
type Immutables struct {
	OrderHash     common.Hash    `abi:"orderHash" json:"orderHash"`
	Hashlock      common.Hash    `abi:"hashlock" json:"hashlock"`
	Maker         common.Address `abi:"maker" json:"maker"`
	Taker         common.Address `abi:"taker" json:"taker"`
	Token         common.Address `abi:"token" json:"token"`
	Amount        *big.Int       `abi:"amount" json:"amount"`
	SafetyDeposit *big.Int       `abi:"safetyDeposit" json:"safetyDeposit"`
	Timelocks     *big.Int       `abi:"timelocks" json:"timelocks"`
}

type DstImmutablesComplement struct {
	Maker         common.Address `abi:"maker" json:"maker"`
	Amount        *big.Int       `abi:"amount" json:"amount"`
	Token         common.Address `abi:"token" json:"token"`
	SafetyDeposit *big.Int       `abi:"safetyDeposit" json:"safetyDeposit"`
	ChainId       *big.Int       `abi:"chainId" json:"chainId"`
}

type EvmSrcEscrowCreatedEvent struct {
	SrcImmutables           Immutables              `abi:"srcImmutables" json:"srcImmutables"`
	DstImmutablesComplement DstImmutablesComplement `abi:"dstImmutablesComplement" json:"dstImmutablesComplement"`
}

// FetchEvmSrcEscrowEvent pulls the SrcEscrowCreated event from txHash and parses it.
func FetchEvmSrcEscrowEvent(
	ctx context.Context,
	client *ethclient.Client,
	txHash common.Hash,
	logger *log.Logger,
) (*EvmSrcEscrowCreatedEvent, common.Address, time.Time, error) {
	// 1. Parse the ABI
	parsed, err := abi.JSON(strings.NewReader(escrowABI))
	if err != nil {
		return nil, common.Address{}, time.Time{}, err
	}

	// 2. Get the receipt
	receipt, err := client.TransactionReceipt(ctx, txHash)
	if err != nil {
		return nil, common.Address{}, time.Time{}, err
	}

	// 2a. Fetch the block timestamp
	timestamp, err := FetchTimeByBlockNumber(ctx, client, receipt.BlockNumber)
	if err != nil {
		return nil, common.Address{}, time.Time{}, err
	}

	// 3. Iterate logs to find our event
	sigHash := parsed.Events["SrcEscrowCreated"].ID
	for _, vLog := range receipt.Logs {
		if len(vLog.Topics) > 0 && vLog.Topics[0] == sigHash {

			// 4. Decode into our Go struct
			unpacked, err := parsed.Unpack("SrcEscrowCreated", vLog.Data)
			if err != nil {
				return nil, common.Address{}, time.Time{}, err
			}

			srcImmutables := unpacked[0].(struct {
				OrderHash     [32]uint8 `json:"orderHash"`
				Hashlock      [32]uint8 `json:"hashlock"`
				Maker         *big.Int  `json:"maker"`
				Taker         *big.Int  `json:"taker"`
				Token         *big.Int  `json:"token"`
				Amount        *big.Int  `json:"amount"`
				SafetyDeposit *big.Int  `json:"safetyDeposit"`
				Timelocks     *big.Int  `json:"timelocks"`
			})
			dstImmutablesComplement := unpacked[1].(struct {
				Maker         *big.Int `json:"maker"`
				Amount        *big.Int `json:"amount"`
				Token         *big.Int `json:"token"`
				SafetyDeposit *big.Int `json:"safetyDeposit"`
				ChainId       *big.Int `json:"chainId"`
			})

			evt := EvmSrcEscrowCreatedEvent{
				SrcImmutables: Immutables{
					OrderHash:     common.BytesToHash(srcImmutables.OrderHash[:]),
					Hashlock:      common.BytesToHash(srcImmutables.Hashlock[:]),
					Maker:         common.BigToAddress(srcImmutables.Maker),
					Taker:         common.BigToAddress(srcImmutables.Taker),
					Token:         common.BigToAddress(srcImmutables.Token),
					Amount:        srcImmutables.Amount,
					SafetyDeposit: srcImmutables.SafetyDeposit,
					Timelocks:     srcImmutables.Timelocks,
				},
				DstImmutablesComplement: DstImmutablesComplement{
					Maker:         common.BigToAddress(dstImmutablesComplement.Maker),
					Amount:        dstImmutablesComplement.Amount,
					Token:         common.BigToAddress(dstImmutablesComplement.Token),
					SafetyDeposit: dstImmutablesComplement.SafetyDeposit,
					ChainId:       dstImmutablesComplement.ChainId,
				},
			}

			logger.Printf("Fetching src escrow address for vLog.Address=%s", vLog.Address.String())
			srcEscrowAddress, err := FetchSrcEscrowAddress(ctx, client, vLog.Address, srcImmutables, logger)
			if err != nil {
				return nil, common.Address{}, time.Time{}, err
			}

			return &evt, srcEscrowAddress, timestamp, nil
		}
	}

	return nil, common.Address{}, time.Time{}, errors.New("SrcEscrowCreated event not found in transaction logs")
}

// ABI fragment containing only our event
const dstEscrowABI = `[
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "escrow",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "hashlock",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "Address",
                "name": "taker",
                "type": "uint256"
            }
        ],
        "name": "DstEscrowCreated",
        "type": "event"
    }
]`

// Go struct matching the event fields
type EvmDstEscrowCreatedEvent struct {
	Escrow   common.Address `abi:"escrow"`
	Hashlock [32]byte       `abi:"hashlock"`
	Taker    common.Address `abi:"taker"`
}

// FetchEvmDstEscrowEvent retrieves and parses the DstEscrowCreated event
// emitted by txHash, returning its strongly-typed Go struct.
func FetchEvmDstEscrowEvent(
	ctx context.Context,
	client *ethclient.Client,
	txHash common.Hash,
) (*EvmDstEscrowCreatedEvent, time.Time, error) {
	// 1. Parse the minimal ABI
	parsedABI, err := abi.JSON(strings.NewReader(dstEscrowABI))
	if err != nil {
		return nil, time.Time{}, err
	}

	// 2. Get the transaction receipt (contains all logs)
	receipt, err := client.TransactionReceipt(ctx, txHash)
	if err != nil {
		return nil, time.Time{}, err
	}

	// 2a. Fetch the block timestamp
	timestamp, err := FetchTimeByBlockNumber(ctx, client, receipt.BlockNumber)
	if err != nil {
		return nil, time.Time{}, err
	}

	// 3. Compute the event signature hash
	sig := parsedABI.Events["DstEscrowCreated"].ID

	// 4. Scan logs for our event
	for _, vLog := range receipt.Logs {
		if len(vLog.Topics) > 0 && vLog.Topics[0] == sig {
			unpacked, err := parsedABI.Unpack("DstEscrowCreated", vLog.Data)
			if err != nil {
				return nil, time.Time{}, err
			}

			escrow, ok := unpacked[0].(common.Address)
			if !ok {
				return nil, time.Time{}, errors.New("failed to unpack escrow address")
			}

			hashlock, ok := unpacked[1].([32]byte)
			if !ok {
				return nil, time.Time{}, errors.New("failed to unpack hashlock")
			}

			taker, ok := unpacked[2].(*big.Int)
			if !ok {
				return nil, time.Time{}, errors.New("failed to unpack taker address")
			}

			evt := EvmDstEscrowCreatedEvent{
				Escrow:   common.BytesToAddress(escrow[:]),
				Hashlock: hashlock,
				Taker:    common.BigToAddress(taker),
			}

			return &evt, timestamp, nil
		}
	}

	return nil, time.Time{}, errors.New("DstEscrowCreated event not found")
}

func FetchTimeByBlockNumber(
	ctx context.Context,
	client *ethclient.Client,
	blockNumber *big.Int,
) (time.Time, error) {
	block, err := client.BlockByNumber(ctx, blockNumber)
	if err != nil {
		return time.Time{}, err
	}

	return time.Unix(int64(block.Time()), 0), nil
}

func FetchERC20Balance(
	client *ethclient.Client,
	token common.Address,
	account common.Address,
) (*big.Int, error) {
	instance, err := NewChain(token, client)
	if err != nil {
		log.Fatal(err)
	}

	return instance.BalanceOf(&bind.CallOpts{}, account)
}

// EscrowFactory ABI for addressOfEscrowSrc function
const escrowFactoryABI = `[
  {
        "inputs": [
            {
                "components": [
                    {
                        "internalType": "bytes32",
                        "name": "orderHash",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "bytes32",
                        "name": "hashlock",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "Address",
                        "name": "maker",
                        "type": "uint256"
                    },
                    {
                        "internalType": "Address",
                        "name": "taker",
                        "type": "uint256"
                    },
                    {
                        "internalType": "Address",
                        "name": "token",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "amount",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "safetyDeposit",
                        "type": "uint256"
                    },
                    {
                        "internalType": "Timelocks",
                        "name": "timelocks",
                        "type": "uint256"
                    }
                ],
                "internalType": "struct IBaseEscrow.Immutables",
                "name": "immutables",
                "type": "tuple"
            }
        ],
        "name": "addressOfEscrowSrc",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
]`

// FetchSrcEscrowAddress calls the addressOfEscrowSrc function on the escrow factory contract
func FetchSrcEscrowAddress(
	ctx context.Context,
	client *ethclient.Client,
	factoryAddress common.Address,
	immutables struct {
		OrderHash     [32]byte `json:"orderHash"`
		Hashlock      [32]byte `json:"hashlock"`
		Maker         *big.Int `json:"maker"`
		Taker         *big.Int `json:"taker"`
		Token         *big.Int `json:"token"`
		Amount        *big.Int `json:"amount"`
		SafetyDeposit *big.Int `json:"safetyDeposit"`
		Timelocks     *big.Int `json:"timelocks"`
	},
	logger *log.Logger,
) (common.Address, error) {
	// Parse the ABI
	logger.Printf("Parsing ABI for escrow factory at %s", factoryAddress.String())
	parsedABI, err := abi.JSON(strings.NewReader(escrowFactoryABI))
	if err != nil {
		return common.Address{}, err
	}

	c := bind.NewBoundContract(factoryAddress, parsedABI, client, client, client)

	var out []any
	err = c.Call(
		&bind.CallOpts{Context: ctx},
		&out,
		"addressOfEscrowSrc",
		immutables,
	)
	if err != nil {
		logger.Printf("Error calling addressOfEscrowSrc: %v", err)
		return common.Address{}, err
	}

	return (out[0].(common.Address)), nil
}
