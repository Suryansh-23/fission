package chain

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/block-vision/sui-go-sdk/models"
	"github.com/block-vision/sui-go-sdk/sui"
	"github.com/ethereum/go-ethereum/common"
)

/*
Move event:

	public struct SrcEscrowCreated has copy, drop {
		id: ID,
		order_hash: vector<u8>,
		hashlock: vector<u8>,
		maker: address,
		taker: address,
		making_amount: u64,
		taking_amount: u64,
	}
*/
type SrcEscrowCreatedEvent struct {
	ID           models.ObjectId   // "0x..." object ID
	OrderHash    common.Hash       // raw bytes of the order hash
	Hashlock     common.Hash       // raw bytes of the hashlock
	Maker        models.SuiAddress // "0x..." address
	Taker        models.SuiAddress // "0x..." address
	MakingAmount *big.Int          // u64 decimal string
	TakingAmount *big.Int          // u64 decimal string
}

func (s *SrcEscrowCreatedEvent) String() string {
	panic("unimplemented")
}

func FetchMoveSrcEscrowEvent(ctx context.Context, cli *sui.Client, txDigest string) (*SrcEscrowCreatedEvent, time.Time, error) {
	timestamp, err := FetchMoveTimeByTx(ctx, cli, txDigest)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("fetching move time by tx: %w", err)
	}

	// Fetch events for this transaction.
	evResp, err := cli.SuiGetEvents(ctx, models.SuiGetEventsRequest{
		Digest: txDigest,
	})
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("fetching events: %w", err)
	}

	// The response can be:
	// - models.GetEventsResponse (which is []*models.SuiEventResponse)
	// - models.PaginatedEventsResponse (which has Data []models.SuiEventResponse)
	var events []*models.SuiEventResponse
	switch v := any(evResp).(type) {
	case models.GetEventsResponse:
		events = v
	case []*models.SuiEventResponse:
		events = v
	case models.PaginatedEventsResponse:
		events = make([]*models.SuiEventResponse, 0, len(v.Data))
		for i := range v.Data {
			ev := v.Data[i]
			events = append(events, &ev)
		}
	default:
		// Attempt best-effort JSON re-marshal if the concrete type is unknown.
		b, _ := json.Marshal(evResp)

		// Try pointer slice first.
		var ptrs []*models.SuiEventResponse
		if err := json.Unmarshal(b, &ptrs); err == nil && len(ptrs) > 0 {
			events = ptrs
			break
		}

		// Try { "data": []models.SuiEventResponse } (paginated shape).
		var tmp struct {
			Data []models.SuiEventResponse `json:"data"`
		}
		if err := json.Unmarshal(b, &tmp); err == nil && len(tmp.Data) > 0 {
			events = make([]*models.SuiEventResponse, 0, len(tmp.Data))
			for i := range tmp.Data {
				ev := tmp.Data[i]
				events = append(events, &ev)
			}
		}
	}

	if len(events) == 0 {
		return nil, time.Time{}, errors.New("no events found for transaction")
	}

	// Find the event whose Move type ends with ::SrcEscrowCreated
	const wantSuffix = "::SrcEscrowCreated"

	for _, ev := range events {
		if ev.Type == "" || !strings.HasSuffix(ev.Type, wantSuffix) {
			continue
		}

		id, err := models.NewHexData(ev.ParsedJson["id"].(string))
		if err != nil {
			return nil, time.Time{}, fmt.Errorf("invalid id hex: %w", err)
		}

		orderHash := common.HexToHash(ev.ParsedJson["order_hash"].(string))
		hashlock := common.BytesToHash(ev.ParsedJson["hashlock"].([]byte))
		maker := models.SuiAddress(ev.ParsedJson["maker"].(string))
		taker := models.SuiAddress(ev.ParsedJson["taker"].(string))

		makingAmount := new(big.Int)
		makingAmount.SetString(ev.ParsedJson["making_amount"].(string), 10)

		takingAmount := new(big.Int)
		takingAmount.SetString(ev.ParsedJson["taking_amount"].(string), 10)

		out := &SrcEscrowCreatedEvent{
			ID:           models.ObjectId(*id), // "0x..." object ID
			OrderHash:    orderHash,
			Hashlock:     hashlock,
			Maker:        maker,
			Taker:        taker,
			MakingAmount: makingAmount,
			TakingAmount: takingAmount,
		}

		return out, timestamp, nil
	}

	return nil, time.Time{}, fmt.Errorf("event %s not found in tx %s", wantSuffix, txDigest)
}

