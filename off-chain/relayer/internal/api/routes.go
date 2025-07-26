package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"relayer/internal/common"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/schema"
)

func (s *APIServer) RegisterRoutes() http.Handler {
	router := gin.New()

	// Register routes
	router.GET("/", s.DefaultHandler) // test handler

	router.GET("/quoter/v1.0/quote/receive", s.GetQuoteHandler)
	router.GET("/relayer/v1.0/order/create", s.createOrder)
	router.POST("/relayer/v1.0/submit", s.submitOrder)
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

func (s *APIServer) GetQuoteHandler(c *gin.Context) {
	if s.devMode {
		c.JSON(http.StatusOK, s.quote)
	} else {
		queryParams := common.QuoteRequestParams{
			SrcChain:        c.Query("srcChain"),
			DstChain:        c.Query("dstChain"),
			SrcTokenAddress: c.Query("srcTokenAddress"),
			DstTokenAddress: c.Query("dstTokenAddress"),
			Amount:          c.Query("amount"),
			WalletAddress:   c.Query("walletAddress"),
		}

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

		var quoteResponse common.QuoteResponse
		if err := json.NewDecoder(resp.Body).Decode(&quoteResponse); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode quote response from 1inch Fusion+ API"})
			return
		}

		if quoteResponse.QuoteID == "" {
			// If no quote ID is returned, generate a dummy one for testing
			quoteResponse.QuoteID = "ddcae159-e73d-4f22-9234-4085e1b7f7dc"
		}

		tmp, _ := json.Marshal(quoteResponse)

		s.logger.Printf("%s", tmp)
		c.JSON(http.StatusOK, quoteResponse)
	}
}

func (s *APIServer) createOrder(c *gin.Context) {
	// Handle the request
}

func (s *APIServer) submitOrder(c *gin.Context) {
	body := c.Request.Body
	defer body.Close()

	order := common.Order{}
	if err := json.NewDecoder(body).Decode(&order); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order data"})
		s.logger.Printf("Failed to decode order data: %v", err)
		return
	}
	s.logger.Printf("Received order @ ID: %s", order.QuoteID)

	op := []byte("BROADC ")
	orderBytes, err := json.Marshal(order)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to marshal order data"})
		return
	}

	orderBytes = append(op, orderBytes...)
	s.broadcaster.Broadcast(orderBytes)

	s.logger.Printf("Order broadcasted @ ID: %s", order.QuoteID)
}

func (s *APIServer) DefaultHandler(c *gin.Context) {
	msg := c.Query("msg")
	if msg == "" {
		msg = "Hello, World!"
	}

	s.broadcaster.Broadcast([]byte(msg))
	c.String(http.StatusOK, "Message broadcasted: %s", msg)
}
