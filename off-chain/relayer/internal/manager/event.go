package manager

import (
	"context"
	"encoding/json"
	"fmt"

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
	srcTxHash := ethcommon.HexToHash(parts[1])
	dstTxHash := parts[2]

	orderEntry, err := m.GetOrder(orderHash)
	if err != nil {
		m.logger.Printf("Error getting order for hash %s: %v", orderHash, err)
		return false
	}

	// src chain is Ethereum
	if (*orderEntry.Order.SrcChainID).Eq(common.EthereumMainnet) {
		evt, srcEscrowAddress, timestamp, err := chain.FetchEvmSrcEscrowEvent(context.Background(), m.evmClient, srcTxHash, m.logger)
		if err != nil {
			m.logger.Printf("Error fetching EVM SrcEscrowCreatedEvent: %v", err)
			return false
		}

		if evt.SrcImmutables.

	} else {
	}

	// m.logger.Printf("Received tx hash event: orderHash=%s, srcTxHash=%s, dstTxHash=%s", orderHash, srcTxHash, dstTxHash)

	// evt, srcEscrowAddress, timestamp, err := chain.FetchEvmSrcEscrowEvent(context.Background(), m.evmClient, srcTxHash, m.logger)
	// if err != nil {
	// 	m.logger.Printf("Error fetching EVM SrcEscrowCreatedEvent: %v", err)
	// 	return fmt.Errorf("failed to fetch event: %w", err)
	// }

	// m.logger.Printf("Fetched EVM SrcEscrowCreatedEvent: %+v @ address %s at timestamp %s", evt, srcEscrowAddress, timestamp.String())

	// evt, timestamp, err := chain.FetchEvmDstEscrowEvent(context.Background(), m.evmClient, srcTxHash)
	// if err != nil {
	// 	m.logger.Printf("Error fetching EVM DstEscrowCreatedEvent: %v", err)
	// 	return fmt.Errorf("failed to fetch event: %w", err)
	// }

	// m.logger.Printf("Fetched EVM DstEscrowCreatedEvent: %+v at timestamp %s", evt, timestamp.String())

	return nil
}
