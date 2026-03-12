# Gin Framework Patterns (Go)

## Router and Handlers

Gin HTTP handlers with proper error handling:

```go
package main

import (
	"net/http"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

type User struct {
	ID    string `json:"id" binding:"-"`
	Name  string `json:"name" binding:"required,min=2,max=100"`
	Email string `json:"email" binding:"required,email"`
}

type UserService interface {
	Create(user *User) error
	GetByID(id string) (*User, error)
	Update(id string, user *User) error
	Delete(id string) error
	List() ([]*User, error)
}

type UserHandler struct {
	service UserService
}

func NewUserHandler(service UserService) *UserHandler {
	return &UserHandler{service: service}
}

func (h *UserHandler) Create(c *gin.Context) {
	var user User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.Create(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, user)
}

func (h *UserHandler) GetByID(c *gin.Context) {
	id := c.Param("id")

	user, err := h.service.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var user User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.Update(id, &user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	if err := h.service.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *UserHandler) List(c *gin.Context) {
	users, err := h.service.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, users)
}
```

## Middleware

Custom middleware for authentication and logging:

```go
package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Logger middleware
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		c.Next()

		latency := time.Since(start)
		statusCode := c.Writer.Status()

		log.Printf("[%d] %s %s - %v", statusCode, c.Request.Method, path, latency)
	}
}

// Authentication middleware
func AuthMiddleware(secretKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "No authorization header"})
			c.Abort()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
			c.Abort()
			return
		}

		tokenString := parts[1]
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(secretKey), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			c.Set("userID", claims["user_id"])
		}

		c.Next()
	}
}

// Error handling middleware
func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		if len(c.Errors) > 0 {
			err := c.Errors.Last()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
	}
}
```

## Router Setup

```go
package main

import (
	"github.com/gin-gonic/gin"
)

func SetupRouter(userHandler *UserHandler) *gin.Engine {
	router := gin.Default()

	// Public routes
	api := router.Group("/api")
	{
		users := api.Group("/users")
		{
			users.GET("", userHandler.List)
			users.POST("", userHandler.Create)
			users.GET("/:id", userHandler.GetByID)
		}
	}

	// Protected routes
	protected := api.Group("/")
	protected.Use(AuthMiddleware(os.Getenv("JWT_SECRET")))
	{
		protected.PUT("/users/:id", userHandler.Update)
		protected.DELETE("/users/:id", userHandler.Delete)
	}

	return router
}
```

## Service Layer

```go
package service

import (
	"errors"
	"github.com/google/uuid"
)

type UserServiceImpl struct {
	repo UserRepository
}

func NewUserService(repo UserRepository) *UserServiceImpl {
	return &UserServiceImpl{repo: repo}
}

func (s *UserServiceImpl) Create(user *User) error {
	// Validate email is unique
	existing, _ := s.repo.GetByEmail(user.Email)
	if existing != nil {
		return errors.New("email already exists")
	}

	user.ID = uuid.New().String()
	return s.repo.Create(user)
}

func (s *UserServiceImpl) GetByID(id string) (*User, error) {
	user, err := s.repo.GetByID(id)
	if err != nil {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (s *UserServiceImpl) Update(id string, user *User) error {
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return errors.New("user not found")
	}

	existing.Name = user.Name
	existing.Email = user.Email

	return s.repo.Update(existing)
}

func (s *UserServiceImpl) Delete(id string) error {
	_, err := s.repo.GetByID(id)
	if err != nil {
		return errors.New("user not found")
	}

	return s.repo.Delete(id)
}

func (s *UserServiceImpl) List() ([]*User, error) {
	return s.repo.List()
}
```

## Testing Gin Handlers

```go
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

type MockUserService struct {
	mock.Mock
}

func (m *MockUserService) Create(user *User) error {
	args := m.Called(user)
	return args.Error(0)
}

func (m *MockUserService) GetByID(id string) (*User, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*User), args.Error(1)
}

func TestUserHandler_Create(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("should create user with valid data", func(t *testing.T) {
		mockService := new(MockUserService)
		handler := NewUserHandler(mockService)
		router := gin.New()
		router.POST("/users", handler.Create)

		user := User{
			Name:  "John Doe",
			Email: "john@example.com",
		}

		mockService.On("Create", mock.AnythingOfType("*main.User")).Return(nil)

		body, _ := json.Marshal(user)
		req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)
		mockService.AssertExpectations(t)
	})

	t.Run("should return 400 for invalid data", func(t *testing.T) {
		mockService := new(MockUserService)
		handler := NewUserHandler(mockService)
		router := gin.New()
		router.POST("/users", handler.Create)

		body := []byte(`{"name": ""}`)
		req, _ := http.NewRequest("POST", "/users", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestUserHandler_GetByID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("should return user when found", func(t *testing.T) {
		mockService := new(MockUserService)
		handler := NewUserHandler(mockService)
		router := gin.New()
		router.GET("/users/:id", handler.GetByID)

		expectedUser := &User{
			ID:    "1",
			Name:  "John Doe",
			Email: "john@example.com",
		}

		mockService.On("GetByID", "1").Return(expectedUser, nil)

		req, _ := http.NewRequest("GET", "/users/1", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response User
		json.Unmarshal(w.Body.Bytes(), &response)
		assert.Equal(t, expectedUser.ID, response.ID)

		mockService.AssertExpectations(t)
	})

	t.Run("should return 404 when user not found", func(t *testing.T) {
		mockService := new(MockUserService)
		handler := NewUserHandler(mockService)
		router := gin.New()
		router.GET("/users/:id", handler.GetByID)

		mockService.On("GetByID", "999").Return(nil, errors.New("not found"))

		req, _ := http.NewRequest("GET", "/users/999", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
		mockService.AssertExpectations(t)
	})
}
```
