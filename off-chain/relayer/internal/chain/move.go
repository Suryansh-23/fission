package chain

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/block-vision/sui-go-sdk/models"
	"github.com/block-vision/sui-go-sdk/sui"
)

// Go representation of the Move event:
//
//	public struct DstEscrowCreatedEvent has copy, drop {
//	    id: ID,
//	    hashlock: vector<u8>,
//	    taker: address,
//	    token_package_id: String,
//	    amount: u64,
//	}
type DstEscrowCreatedEvent struct {
	ID             models.ObjectId   // "0x..." object ID
	Hashlock       []byte            // raw bytes of the hashlock (decoded)
	Taker          models.SuiAddress // "0x..." address
	TokenPackageID string
	Amount         uint64
}

// FetchMoveDstEscrowEvent fetches tx events and returns the first DstEscrowCreatedEvent found.
// cli is the BlockVision Sui client (e.g., sui.NewSuiClient(...)); txDigest is the Sui tx digest string.
func FetchMoveDstEscrowEvent(ctx context.Context, cli *sui.Client, txDigest string) (*DstEscrowCreatedEvent, string, error) {
	// Fetch events for this transaction.
	evResp, err := cli.SuiGetEvents(ctx, models.SuiGetEventsRequest{
		Digest: txDigest,
	})
	if err != nil {
		return nil, "", fmt.Errorf("fetching events: %w", err)
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
		return nil, "", errors.New("no events found for transaction")
	}

	// Find the event whose Move type ends with ::DstEscrowCreatedEvent
	const wantSuffix = "::DstEscrowCreatedEvent"

	for _, ev := range events {
		if ev.Type == "" || !strings.HasSuffix(ev.Type, wantSuffix) {
			continue
		}

		// Marshal ParsedJson back to bytes to decode into a strongly-typed wire struct.
		raw, err := json.Marshal(ev.ParsedJson)
		if err != nil {
			return nil, "", fmt.Errorf("marshal parsedJson: %w", err)
		}

		// Hashlock may come as a string (hex/base64) or a JSON array of numbers.
		var wire struct {
			ID             string          `json:"id"`
			Hashlock       json.RawMessage `json:"hashlock"`
			Taker          string          `json:"taker"`
			TokenPackageID string          `json:"token_package_id"`
			Amount         string          `json:"amount"` // u64 decimal string
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

		out := &DstEscrowCreatedEvent{
			ID:             models.ObjectId(*idHex),
			Hashlock:       hashlockBytes,
			Taker:          models.SuiAddress(wire.Taker),
			TokenPackageID: wire.TokenPackageID,
			Amount:         amountU64,
		}
		return out, ev.TimestampMs, nil
	}

	return nil, "", fmt.Errorf("event %s not found in tx %s", wantSuffix, txDigest)
}

// parseHashlock accepts either a hex/base64 string or a JSON array of numbers (0..255).
func parseHashlock(raw json.RawMessage) ([]byte, error) {
	if len(raw) == 0 {
		return nil, nil
	}

	// Try as string first: could be "0x..." hex OR base64.
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return decodeBytesString(s)
	}

	// Try as array of numbers.
	var ints []int
	if err := json.Unmarshal(raw, &ints); err == nil {
		out := make([]byte, len(ints))
		for i, v := range ints {
			if v < 0 || v > 255 {
				return nil, fmt.Errorf("hashlock element out of byte range: %d", v)
			}
			out[i] = byte(v)
		}
		return out, nil
	}

	// Fallback: try generic array of any -> coerce floats
	var anys []any
	if err := json.Unmarshal(raw, &anys); err == nil {
		out := make([]byte, len(anys))
		for i, v := range anys {
			f, ok := v.(float64)
			if !ok || f < 0 || f > 255 {
				return nil, fmt.Errorf("hashlock element not a byte: %v", v)
			}
			out[i] = byte(f)
		}
		return out, nil
	}

	return nil, fmt.Errorf("unsupported hashlock JSON: %s", string(raw))
}

// decodeBytesString accepts either a hex string with optional "0x" prefix,
// or a base64 string, and returns the raw bytes.
func decodeBytesString(s string) ([]byte, error) {
	if s == "" {
		return nil, nil
	}
	if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
		return hex.DecodeString(strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X"))
	}
	// Fall back to base64.
	return base64.StdEncoding.DecodeString(s)
}
