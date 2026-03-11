"""User schemas for request/response validation."""
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    """Base user schema."""

    email: EmailStr
    full_name: str


class UserCreate(UserBase):
    """Schema for creating a user."""

    password: str


class UserResponse(UserBase):
    """Schema for user response."""

    id: int

    class Config:
        from_attributes = True
