package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadFromFile(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "products.json")
	body := `[{"ID":"p1","Name":"Widget","Description":"d","PriceUSD":99}]`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}

	cat, err := LoadFromFile(path)
	if err != nil {
		t.Fatalf("LoadFromFile: %v", err)
	}
	if cat.Count() != 1 {
		t.Fatalf("want 1 product, got %d", cat.Count())
	}

	p, err := cat.GetProduct(context.Background(), "p1")
	if err != nil {
		t.Fatalf("GetProduct: %v", err)
	}
	if p.Name != "Widget" {
		t.Errorf("want Widget, got %s", p.Name)
	}
}

func TestGetProductNotFound(t *testing.T) {
	c := &ProductCatalog{products: map[string]Product{}}
	_, err := c.GetProduct(context.Background(), "nope")
	if err != ErrNotFound {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}
