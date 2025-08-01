package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"relayer/internal/common"
	"relayer/internal/hash"
	"relayer/internal/manager"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/schema"
)

func (s *APIServer) RegisterRoutes() http.Handler {
	router := gin.New()

	// Register routes
	router.GET("/", s.DefaultHandler) // test handler

	router.GET("/quoter/v1.0/quote/receive", s.GetQuote)
	router.POST("/relayer/v1.0/submit", s.SubmitOrder)
	router.POST("/relayer/v1.0/submit/secret", s.SubmitSecret)
	router.GET("/orders/v1.0/order/ready-to-accept-secret-fills/:orderHash", s.GetReadyToAcceptSecretFills)
	router.GET("/orders/v1.0/order/status/:orderHash", s.GetOrderStatus)
	// Wrap the router with CORS middleware
	return s.corsMiddleware(router)
}

func (s *APIServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*") // Replace "*" with specific origins if needed
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-CSRF-Token")
		w.Header().Set("Access-Control-Allow-Credentials", "false") // Set to "true" if credentials are required

		// Handle preflight OPTIONS requests
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Proceed with the next handler
		next.ServeHTTP(w, r)
	})
}

var encoder = schema.NewEncoder()

func buildQuoteRequestParams(base string, params common.QuoteRequestParams) (string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return "", err
	}

	values := url.Values{}
	if err := encoder.Encode(params, values); err != nil {
		return "", err
	}

	u.RawQuery = values.Encode()
	return u.String(), nil
}

func (s *APIServer) GetQuote(c *gin.Context) {
	s.logger.Println()
	defer s.logger.Println()

	queryParams := common.QuoteRequestParams{
		SrcChain:        c.Query("srcChain"),
		DstChain:        c.Query("dstChain"),
		SrcTokenAddress: c.Query("srcTokenAddress"),
		DstTokenAddress: c.Query("dstTokenAddress"),
		Amount:          c.Query("amount"),
		WalletAddress:   c.Query("walletAddress"),
	}

	var quoteResponse common.Quote
	if !s.devMode {
		s.logger.Println("Running in dev mode, using default quote response")

		// build the url string to fetch
		urlString, err := buildQuoteRequestParams(s.baseURL, queryParams)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid query parameters"})
			return
		}

		req, err := http.NewRequest(http.MethodGet, urlString, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create HTTP request"})
			return
		}

		req.Header.Set("Authorization", "Bearer "+s.authKey)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch quote"})
			return
		}
		defer resp.Body.Close()

		if err := json.NewDecoder(resp.Body).Decode(&quoteResponse); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode quote response from 1inch Fusion+ API"})
			return
		}
	} else {
		quoteResponse = *s.defaultQuote
		quoteResponse.QuoteID = uuid.New()
	}

	s.manager.SetQuote(manager.QuoteEntry{
		QuoteID:      quoteResponse.QuoteID,
		QuoteRequest: &queryParams,
		Quote:        &quoteResponse,
	})

	c.JSON(http.StatusOK, quoteResponse)
}

func (s *APIServer) SubmitOrder(c *gin.Context) {
	s.logger.Println()
	defer s.logger.Println()

	body := c.Request.Body
	defer body.Close()

	order := common.Order{}
	if err := json.NewDecoder(body).Decode(&order); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order data"})
		s.logger.Printf("Failed to decode order data: %v", err)
		return
	}
	s.logger.Printf("Received order @ ID: %s", order.QuoteID)
	s.logger.Println("Order details:", order.SecretHashes)

	hash, err := hash.GetOrderHashForLimitOrder(order.SrcChainID, order.LimitOrder)
	if err != nil {
		s.logger.Printf("Error computing order hash: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to compute order hash"})
		return
	}
	s.logger.Printf("Order hash: %s", hash.Hex())

	if err := s.manager.HandleOrderEvent(order); err != nil {
		s.logger.Printf("Error handling order event: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to handle order event"})
		return
	}

	orderStatus, err := buildOrderStatus(&order, s.manager)
	if err != nil {
		s.logger.Printf("Error building order status: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build order status"})
		return
	}

	var orderType manager.OrderType
	if len(order.SecretHashes) > 0 {
		orderType = manager.MultiFill
	} else {
		orderType = manager.SingleFill
	}

	s.manager.SetOrder(manager.OrderEntry{
		OrderType:   orderType,
		OrderHash:   hash,
		Order:       &order,
		OrderStatus: orderStatus,
		OrderFills: &common.ReadyToAcceptSecretFills{
			Fills: make([]common.ReadyToAcceptSecretFill, 0),
		},
		OrderMutMutex: new(sync.Mutex),
	})

	s.logger.Printf("Order broadcasted @ ID: %s", order.QuoteID)
}

