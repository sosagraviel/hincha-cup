package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHomeHandlerReturns200(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	homeHandler(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "storefront") {
		t.Errorf("expected storefront in body, got: %s", rec.Body.String())
	}
}

func TestCartHandlerReturns200(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/cart", nil)
	rec := httptest.NewRecorder()
	cartHandler(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
}