/*
Move event:

	public struct DstEscrowCreatedEvent has copy, drop {
	    id: ID,
	    hashlock: vector<u8>,
	    taker: address,
	    token_package_id: String,
	    amount: u64,
	}
*/
type DstEscrowCreatedEvent struct {
	ID             models.ObjectId   // "0x..." object ID
	Hashlock       common.Hash       // raw bytes of the hashlock (decoded)
	Taker          models.SuiAddress // "0x..." address
	TokenPackageID string
	Amount         *big.Int
}

// FetchMoveDstEscrowEvent fetches tx events and returns the first DstEscrowCreatedEvent found.
// cli is the BlockVision Sui client (e.g., sui.NewSuiClient(...)); txDigest is the Sui tx digest string.
func FetchMoveDstEscrowEvent(ctx context.Context, cli *sui.Client, txDigest string) (*DstEscrowCreatedEvent, time.Time, error) {
	timestamp, err := FetchMoveTimeByTx(ctx, cli, txDigest)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("fetching move time by tx: %w", err)
	}

	// Fetch events for this transaction.
	evResp, err := cli.SuiGetEvents(ctx, models.SuiGetEventsRequest{
		Digest: txDigest,
	})
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("fetching events: %w", err)
	}

	// The response can be:
	// - models.GetEventsResponse (which is []*models.SuiEventResponse)
	// - models.PaginatedEventsResponse (which has Data []models.SuiEventResponse)
	var events []*models.SuiEventResponse
	switch v := any(evResp).(type) {
	case models.GetEventsResponse:
		events = v
	case []*models.SuiEventResponse:
		events = v
	case models.PaginatedEventsResponse:
		events = make([]*models.SuiEventResponse, 0, len(v.Data))
		for i := range v.Data {
			ev := v.Data[i]
			events = append(events, &ev)
		}
	default:
		// Attempt best-effort JSON re-marshal if the concrete type is unknown.
		b, _ := json.Marshal(evResp)

		// Try pointer slice first.
		var ptrs []*models.SuiEventResponse
		if err := json.Unmarshal(b, &ptrs); err == nil && len(ptrs) > 0 {
			events = ptrs
			break
		}

		// Try { "data": []models.SuiEventResponse } (paginated shape).
		var tmp struct {
			Data []models.SuiEventResponse `json:"data"`
		}
		if err := json.Unmarshal(b, &tmp); err == nil && len(tmp.Data) > 0 {
			events = make([]*models.SuiEventResponse, 0, len(tmp.Data))
			for i := range tmp.Data {
				ev := tmp.Data[i]
				events = append(events, &ev)
			}
		}
	}

	if len(events) == 0 {
		return nil, time.Time{}, errors.New("no events found for transaction")
	}

	// Find the event whose Move type ends with ::DstEscrowCreatedEvent
	const wantSuffix = "::DstEscrowCreatedEvent"
	// const wantSuffix = "::InterestUpdateEvent"	// testing

	for _, ev := range events {
		if ev.Type == "" || !strings.HasSuffix(ev.Type, wantSuffix) {
			continue
		}

		fmt.Println("Found DstEscrowCreatedEvent:", ev.ParsedJson)

		/*
			// Marshal ParsedJson back to bytes to decode into a strongly-typed wire struct.
			raw, err := json.Marshal(ev.ParsedJson)
			if err != nil {
				return nil, "", fmt.Errorf("marshal parsedJson: %w", err)
			}

			// Hashlock may come as a string (hex/base64) or a JSON array of numbers.
			var wire struct {
				ID             string `json:"id"`
				Hashlock       string `json:"hashlock"`
				Taker          string `json:"taker"`
				TokenPackageID string `json:"token_package_id"`
				Amount         string `json:"amount"` // u64 decimal string
			}
			if err := json.Unmarshal(raw, &wire); err != nil {
				return nil, "", fmt.Errorf("unmarshal event fields: %w", err)
			}

			hashlockBytes, err := parseHashlock(wire.Hashlock)
			if err != nil {
				return nil, "", fmt.Errorf("decode hashlock: %w", err)
			}

			amountU64, err := strconv.ParseUint(wire.Amount, 10, 64)
			if err != nil {
				return nil, "", fmt.Errorf("parse amount u64: %w", err)
			}

			idHex, err := models.NewHexData(wire.ID)
			if err != nil {
				return nil, "", fmt.Errorf("invalid id hex: %w", err)
			}
		*/

		id, err := models.NewHexData(ev.ParsedJson["id"].(string))
		if err != nil {
			return nil, time.Time{}, fmt.Errorf("invalid id hex: %w", err)
		}

		hashlock := common.BytesToHash(ev.ParsedJson["hashlock"].([]byte))
		taker := models.SuiAddress(ev.ParsedJson["taker"].(string))

		amount := new(big.Int)
		amount.SetString(ev.ParsedJson["amount"].(string), 10)

		out := &DstEscrowCreatedEvent{
			ID:             models.ObjectId(*id), // "0x..." object ID
			Hashlock:       hashlock,
			Taker:          taker,
			TokenPackageID: ev.ParsedJson["token_package_id"].(string),
			Amount:         amount,
		}

		return out, timestamp, nil
	}

	return nil, time.Time{}, fmt.Errorf("event %s not found in tx %s", wantSuffix, txDigest)
}

