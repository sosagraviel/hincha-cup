"""User router endpoints."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List

from app.schemas.user import UserCreate, UserResponse
from app.services.user_service import UserService
from app.core.security import get_current_user

router = APIRouter()
user_service = UserService()


@router.get("/", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_user)):
    """Get all users."""
    return await user_service.get_all()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, current_user: dict = Depends(get_current_user)):
    """Get user by ID."""
    user = await user_service.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(user_data: UserCreate):
    """Create new user."""
    return await user_service.create(user_data)
