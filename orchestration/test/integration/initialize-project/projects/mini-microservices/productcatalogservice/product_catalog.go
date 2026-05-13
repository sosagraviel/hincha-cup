package main

import (
	"encoding/json"
	"errors"
	"os"
)

// ErrNotFound is returned when a product id is unknown.
var ErrNotFound = errors.New("product not found")

// LoadFromFile reads products.json and returns a populated catalog.
func LoadFromFile(path string) (*ProductCatalog, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var products []Product
	if err := json.Unmarshal(raw, &products); err != nil {
		return nil, err
	}

	catalog := &ProductCatalog{products: map[string]Product{}}
	for _, p := range products {
		catalog.products[p.ID] = p
	}
	return catalog, nil
}

// Count returns the number of products in the catalog.
func (c *ProductCatalog) Count() int {
	return len(c.products)
}
