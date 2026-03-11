package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/test/go-microservice/internal/handlers"
	"github.com/test/go-microservice/internal/middleware"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Initialize router
	router := mux.NewRouter()

	// Health check endpoint
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	}).Methods("GET")

	// User routes
	userHandler := handlers.NewUserHandler()
	apiRouter := router.PathPrefix("/api/v1").Subrouter()
	apiRouter.Use(middleware.LoggingMiddleware)

	apiRouter.HandleFunc("/users", userHandler.GetUsers).Methods("GET")
	apiRouter.HandleFunc("/users/{id}", userHandler.GetUserByID).Methods("GET")
	apiRouter.HandleFunc("/users", userHandler.CreateUser).Methods("POST")

	// Protected routes require JWT
	protected := apiRouter.PathPrefix("").Subrouter()
	protected.Use(middleware.AuthMiddleware)
	protected.HandleFunc("/users/{id}", userHandler.UpdateUser).Methods("PUT")
	protected.HandleFunc("/users/{id}", userHandler.DeleteUser).Methods("DELETE")

	// Start server
	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatal(err)
	}
}
