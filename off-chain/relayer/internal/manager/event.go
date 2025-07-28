package manager

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
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

		srcEvt, srcEscrowAddress, srcTimestamp, err := chain.FetchEvmSrcEscrowEvent(context.Background(), m.evmClient, srcTxHash, m.logger)
		if err != nil {
			m.logger.Printf("Error fetching EVM SrcEscrowCreatedEvent: %v", err)
			return
		}

		// verification checks
		if srcEvt.SrcImmutables.Amount.String() != orderEntry.Order.LimitOrder.MakingAmount {
			return
		}

		if srcEvt.SrcImmutables.Maker.Hex() != orderEntry.Order.LimitOrder.Maker {
			return
		}

		if srcEvt.SrcImmutables.SafetyDeposit.String() != quoteEntry.Quote.SrcSafetyDeposit {
			return
		}

		if srcEvt.SrcImmutables.Token.Hex() != quoteEntry.QuoteRequest.SrcTokenAddress {
			return
		}

		bal, err := chain.FetchERC20Balance(m.evmClient, srcEvt.SrcImmutables.Token, srcEscrowAddress)
		if err != nil {
			return
		}

		if bal.String() != orderEntry.Order.LimitOrder.MakingAmount {
			return
		}

		// TODO: Handle destination chain events & checks

		ttl := computeTTL(srcTimestamp, time.Now(), quoteEntry.Quote)
		if ttl > 0 {
			time.AfterFunc(ttl+SecretTTLBuffer, func() {
				m.allowSecretRelease(orderHash, srcEvt.SrcImmutables.Hashlock, srcTxHash.Hex(), dstTxHash)
			})
		} else {
			m.allowSecretRelease(orderHash, srcEvt.SrcImmutables.Hashlock, srcTxHash.Hex(), dstTxHash)
		}
	} else {
		srcTxHash := parts[1]
		dstTxHash := ethcommon.HexToHash(parts[2])

		dstEvt, dstTimestamp, err := chain.FetchEvmDstEscrowEvent(context.Background(), m.evmClient, dstTxHash)
		if err != nil {
			m.logger.Printf("Error fetching EVM DstEscrowCreatedEvent: %v", err)
			return
		}

		// verification checks
		bal, err := chain.FetchERC20Balance(m.evmClient, ethcommon.HexToAddress(quoteEntry.QuoteRequest.DstTokenAddress), dstEvt.Escrow)
		if err != nil {
			m.logger.Printf("Error fetching ERC20 balance: %v", err)
			return
		}

		if bal.String() != orderEntry.Order.LimitOrder.MakingAmount {
			return
		}

		// TODO: Handle src chain events & checks

		ttl := computeTTL(time.Now(), dstTimestamp, quoteEntry.Quote)
		if ttl > 0 {
			time.AfterFunc(ttl+SecretTTLBuffer, func() {
				m.allowSecretRelease(orderHash, dstEvt.Hashlock, srcTxHash, dstTxHash.Hex())
			})
		} else {
			m.allowSecretRelease(orderHash, dstEvt.Hashlock, srcTxHash, dstTxHash.Hex())
		}
	}
}

func computeTTL(srcTimestamp time.Time, dstTimestamp time.Time, quote *common.Quote) time.Duration {
	srcDuration := time.Since(srcTimestamp)
	dstDuration := time.Since(dstTimestamp)

	srcTTL := math.Max(float64(quote.TimeLocks.SrcWithdrawal)-srcDuration.Seconds(), 0)
	dstTTL := math.Max(float64(quote.TimeLocks.DstWithdrawal)-dstDuration.Seconds(), 0)

	return time.Duration(math.Max(srcTTL, dstTTL)) * time.Second
}

func (m *Manager) allowSecretRelease(orderHash string, hashlock ethcommon.Hash, srcTxHash string, dstTxHash string) {
	orderEntry, err := m.GetOrder(orderHash)
	if err != nil {
		m.logger.Printf("Error getting order for hash %s: %v", orderHash, err)
		return
	}

	orderEntry.FillsMutex.Lock()
	// partial fills
	if len(orderEntry.Order.SecretHashes) > 1 {
		for idx, secretHash := range orderEntry.Order.SecretHashes {
			if secretHash == hashlock.Hex() {
				orderEntry.OrderFills.Fills = append(orderEntry.OrderFills.Fills, common.ReadyToAcceptSecretFill{
					Idx:                   idx,
					SrcEscrowDeployTxHash: srcTxHash,
					DstEscrowDeployTxHash: dstTxHash,
				})
			}
		}
	} else {
		orderEntry.OrderFills.Fills = append(orderEntry.OrderFills.Fills, common.ReadyToAcceptSecretFill{
			Idx:                   0,
			SrcEscrowDeployTxHash: srcTxHash,
			DstEscrowDeployTxHash: dstTxHash,
		})
	}
	orderEntry.FillsMutex.Unlock()
}