func FetchMoveTimeByTx(
	ctx context.Context,
	cli *sui.Client,
	txDigest string,
) (time.Time, error) {
	txResp, err := cli.SuiGetTransactionBlock(ctx, models.SuiGetTransactionBlockRequest{
		Digest: txDigest,
	})
	if err != nil {
		return time.Time{}, fmt.Errorf("fetching transaction block: %w", err)
	}

	ts, err := strconv.Atoi(txResp.TimestampMs)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid timestamp: %w", err)
	}
	return time.UnixMilli(int64(ts)), nil
}

// FetchCoinFieldBalance looks up a nested field on a Move object that is a Coin<T>
// (or a Balance<T>) and returns its numeric balance as uint64.
//
// - cli:       BlockVision Sui client (sui.NewSuiClient(...))
// - objectID:  the parent object id that contains the field
// - fieldPath: dot-separated path to the field (e.g. "coin", "vault.coin", "inner.vault.coin")
//
// It supports both of these storage styles inside the parent Move object:
//
//	struct Vault<T> { coin: 0x2::coin::Coin<T> }                  // balance at fields.coin.fields.balance
//	struct Vault<T> { bal:  0x2::balance::Balance<T> }            // balance at fields.bal.fields.value
func FetchCoinFieldBalance(
	ctx context.Context,
	cli *sui.Client,
	objectID string,
	fieldPath string,
) (*big.Int, error) {

	if cli == nil {
		return nil, errors.New("nil Sui client")
	}
	if objectID == "" {
		return nil, errors.New("empty object id")
	}
	if fieldPath == "" {
		return nil, errors.New("empty field path")
	}

	// 1) Fetch the object with parsed Move content.
	resp, err := cli.SuiGetObject(ctx, models.SuiGetObjectRequest{
		ObjectId: objectID,
		Options: models.SuiObjectDataOptions{
			ShowContent: true, // we need the Move fields
			ShowType:    true, // optional, useful for debugging
		},
	})
	if err != nil {
		return nil, fmt.Errorf("SuiGetObject failed: %w", err)
	}
	if resp.Data == nil || resp.Data.Content == nil {
		return nil, fmt.Errorf("object %s has no parsed content", objectID)
	}
	if strings.ToLower(resp.Data.Content.DataType) != "moveobject" {
		return nil, fmt.Errorf("object %s is not a Move object", objectID)
	}

	// 2) Walk the dotted path down the nested "fields" maps.
	fields := resp.Data.Content.Fields // map[string]interface{}
	if fields == nil {
		return nil, fmt.Errorf("object %s has empty fields", objectID)
	}
	segments := strings.Split(fieldPath, ".")
	var node any = fields

	for i, seg := range segments {
		// At each level `node` must be the "fields" map of the current struct.
		m, ok := node.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("path '%s': level %d is not a fields map", fieldPath, i)
		}
		child, ok := m[seg]
		if !ok {
			return nil, fmt.Errorf("path '%s': field '%s' not found", fieldPath, seg)
		}
		// Each Move struct/enum node is represented as { "type": "...", "fields": { ... } }.
		childMap, ok := child.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("path '%s': field '%s' is not an object", fieldPath, seg)
		}
		next, ok := childMap["fields"]
		if !ok {
			return nil, fmt.Errorf("path '%s': field '%s' has no 'fields' subtree", fieldPath, seg)
		}
		node = next
	}

	// 3) We are now inside the inner "fields" map of either Coin<T> or Balance<T>.
	leaf, ok := node.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("path '%s': leaf is not a fields map", fieldPath)
	}

	// Prefer Coin<T>.fields.balance; fall back to Balance<T>.fields.value.
	var raw any
	if b, ok := leaf["balance"]; ok {
		raw = b // Coin<T>
	} else if v, ok := leaf["value"]; ok {
		raw = v // Balance<T>
	} else {
		return nil, fmt.Errorf("path '%s': neither 'balance' nor 'value' found", fieldPath)
	}

	// JSON-RPC returns numeric fields as strings; parse to uint64.
	rawStr, ok := raw.(string)
	if !ok {
		return nil, fmt.Errorf("path '%s': balance/value is not a string", fieldPath)
	}
	amount := new(big.Int)
	amount.SetString(rawStr, 10)

	return amount, nil
}
