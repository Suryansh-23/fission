package api

import (
	"encoding/json"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/schema"
)

func (s *APIServer) RegisterRoutes() http.Handler {
	router := gin.New()

	// Register routes
	router.GET("/quoter/v1.0/quote/receive", s.GetQuoteHandler)
	router.POST("/v1.0/order/create", s.createOrder)
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

func buildQuoteRequestParams(base string, params QuoteRequestParams) (string, error) {
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
	queryParams := QuoteRequestParams {
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

	var quoteResponse QuoteResponse 
	if err := json.NewDecoder(resp.Body).Decode(&quoteResponse); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode quote response from 1inch Fusion+ API"})
		return
	}

	c.JSON(http.StatusOK, quoteResponse)
}

func (s *APIServer) createOrder(c *gin.Context) {
	// Handle the request
}
