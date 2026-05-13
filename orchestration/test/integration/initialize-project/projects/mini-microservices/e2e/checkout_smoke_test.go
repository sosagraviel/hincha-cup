package e2e

import (
	"net/http"
	"os"
	"testing"
	"time"
)

func TestStorefrontIsReachable(t *testing.T) {
	addr := os.Getenv("FRONTEND_ADDR")
	if addr == "" {
		addr = "http://frontend:8080"
	}

	client := http.Client{Timeout: 5 * time.Second}
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := client.Get(addr + "/healthz")
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return
		}
		time.Sleep(time.Second)
	}
	t.Fatalf("frontend %s did not become ready", addr)
}
