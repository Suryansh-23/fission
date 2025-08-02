package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path"
	"relayer/internal/common"
	"relayer/internal/manager"
	"strconv"
	"time"

	_ "github.com/joho/godotenv/autoload"
)

type APIServer struct {
	port          int
	baseURL       string
	authKey       string
	manager       *manager.Manager
	logger        *log.Logger
	devMode       bool
	ethToSuiQuote *common.Quote
	suiToEthQuote *common.Quote
}

func NewAPIServer(manager *manager.Manager, logger *log.Logger) *http.Server {
	port, _ := strconv.Atoi(os.Getenv("API_PORT"))
	baseURL := os.Getenv("1INCH_URL")
	authKey := os.Getenv("1INCH_API_KEY")
	mode := os.Getenv("API_MODE")

	var eth2sui common.Quote
	var sui2eth common.Quote
	if mode == "DEV" {
		file, err := os.ReadFile(path.Join("assets", "eth2sui.json"))
		if err != nil {
			logger.Fatal("Error opening log file:", err)
		}

		err = json.Unmarshal(file, &eth2sui)
		if err != nil {
			logger.Fatal("Error unmarshalling quote response:", err)
		}

		file, err = os.ReadFile(path.Join("assets", "sui2eth.json"))
		if err != nil {
			logger.Fatal("Error opening log file:", err)
		}

		err = json.Unmarshal(file, &sui2eth)
		if err != nil {
			logger.Fatal("Error unmarshalling quote response:", err)
		}
	}

	newAPIServer := &APIServer{
		port:          port,
		baseURL:       baseURL,
		authKey:       authKey,
		manager:       manager,
		logger:        logger,
		devMode:       mode == "DEV",
		ethToSuiQuote: &eth2sui,
		suiToEthQuote: &sui2eth,
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
