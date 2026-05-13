package main

import (
	"context"
	"log"
	"net"
	"os"

	"google.golang.org/grpc"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "7000"
	}

	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("listen failed: %v", err)
	}

	server := grpc.NewServer()
	log.Printf("productcatalogservice listening on :%s", port)
	if err := server.Serve(listener); err != nil {
		log.Fatalf("serve failed: %v", err)
	}
}

// ProductCatalog implements the gRPC service.
type ProductCatalog struct {
	products map[string]Product
}

// Product is the in-memory representation.
type Product struct {
	ID          string
	Name        string
	Description string
	PriceUSD    int64
}

// GetProduct returns a single product or error.
func (c *ProductCatalog) GetProduct(_ context.Context, id string) (Product, error) {
	p, ok := c.products[id]
	if !ok {
		return Product{}, ErrNotFound
	}
	return p, nil
}
