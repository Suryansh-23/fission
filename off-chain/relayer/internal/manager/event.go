package manager

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/big"
	"time"

	"relayer/internal/chain"
	"relayer/internal/common"

	ethcommon "github.com/ethereum/go-ethereum/common"

	"strings"
)

func (m *Manager) HandleOrderEvent(order common.Order) error {
	op := []byte(ORDER_EVENT + " ")
	orderBytes, err := json.Marshal(order)
	if err != nil {
		return err
	}

	orderBytes = append(op, orderBytes...)
	m.Broadcast(orderBytes)
	return nil
}

func (m *Manager) HandleSecretEvent(secret common.Secret) error {
	op := []byte(SECRET_EVENT + " ")
	secretBytes := []byte(secret.OrderHash + " " + secret.Secret)
	secretBytes = append(op, secretBytes...)

	m.Broadcast(secretBytes)
	return nil
}

func (m *Manager) HandleReceiveEvent(event []byte) error {
	msg := string(event)
	m.logger.Printf("Received event: %s", msg)

	parts := strings.Split(msg, " ")
	switch parts[0] {
	case TXHASH_EVENT:
		m.logger.Printf("Received tx hash event: %s", msg)
		m.handleTxHashEvent(parts[1:])
	default:
		return fmt.Errorf("unknown event type: %s", parts[0])
	}

	return nil
}

