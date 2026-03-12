# Echo Framework Patterns (Go)

## Context Usage and Handlers

Echo handlers with Context:

```go
package main

import (
	"net/http"
	"github.com/labstack/echo/v4"
	"github.com/go-playground/validator/v10"
)

type User struct {
	ID    string `json:"id"`
	Name  string `json:"name" validate:"required,min=2,max=100"`
	Email string `json:"email" validate:"required,email"`
}

type UserHandler struct {
	service UserService
}

func NewUserHandler(service UserService) *UserHandler {
	return &UserHandler{service: service}
}

func (h *UserHandler) Create(c echo.Context) error {
	var user User
	if err := c.Bind(&user); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	if err := c.Validate(&user); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	if err := h.service.Create(&user); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusCreated, user)
}

func (h *UserHandler) GetByID(c echo.Context) error {
	id := c.Param("id")

	user, err := h.service.GetByID(id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "User not found")
	}

	return c.JSON(http.StatusOK, user)
}

func (h *UserHandler) Update(c echo.Context) error {
	id := c.Param("id")

	var user User
	if err := c.Bind(&user); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	if err := c.Validate(&user); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	if err := h.service.Update(id, &user); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, user)
}

func (h *UserHandler) Delete(c echo.Context) error {
	id := c.Param("id")

	if err := h.service.Delete(id); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *UserHandler) List(c echo.Context) error {
	users, err := h.service.List()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, users)
}
```

## Custom Validator

```go
package main

import (
	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

type CustomValidator struct {
	validator *validator.Validate
}

func (cv *CustomValidator) Validate(i interface{}) error {
	if err := cv.validator.Struct(i); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return nil
}

func NewCustomValidator() *CustomValidator {
	return &CustomValidator{validator: validator.New()}
}
```

## Middleware Chains

```go
package middleware

import (
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

// Logger middleware
func Logger() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()

			err := next(c)

			latency := time.Since(start)
			req := c.Request()
			res := c.Response()

			c.Logger().Infof("%s %s - %d - %v",
				req.Method,
				req.URL.Path,
				res.Status,
				latency,
			)

			return err
		}
	}
}

// JWT Authentication middleware
func JWTAuth(secretKey string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "No authorization header")
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				return echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization format")
			}

			tokenString := parts[1]
			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				return []byte(secretKey), nil
			})

			if err != nil || !token.Valid {
				return echo.NewHTTPError(http.StatusUnauthorized, "Invalid token")
			}

			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				c.Set("userID", claims["user_id"])
			}

			return next(c)
		}
	}
}

// CORS middleware
func CORS() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Response().Header().Set("Access-Control-Allow-Origin", "*")
			c.Response().Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
			c.Response().Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")

			if c.Request().Method == "OPTIONS" {
				return c.NoContent(http.StatusNoContent)
			}

			return next(c)
		}
	}
}
```

## Router Setup

```go
package main

import (
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func SetupRouter(userHandler *UserHandler) *echo.Echo {
	e := echo.New()

	// Validator
	e.Validator = NewCustomValidator()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(CORS())

	// Routes
	api := e.Group("/api")
	{
		users := api.Group("/users")
		{
			users.GET("", userHandler.List)
			users.POST("", userHandler.Create)
			users.GET("/:id", userHandler.GetByID)
		}

		// Protected routes
		protected := users.Group("")
		protected.Use(JWTAuth(os.Getenv("JWT_SECRET")))
		{
			protected.PUT("/:id", userHandler.Update)
			protected.DELETE("/:id", userHandler.Delete)
		}
	}

	return e
}
```

## Error Handling

```go
package main

import (
	"net/http"
	"github.com/labstack/echo/v4"
)

type HTTPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func CustomHTTPErrorHandler(err error, c echo.Context) {
	code := http.StatusInternalServerError
	message := "Internal server error"

	if he, ok := err.(*echo.HTTPError); ok {
		code = he.Code
		message = he.Message.(string)
	}

	if !c.Response().Committed {
		c.JSON(code, HTTPError{
			Code:    code,
			Message: message,
		})
	}
}

func SetupEcho() *echo.Echo {
	e := echo.New()
	e.HTTPErrorHandler = CustomHTTPErrorHandler
	return e
}
```

## Testing Echo Handlers

```go
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/labstack/echo/v4"
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
	t.Run("should create user with valid data", func(t *testing.T) {
		e := echo.New()
		e.Validator = NewCustomValidator()

		mockService := new(MockUserService)
		handler := NewUserHandler(mockService)

		user := User{
			Name:  "John Doe",
			Email: "john@example.com",
		}

		mockService.On("Create", mock.AnythingOfType("*main.User")).Return(nil)

		body, _ := json.Marshal(user)
		req := httptest.NewRequest(http.MethodPost, "/users", bytes.NewBuffer(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		err := handler.Create(c)

		assert.NoError(t, err)
		assert.Equal(t, http.StatusCreated, rec.Code)
		mockService.AssertExpectations(t)
	})

	t.Run("should return 400 for invalid data", func(t *testing.T) {
		e := echo.New()
		e.Validator = NewCustomValidator()

		mockService := new(MockUserService)
		handler := NewUserHandler(mockService)

		body := []byte(`{"name": ""}`)
		req := httptest.NewRequest(http.MethodPost, "/users", bytes.NewBuffer(body))
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		err := handler.Create(c)

		assert.Error(t, err)
		he, ok := err.(*echo.HTTPError)
		assert.True(t, ok)
		assert.Equal(t, http.StatusBadRequest, he.Code)
	})
}

func TestUserHandler_GetByID(t *testing.T) {
	t.Run("should return user when found", func(t *testing.T) {
		e := echo.New()

		mockService := new(MockUserService)
		handler := NewUserHandler(mockService)

		expectedUser := &User{
			ID:    "1",
			Name:  "John Doe",
			Email: "john@example.com",
		}

		mockService.On("GetByID", "1").Return(expectedUser, nil)

		req := httptest.NewRequest(http.MethodGet, "/users/1", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("id")
		c.SetParamValues("1")

		err := handler.GetByID(c)

		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, rec.Code)

		var response User
		json.Unmarshal(rec.Body.Bytes(), &response)
		assert.Equal(t, expectedUser.ID, response.ID)

		mockService.AssertExpectations(t)
	})

	t.Run("should return 404 when user not found", func(t *testing.T) {
		e := echo.New()

		mockService := new(MockUserService)
		handler := NewUserHandler(mockService)

		mockService.On("GetByID", "999").Return(nil, errors.New("not found"))

		req := httptest.NewRequest(http.MethodGet, "/users/999", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)
		c.SetParamNames("id")
		c.SetParamValues("999")

		err := handler.GetByID(c)

		assert.Error(t, err)
		he, ok := err.(*echo.HTTPError)
		assert.True(t, ok)
		assert.Equal(t, http.StatusNotFound, he.Code)

		mockService.AssertExpectations(t)
	})
}
```