func (s *APIServer) SubmitSecret(c *gin.Context) {
	s.logger.Println()
	defer s.logger.Println()

	body := c.Request.Body
	defer body.Close()

	secret := common.Secret{}
	if err := json.NewDecoder(body).Decode(&secret); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid secret submission"})
		s.logger.Printf("Failed to decode secret submission data: %v", err)
		return
	}

	s.logger.Printf("Received secret submission: %+v for order: %+v", secret.Secret, secret.OrderHash)
	if err := s.manager.HandleSecretEvent(secret); err != nil {
		s.logger.Printf("Error handling secret event: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to handle secret event"})
		return
	}
}

func (s *APIServer) GetOrderStatus(c *gin.Context) {
	s.logger.Println()
	defer s.logger.Println()

	orderHash := c.Param("orderHash")
	if orderHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order hash is required"})
		return
	}

	s.logger.Printf("Fetching order status for hash: %s", orderHash)

	orderEntry, err := s.manager.GetOrder(orderHash)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}

	orderStatus := orderEntry.OrderStatus
	if orderStatus == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order status not found"})
		return
	}

	c.JSON(http.StatusOK, orderStatus)
}

func (s *APIServer) GetReadyToAcceptSecretFills(c *gin.Context) {
	s.logger.Println()
	defer s.logger.Println()

	orderHash := c.Param("orderHash")
	if orderHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order hash is required"})
		return
	}

	orderEntry, err := s.manager.GetOrder(orderHash)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}

	// lock and borrow ref
	orderEntry.OrderMutMutex.Lock()
	fills := orderEntry.OrderFills.Fills

	// replace old ref with new
	orderEntry.OrderFills.Fills = make([]common.ReadyToAcceptSecretFill, 0, cap(fills)/2)
	orderEntry.OrderMutMutex.Unlock()

	if len(fills) == 0 {
		c.JSON(http.StatusOK, common.ReadyToAcceptSecretFills{
			Fills: []common.ReadyToAcceptSecretFill{},
		})
		return
	}

	readyToAcceptSecretFills := common.ReadyToAcceptSecretFills{
		Fills: fills,
	}

	c.JSON(http.StatusOK, readyToAcceptSecretFills)
}

func (s *APIServer) DefaultHandler(c *gin.Context) {
	msg := c.Query("msg")
	if msg == "" {
		msg = "Hello, World!"
	}

	s.manager.Broadcast([]byte(msg))
	c.String(http.StatusOK, "Message broadcasted: %s", msg)
}

func buildOrderStatus(order *common.Order, manager *manager.Manager) (*common.OrderStatus, error) {
	quote, err := manager.GetQuote(order.QuoteID)
	if err != nil {
		return nil, err
	}

	return &common.OrderStatus{
		Status:              common.OrderStatusPending,
		Order:               &order.LimitOrder,
		Extension:           order.Extension,
		Points:              quote.Quote.Presets[quote.Quote.RecommendedPreset].Points,
		CreatedAt:           time.Now().Format(time.RFC3339),
		InitialRateBump:     quote.Quote.Presets[quote.Quote.RecommendedPreset].InitialRateBump,
		FromTokenToUsdPrice: quote.Quote.Prices.USD.SrcToken,
		ToTokenToUsdPrice:   quote.Quote.Prices.USD.DstToken,
	}, nil
}
