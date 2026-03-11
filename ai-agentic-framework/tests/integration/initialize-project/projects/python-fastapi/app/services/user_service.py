"""User service business logic."""
from typing import List, Optional
from passlib.context import CryptContext

from app.schemas.user import UserCreate, UserResponse

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserService:
    """User service for managing users."""

    def __init__(self):
        self.users: List[dict] = []
        self.next_id = 1

    async def get_all(self) -> List[UserResponse]:
        """Get all users."""
        return [UserResponse(**user) for user in self.users]

    async def get_by_id(self, user_id: int) -> Optional[UserResponse]:
        """Get user by ID."""
        user = next((u for u in self.users if u["id"] == user_id), None)
        return UserResponse(**user) if user else None

    async def create(self, user_data: UserCreate) -> UserResponse:
        """Create a new user."""
        hashed_password = pwd_context.hash(user_data.password)
        user = {
            "id": self.next_id,
            "email": user_data.email,
            "full_name": user_data.full_name,
            "hashed_password": hashed_password,
        }
        self.users.append(user)
        self.next_id += 1
        return UserResponse(**user)
