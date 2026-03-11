.PHONY: build run test clean docker-build docker-run

# Build the application
build:
	go build -o bin/api ./cmd/api

# Run the application
run:
	go run ./cmd/api/main.go

# Run tests
test:
	go test -v ./...

# Run tests with coverage
test-coverage:
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

# Clean build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out

# Build Docker image
docker-build:
	docker build -t go-microservice:latest .

# Run Docker container
docker-run:
	docker run -p 8080:8080 --env-file .env go-microservice:latest

# Download dependencies
deps:
	go mod download
	go mod verify

# Format code
fmt:
	go fmt ./...

# Run linter
lint:
	golangci-lint run

# Run application in development mode with auto-reload
dev:
	air
