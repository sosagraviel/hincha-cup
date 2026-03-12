# FastAPI Framework Patterns

## Pydantic Models for Validation

FastAPI uses Pydantic for request/response validation:

```python
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)

    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain uppercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain digit')
        return v

class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

## Async Route Handlers

FastAPI routes are async by default:

```python
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user: UserCreate,
    service: UserService = Depends(get_user_service)
) -> UserResponse:
    """Create a new user."""
    try:
        return await service.create_user(user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    service: UserService = Depends(get_user_service)
) -> UserResponse:
    """Get user by ID."""
    user = await service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return user

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_update: UserUpdate,
    service: UserService = Depends(get_user_service)
) -> UserResponse:
    """Update user."""
    user = await service.update_user(user_id, user_update)
    if not user:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    service: UserService = Depends(get_user_service)
) -> None:
    """Delete user."""
    deleted = await service.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
```

## Dependency Injection with Depends()

FastAPI provides dependency injection:

```python
from fastapi import Depends
from typing import Annotated

# Database dependency
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

# Service dependency
async def get_user_service(
    db: Annotated[AsyncSession, Depends(get_db)]
) -> UserService:
    return UserService(db)

# Auth dependency
async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)]
) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

## Service Layer Pattern

Separate business logic into service classes:

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_user(self, user_data: UserCreate) -> User:
        """Create new user."""
        # Check if email exists
        result = await self.db.execute(
            select(User).where(User.email == user_data.email)
        )
        if result.scalar_one_or_none():
            raise ValueError("Email already registered")

        # Hash password
        hashed_password = hash_password(user_data.password)

        # Create user
        user = User(
            name=user_data.name,
            email=user_data.email,
            hashed_password=hashed_password
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def get_user(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        return await self.db.get(User, user_id)

    async def update_user(self, user_id: str, user_data: UserUpdate) -> Optional[User]:
        """Update user."""
        user = await self.db.get(User, user_id)
        if not user:
            return None

        update_data = user_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)

        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def delete_user(self, user_id: str) -> bool:
        """Delete user."""
        user = await self.db.get(User, user_id)
        if not user:
            return False

        await self.db.delete(user)
        await self.db.commit()
        return True
```

## Background Tasks

Execute tasks after returning response:

```python
from fastapi import BackgroundTasks

async def send_welcome_email(email: str, name: str):
    """Send welcome email to new user."""
    # Email sending logic
    await email_service.send(
        to=email,
        subject="Welcome!",
        body=f"Hi {name}, welcome to our platform!"
    )

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user: UserCreate,
    background_tasks: BackgroundTasks,
    service: UserService = Depends(get_user_service)
) -> UserResponse:
    """Create user and send welcome email."""
    new_user = await service.create_user(user)

    # Schedule background task
    background_tasks.add_task(send_welcome_email, new_user.email, new_user.name)

    return new_user
```

## Exception Handlers

Global exception handling:

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

app = FastAPI()

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content={"detail": str(exc)}
    )

@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    return JSONResponse(
        status_code=409,
        content={"detail": "Resource conflict"}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )
```

## Testing FastAPI Routes

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    """Create test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client

@pytest.fixture
async def db_session() -> AsyncSession:
    """Create test database session."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        yield session

    await engine.dispose()

class TestUserEndpoints:
    async def test_create_user_success(self, client: AsyncClient):
        """Test successful user creation."""
        response = await client.post(
            "/users/",
            json={
                "name": "John Doe",
                "email": "john@example.com",
                "password": "SecurePass123"
            }
        )

        assert response.status_code == 201
        data = response.json()
        assert "id" in data
        assert data["name"] == "John Doe"
        assert data["email"] == "john@example.com"
        assert "password" not in data

    async def test_create_user_invalid_email(self, client: AsyncClient):
        """Test user creation with invalid email."""
        response = await client.post(
            "/users/",
            json={
                "name": "John Doe",
                "email": "invalid-email",
                "password": "SecurePass123"
            }
        )

        assert response.status_code == 422
        assert "email" in response.json()["detail"][0]["loc"]

    async def test_get_user_not_found(self, client: AsyncClient):
        """Test getting non-existent user."""
        response = await client.get("/users/nonexistent-id")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    async def test_update_user_success(self, client: AsyncClient, db_session: AsyncSession):
        """Test successful user update."""
        # Create user first
        user = User(name="John", email="john@example.com", hashed_password="hashed")
        db_session.add(user)
        await db_session.commit()

        # Update user
        response = await client.put(
            f"/users/{user.id}",
            json={"name": "John Updated"}
        )

        assert response.status_code == 200
        assert response.json()["name"] == "John Updated"
```

## Testing Services

```python
import pytest
from unittest.mock import AsyncMock, Mock

class TestUserService:
    @pytest.fixture
    def mock_db(self):
        """Create mock database session."""
        return AsyncMock(spec=AsyncSession)

    @pytest.fixture
    def service(self, mock_db):
        """Create service instance."""
        return UserService(mock_db)

    async def test_create_user_success(self, service: UserService, mock_db: AsyncMock):
        """Test successful user creation."""
        # Arrange
        user_data = UserCreate(
            name="John Doe",
            email="john@example.com",
            password="SecurePass123"
        )

        # Mock database responses
        mock_db.execute = AsyncMock(return_value=Mock(scalar_one_or_none=Mock(return_value=None)))
        mock_db.commit = AsyncMock()
        mock_db.refresh = AsyncMock()

        # Act
        result = await service.create_user(user_data)

        # Assert
        assert result.name == "John Doe"
        assert result.email == "john@example.com"
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    async def test_create_user_duplicate_email(self, service: UserService, mock_db: AsyncMock):
        """Test creating user with duplicate email."""
        # Arrange
        user_data = UserCreate(
            name="John Doe",
            email="existing@example.com",
            password="SecurePass123"
        )

        # Mock existing user
        existing_user = User(id="1", email="existing@example.com")
        mock_db.execute = AsyncMock(
            return_value=Mock(scalar_one_or_none=Mock(return_value=existing_user))
        )

        # Act & Assert
        with pytest.raises(ValueError, match="Email already registered"):
            await service.create_user(user_data)
```
