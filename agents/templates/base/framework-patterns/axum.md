# Axum Framework Patterns (Rust)

## Handler Functions and Extractors

Axum handlers with extractors:

```rust
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use validator::Validate;

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(length(min = 2, max = 100))]
    pub name: String,
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 8))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateUserRequest {
    #[validate(length(min = 2, max = 100))]
    pub name: Option<String>,
    #[validate(email)]
    pub email: Option<String>,
}

pub async fn create_user(
    State(service): State<Arc<UserService>>,
    Json(req): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<User>), AppError> {
    req.validate()?;

    let user = service.create(req).await?;

    Ok((StatusCode::CREATED, Json(user)))
}

pub async fn get_user(
    State(service): State<Arc<UserService>>,
    Path(id): Path<String>,
) -> Result<Json<User>, AppError> {
    let user = service.get_by_id(&id).await?;

    Ok(Json(user))
}

pub async fn update_user(
    State(service): State<Arc<UserService>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<User>, AppError> {
    req.validate()?;

    let user = service.update(&id, req).await?;

    Ok(Json(user))
}

pub async fn delete_user(
    State(service): State<Arc<UserService>>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    service.delete(&id).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_users(
    State(service): State<Arc<UserService>>,
) -> Result<Json<Vec<User>>, AppError> {
    let users = service.list().await?;

    Ok(Json(users))
}
```

## Error Handling with thiserror

```rust
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Validation error: {0}")]
    Validation(#[from] validator::ValidationErrors),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Internal server error")]
    Internal,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            AppError::Validation(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "Validation failed",
                        "details": e.to_string()
                    })),
                )
                    .into_response();
            }
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.as_str()),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg.as_str()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            AppError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}
```

## State and Dependency Injection

```rust
use axum::{
    Router,
    routing::{get, post},
    extract::State,
};
use std::sync::Arc;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub user_service: Arc<UserService>,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/:id", get(get_user).put(update_user).delete(delete_user))
        .with_state(state)
}
```

## Tower Middleware

```rust
use axum::{
    middleware::{self, Next},
    http::{Request, HeaderValue},
    response::Response,
};
use tower::ServiceBuilder;
use tower_http::{
    trace::TraceLayer,
    cors::CorsLayer,
    compression::CompressionLayer,
};

// Custom middleware
pub async fn auth_middleware<B>(
    req: Request<B>,
    next: Next<B>,
) -> Result<Response, AppError> {
    let auth_header = req
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => &header[7..],
        _ => return Err(AppError::Unauthorized),
    };

    // Validate token
    let user_id = validate_token(token)?;

    // Add user_id to request extensions
    req.extensions_mut().insert(user_id);

    Ok(next.run(req).await)
}

// Apply middleware
pub fn create_router_with_middleware(state: AppState) -> Router {
    let middleware_stack = ServiceBuilder::new()
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .layer(CompressionLayer::new());

    Router::new()
        .route("/users", get(list_users).post(create_user))
        .route(
            "/users/:id",
            get(get_user)
                .put(update_user)
                .delete(delete_user)
                .route_layer(middleware::from_fn(auth_middleware)),
        )
        .layer(middleware_stack)
        .with_state(state)
}
```

## Service Layer with SQLx

```rust
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct UserService {
    db: PgPool,
}

impl UserService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn create(&self, req: CreateUserRequest) -> Result<User, AppError> {
        // Check if email exists
        let existing = sqlx::query("SELECT id FROM users WHERE email = $1")
            .bind(&req.email)
            .fetch_optional(&self.db)
            .await?;

        if existing.is_some() {
            return Err(AppError::Conflict("Email already exists".to_string()));
        }

        // Hash password
        let hashed_password = hash_password(&req.password)?;

        // Create user
        let user = sqlx::query_as::<_, User>(
            "INSERT INTO users (id, name, email, password) VALUES ($1, $2, $3, $4) RETURNING id, name, email"
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&req.name)
        .bind(&req.email)
        .bind(&hashed_password)
        .fetch_one(&self.db)
        .await?;

        Ok(user)
    }

    pub async fn get_by_id(&self, id: &str) -> Result<User, AppError> {
        let user = sqlx::query_as::<_, User>(
            "SELECT id, name, email FROM users WHERE id = $1"
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("User {} not found", id)))?;

        Ok(user)
    }

    pub async fn update(&self, id: &str, req: UpdateUserRequest) -> Result<User, AppError> {
        // Verify user exists
        self.get_by_id(id).await?;

        let mut query = String::from("UPDATE users SET ");
        let mut updates = Vec::new();
        let mut params = Vec::new();

        if let Some(name) = req.name {
            updates.push(format!("name = ${}", params.len() + 1));
            params.push(name);
        }

        if let Some(email) = req.email {
            updates.push(format!("email = ${}", params.len() + 1));
            params.push(email);
        }

        if updates.is_empty() {
            return self.get_by_id(id).await;
        }

        query.push_str(&updates.join(", "));
        query.push_str(&format!(" WHERE id = ${} RETURNING id, name, email", params.len() + 1));

        let mut query_builder = sqlx::query_as::<_, User>(&query);
        for param in params {
            query_builder = query_builder.bind(param);
        }
        query_builder = query_builder.bind(id);

        let user = query_builder.fetch_one(&self.db).await?;

        Ok(user)
    }

    pub async fn delete(&self, id: &str) -> Result<(), AppError> {
        let result = sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(id)
            .execute(&self.db)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("User {} not found", id)));
        }

        Ok(())
    }

    pub async fn list(&self) -> Result<Vec<User>, AppError> {
        let users = sqlx::query_as::<_, User>(
            "SELECT id, name, email FROM users ORDER BY id"
        )
        .fetch_all(&self.db)
        .await?;

        Ok(users)
    }
}
```

## Testing Axum Handlers

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    use serde_json::json;

    #[tokio::test]
    async fn test_create_user_success() {
        let app = create_test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/users")
                    .method("POST")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&json!({
                            "name": "John Doe",
                            "email": "john@example.com",
                            "password": "SecurePass123"
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);

        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        let user: User = serde_json::from_slice(&body).unwrap();

        assert_eq!(user.name, "John Doe");
        assert_eq!(user.email, "john@example.com");
    }

    #[tokio::test]
    async fn test_create_user_invalid_email() {
        let app = create_test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/users")
                    .method("POST")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        serde_json::to_string(&json!({
                            "name": "John Doe",
                            "email": "invalid-email",
                            "password": "SecurePass123"
                        }))
                        .unwrap(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_get_user_not_found() {
        let app = create_test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/users/nonexistent-id")
                    .method("GET")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    async fn create_test_app() -> Router {
        let db = create_test_db().await;
        let user_service = Arc::new(UserService::new(db.clone()));
        let state = AppState { db, user_service };
        create_router(state)
    }
}
```