func (m *Manager) handleTxHashEvent(parts []string) {
	if len(parts) != 3 {
		m.logger.Printf("invalid tx hash event format, expected 3 parts, got %d", len(parts))
		return
	}

	orderHash := parts[0]
	orderEntry, err := m.GetOrder(orderHash)
	if err != nil {
		m.logger.Printf("Error getting order for hash %s: %v", orderHash, err)
		return
	}

	quoteEntry, err := m.GetQuote(orderEntry.Order.QuoteID)
	if err != nil {
		m.logger.Printf("Error getting quote for order %s: %v", orderHash, err)
		return
	}

	// src chain is Ethereum
	if (*orderEntry.Order.SrcChainID).Eq(common.EthereumMainnet) {
		srcTxHash := ethcommon.HexToHash(parts[1])
		dstTxHash := parts[2]

		srcEvt, _, srcTimestamp, err := chain.FetchEvmSrcEscrowEvent(context.Background(), m.evmClient, srcTxHash)
		if err != nil {
			m.logger.Printf("Error fetching EVM SrcEscrowCreatedEvent: %v", err)
			m.logger.Printf("failed to fetch EVM SrcEscrowCreatedEvent: %s", err.Error())
			return
		}

		dstEvt, dstTimestamp, err := chain.FetchMoveDstEscrowEvent(context.Background(), m.suiClient, dstTxHash)
		if err != nil {
			m.logger.Printf("Error fetching Move DstEscrowCreatedEvent: %v", err)
			m.logger.Printf("failed to fetch Move DstEscrowCreatedEvent: %s", err.Error())
			return
		}

		// verification checks
		// P0 - correct hashlocks
		srcHashlock := srcEvt.SrcImmutables.Hashlock.Hex()
		dstHashlock := dstEvt.Hashlock.Hex()
		if srcHashlock != dstHashlock {
			m.logger.Printf("hashlock mismatch: expected dst hashlock to be %s, got %s", srcHashlock, dstHashlock)
			return
		}

		isHashPresent := false
		hashIdx := -1
		for idx, secretHash := range orderEntry.Order.SecretHashes {
			if secretHash == srcHashlock {
				isHashPresent = true
				hashIdx = idx
				break
			}
		}

		if !isHashPresent {
			m.logger.Printf("hashlock not found in order secrets: %s", srcHashlock)
			return
		}

		// P1 checks
		// if srcEvt.SrcImmutables.Amount.String() != orderEntry.Order.LimitOrder.MakingAmount {
		// m.logger.Printf("src amount mismatch: expected %s, got %s", orderEntry.Order.LimitOrder.MakingAmount, srcEvt.SrcImmutables.Amount.String())
		// 	return
		// }

		// src checks
		// maker is same as order
		if srcEvt.SrcImmutables.Maker.Hex() != orderEntry.Order.LimitOrder.Maker {
			m.logger.Printf("src maker mismatch: expected %s, got %s", orderEntry.Order.LimitOrder.Maker, srcEvt.SrcImmutables.Maker.Hex())
			return
		}

		// correct safety deposit
		if srcEvt.SrcImmutables.SafetyDeposit.String() != quoteEntry.Quote.SrcSafetyDeposit {
			m.logger.Printf("src safety deposit mismatch: expected %s, got %s", quoteEntry.Quote.SrcSafetyDeposit, srcEvt.SrcImmutables.SafetyDeposit.String())
			return
		}

		// correct making token type
		if srcEvt.SrcImmutables.Token.Hex() != orderEntry.Order.LimitOrder.MakerAsset {
			m.logger.Printf("src token mismatch: expected %s, got %s", orderEntry.Order.LimitOrder.MakerAsset, srcEvt.SrcImmutables.Token.Hex())
			return
		}

		// correct making amount
		// if srcEvt.SrcImmutables.Amount.String() != orderEntry.Order.LimitOrder.MakingAmount {
		// 	m.logger.Printf("src amount mismatch: expected %s, got %s", orderEntry.Order.LimitOrder.MakingAmount, srcEvt.SrcImmutables.Amount.String())
		// 	return
		// }

		// // if balance for the token is there
		// srcBal, err := chain.FetchERC20Balance(m.evmClient, srcEvt.SrcImmutables.Token, srcEscrowAddress)
		// if err != nil {
		// 	m.logger.Printf("failed to fetch ERC20 balance: %s", err.Error())
		// 	return
		// }

		// if srcBal.Cmp(big.NewInt(0)) != +1 {
		// 	m.logger.Printf("src escrow balance is zero for %s: %s", srcEvt.SrcImmutables.Token.Hex(), srcBal.String())
		// 	return
		// }

		// dst checks
		// correct taking token type with dstImmutables & order
		// if srcEvt.DstImmutablesComplement.Token.Hex() != dstEvt.TokenPackageID || srcEvt.DstImmutablesComplement.Token.Hex() != orderEntry.Order.LimitOrder.TakerAsset {
		// 	m.logger.Printf("dst token mismatch: expected %s, got %s", dstEvt.TokenPackageID, srcEvt.DstImmutablesComplement.Token.Hex())
		// 	return
		// }

		// if amount mismatch
		if srcEvt.DstImmutablesComplement.Amount.String() != dstEvt.Amount.String() {
			m.logger.Printf("dst amount mismatch: expected %s, got %s", orderEntry.Order.LimitOrder.TakingAmount, srcEvt.DstImmutablesComplement.Amount.String())
			return
		}

		// no need to check for dst safety deposit token type because of move
		// correct dst safety deposit amount
		dstSafetyDeposit, err := chain.FetchCoinFieldBalance(context.Background(), m.suiClient, string(dstEvt.ID.Data()), "safety_deposit")
		if err != nil {
			m.logger.Printf("failed to fetch CoinField balance: %s", err.Error())
			return
		}

		quoteDstSafetyDep := new(big.Int)
		quoteDstSafetyDep.SetString(quoteEntry.Quote.DstSafetyDeposit, 10)

		if srcEvt.DstImmutablesComplement.SafetyDeposit.Cmp(quoteDstSafetyDep) != 0 || dstSafetyDeposit.Cmp(quoteDstSafetyDep) != 0 {
			m.logger.Printf("dst safety deposit mismatch: expected %s, got %s", quoteEntry.Quote.DstSafetyDeposit, dstSafetyDeposit.String())
			return
		}

		// correct dst taking amount
		dstBal, err := chain.FetchCoinFieldBalance(context.Background(), m.suiClient, string(dstEvt.ID.Data()), "deposit")
		if err != nil {
			m.logger.Printf("failed to fetch CoinField balance: %s", err.Error())
			return
		}

		if dstBal.Cmp(big.NewInt(0)) != +1 {
			m.logger.Printf("dst escrow balance is zero for %s: %s", dstEvt.ID.Data(), dstBal.String())
			return
		}

		ttl := computeTTL(srcTimestamp, dstTimestamp, quoteEntry.Quote)
		if ttl > 0 {
			time.AfterFunc(ttl+SecretTTLBuffer, func() {
				m.allowSecretRelease(orderHash, hashIdx, srcTxHash.Hex(), dstTxHash)
			})
		} else {
			m.allowSecretRelease(orderHash, hashIdx, srcTxHash.Hex(), dstTxHash)
		}
	} else {
		srcTxHash := parts[1]
		dstTxHash := ethcommon.HexToHash(parts[2])

		dstEvt, dstTimestamp, err := chain.FetchEvmDstEscrowEvent(context.Background(), m.evmClient, dstTxHash)
		if err != nil {
			m.logger.Printf("Error fetching EVM DstEscrowCreatedEvent: %v", err)
			return
		}

		srcEvt, srcTimestamp, err := chain.FetchMoveSrcEscrowEvent(context.Background(), m.suiClient, srcTxHash)
		if err != nil {
			m.logger.Printf("Error fetching Move SrcEscrowCreatedEvent: %v", err)
			return
		}

		// verification checks
		// P0 - correct hashlocks
		srcHashlock := srcEvt.Hashlock.Hex()
		dstHashlock := dstEvt.Hashlock.Hex()
		if srcHashlock != dstHashlock {
			m.logger.Printf("hashlock mismatch: expected dst hashlock to be %s, got %s", srcHashlock, dstHashlock)
			return
		}

		isHashPresent := false
		hashIdx := -1
		for idx, secretHash := range orderEntry.Order.SecretHashes {
			if secretHash == srcHashlock {
				isHashPresent = true
				hashIdx = idx
				break
			}
		}

		if !isHashPresent {
			m.logger.Printf("hashlock not found in order secrets: %s", srcHashlock)
			return
		}

		// maker is same as order
		if string(srcEvt.Maker) != orderEntry.Order.LimitOrder.Maker {
			m.logger.Printf("src maker mismatch: expected %s, got %s", orderEntry.Order.LimitOrder.Maker, srcEvt.Maker)
			return
		}

		// safetDeposit, err := chain.Fetch

		// correct safety deposit
		// if srcEvt.String() != quoteEntry.Quote.SrcSafetyDeposit {
		// 	m.logger.Printf("src safety deposit mismatch: expected %s, got %s", quoteEntry.Quote.SrcSafetyDeposit, srcEvt.SafetyDeposit.String())
		// 	return
		// }

		bal, err := chain.FetchERC20Balance(m.evmClient, ethcommon.HexToAddress(quoteEntry.QuoteRequest.DstTokenAddress), dstEvt.Escrow)
		if err != nil {
			m.logger.Printf("Error fetching ERC20 balance: %v", err)
			return
		}

		if bal.String() != orderEntry.Order.LimitOrder.MakingAmount {
			return
		}

		ttl := computeTTL(srcTimestamp, dstTimestamp, quoteEntry.Quote)
		if ttl > 0 {
			time.AfterFunc(ttl+SecretTTLBuffer, func() {
				m.allowSecretRelease(orderHash, hashIdx, srcTxHash, dstTxHash.Hex())
			})
		} else {
			m.allowSecretRelease(orderHash, hashIdx, srcTxHash, dstTxHash.Hex())
		}
	}
}

func computeTTL(_ time.Time, dstTimestamp time.Time, _ *common.Quote) time.Duration {
	dstDuration := time.Since(dstTimestamp)

	return time.Duration(math.Max(2-dstDuration.Seconds(), 0) * float64(time.Second))
}

func (m *Manager) allowSecretRelease(orderHash string, hashIdx int, srcTxHash string, dstTxHash string) {
	orderEntry, err := m.GetOrder(orderHash)
	if err != nil {
		m.logger.Printf("Error getting order for hash %s: %v", orderHash, err)
		return
	}

	orderEntry.OrderMutMutex.Lock()
	defer orderEntry.OrderMutMutex.Unlock()

	orderEntry.OrderFills.Fills = append(orderEntry.OrderFills.Fills, common.ReadyToAcceptSecretFill{
		Idx:                   hashIdx,
		SrcEscrowDeployTxHash: srcTxHash,
		DstEscrowDeployTxHash: dstTxHash,
	})
}
