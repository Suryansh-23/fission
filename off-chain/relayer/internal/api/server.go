package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"relayer/internal/common"
	"strconv"
	"time"

	_ "github.com/joho/godotenv/autoload"
)

type APIServer struct {
	port        int
	baseURL     string
	authKey     string
	broadcaster *common.Broadcaster
	logger      *log.Logger
	devMode     bool
	quote       *common.QuoteResponse
}

func NewAPIServer(broadcaster *common.Broadcaster, logger *log.Logger) *http.Server {
	port, _ := strconv.Atoi(os.Getenv("API_PORT"))
	baseURL := os.Getenv("1INCH_URL")
	authKey := os.Getenv("1INCH_API_KEY")
	mode := os.Getenv("API_MODE")

	var quote common.QuoteResponse
	if mode == "DEV" {
		file, err := os.ReadFile("quote.json")
		if err != nil {
			logger.Fatal("Error opening log file:", err)
		}

		err = json.Unmarshal(file, &quote)
		if err != nil {
			logger.Fatal("Error unmarshalling quote response:", err)
		}
	}

	newAPIServer := &APIServer{
		port:        port,
		baseURL:     baseURL,
		authKey:     authKey,
		broadcaster: broadcaster,
		logger:      logger,
		devMode:     mode == "DEV",
		quote:       &quote,
	}

	// Declare Server config
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", newAPIServer.port),
		Handler:      newAPIServer.RegisterRoutes(),
		IdleTimeout:  time.Minute,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		ErrorLog:     logger,
	}

	return server
}
