package main

import (
	"fmt"
	"net/http"
)

// homeHandler renders the storefront — in production it would fan out
// gRPC calls to productcatalogservice + recommendationservice. The
// fixture keeps the dispatch surface but stubs the calls.
func homeHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprintln(w, "<h1>mini-microservices storefront</h1>")
}

// cartHandler renders the cart page.
func cartHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html")
	fmt.Fprintln(w, "<h1>cart</h1>")
}
