# Django Framework Patterns

## Models and Migrations

Django uses ORM models with automatic migrations:

```python
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinLengthValidator, EmailValidator

class User(AbstractUser):
    """Custom user model."""
    email = models.EmailField(unique=True, validators=[EmailValidator()])
    name = models.CharField(max_length=100, validators=[MinLengthValidator(2)])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'
        ordering = ['-created_at']

    def __str__(self):
        return self.email


class Profile(models.Model):
    """User profile model."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    bio = models.TextField(blank=True)
    avatar_url = models.URLField(blank=True)
    phone = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = 'profiles'

    def __str__(self):
        return f"Profile for {self.user.email}"
```

## Class-Based Views

Django's generic class-based views:

```python
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.urls import reverse_lazy
from django.contrib.auth.mixins import LoginRequiredMixin
from .models import User
from .forms import UserForm

class UserListView(ListView):
    """List all users."""
    model = User
    template_name = 'users/list.html'
    context_object_name = 'users'
    paginate_by = 20

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.GET.get('search', '')
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) | models.Q(email__icontains=search)
            )
        return queryset


class UserDetailView(DetailView):
    """Display user details."""
    model = User
    template_name = 'users/detail.html'
    context_object_name = 'user'


class UserCreateView(LoginRequiredMixin, CreateView):
    """Create a new user."""
    model = User
    form_class = UserForm
    template_name = 'users/form.html'
    success_url = reverse_lazy('user-list')

    def form_valid(self, form):
        form.instance.created_by = self.request.user
        return super().form_valid(form)


class UserUpdateView(LoginRequiredMixin, UpdateView):
    """Update an existing user."""
    model = User
    form_class = UserForm
    template_name = 'users/form.html'
    success_url = reverse_lazy('user-list')


class UserDeleteView(LoginRequiredMixin, DeleteView):
    """Delete a user."""
    model = User
    template_name = 'users/confirm_delete.html'
    success_url = reverse_lazy('user-list')
```

## Django REST Framework Views

API views using Django REST Framework:

```python
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import User
from .serializers import UserSerializer, UserCreateSerializer

class UserViewSet(viewsets.ModelViewSet):
    """User API endpoints."""
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action in ['create']:
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def create(self, request):
        """Create a new user."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED
        )

    def update(self, request, pk=None):
        """Update a user."""
        user = self.get_object()
        serializer = self.get_serializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate a user."""
        user = self.get_object()
        user.is_active = False
        user.save()
        return Response({'status': 'user deactivated'})
```

## Serializers

DRF serializers for validation and transformation:

```python
from rest_framework import serializers
from .models import User
from django.contrib.auth.password_validation import validate_password

class UserSerializer(serializers.ModelSerializer):
    """User serializer for responses."""
    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserCreateSerializer(serializers.ModelSerializer):
    """User serializer for creation."""
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['name', 'email', 'password', 'password_confirm']

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Passwords do not match"})
        attrs.pop('password_confirm')
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            name=validated_data['name'],
            password=validated_data['password']
        )
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """User serializer for updates."""
    class Meta:
        model = User
        fields = ['name', 'email']
```

## Django ORM Patterns

Efficient database queries:

```python
from django.db.models import Q, Count, Prefetch
from .models import User, Profile

class UserRepository:
    """Repository pattern for user operations."""

    @staticmethod
    def get_active_users():
        """Get all active users with their profiles."""
        return User.objects.filter(is_active=True).select_related('profile')

    @staticmethod
    def search_users(query: str):
        """Search users by name or email."""
        return User.objects.filter(
            Q(name__icontains=query) | Q(email__icontains=query)
        ).select_related('profile')

    @staticmethod
    def get_users_with_profiles():
        """Get users with optimized profile loading."""
        return User.objects.prefetch_related(
            Prefetch('profile', queryset=Profile.objects.all())
        )

    @staticmethod
    def bulk_create_users(user_data_list):
        """Bulk create users efficiently."""
        users = [User(**data) for data in user_data_list]
        return User.objects.bulk_create(users)

    @staticmethod
    def update_user_email(user_id: int, new_email: str):
        """Update user email atomically."""
        return User.objects.filter(id=user_id).update(email=new_email)
```

## Testing Django Views

```python
from django.test import TestCase, Client
from django.urls import reverse
from .models import User

class UserViewTests(TestCase):
    """Test user views."""

    def setUp(self):
        """Set up test data."""
        self.client = Client()
        self.user = User.objects.create_user(
            username='test@example.com',
            email='test@example.com',
            name='Test User',
            password='TestPass123'
        )

    def test_user_list_view(self):
        """Test user list view returns users."""
        response = self.client.get(reverse('user-list'))

        assert response.status_code == 200
        assert 'users' in response.context
        assert len(response.context['users']) == 1

    def test_user_detail_view(self):
        """Test user detail view returns user."""
        response = self.client.get(reverse('user-detail', args=[self.user.id]))

        assert response.status_code == 200
        assert response.context['user'].id == self.user.id

    def test_user_create_view_requires_login(self):
        """Test user create view requires authentication."""
        response = self.client.get(reverse('user-create'))

        assert response.status_code == 302  # Redirect to login

    def test_user_create_view_authenticated(self):
        """Test user create view when authenticated."""
        self.client.force_login(self.user)
        response = self.client.get(reverse('user-create'))

        assert response.status_code == 200
```

## Testing Django REST Framework APIs

```python
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.urls import reverse
from .models import User

class UserAPITests(APITestCase):
    """Test user API endpoints."""

    def setUp(self):
        """Set up test data."""
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='test@example.com',
            email='test@example.com',
            name='Test User',
            password='TestPass123'
        )

    def test_create_user_success(self):
        """Test creating a user with valid data."""
        url = reverse('user-list')
        data = {
            'name': 'John Doe',
            'email': 'john@example.com',
            'password': 'SecurePass123',
            'password_confirm': 'SecurePass123'
        }

        response = self.client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert 'id' in response.data
        assert response.data['name'] == 'John Doe'
        assert response.data['email'] == 'john@example.com'
        assert 'password' not in response.data

    def test_create_user_invalid_email(self):
        """Test creating a user with invalid email."""
        url = reverse('user-list')
        data = {
            'name': 'John Doe',
            'email': 'invalid-email',
            'password': 'SecurePass123',
            'password_confirm': 'SecurePass123'
        }

        response = self.client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in response.data

    def test_get_user_requires_authentication(self):
        """Test getting a user requires authentication."""
        url = reverse('user-detail', args=[self.user.id])

        response = self.client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_user_authenticated(self):
        """Test getting a user when authenticated."""
        self.client.force_authenticate(user=self.user)
        url = reverse('user-detail', args=[self.user.id])

        response = self.client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == self.user.id
        assert response.data['email'] == self.user.email

    def test_update_user(self):
        """Test updating a user."""
        self.client.force_authenticate(user=self.user)
        url = reverse('user-detail', args=[self.user.id])
        data = {'name': 'Updated Name'}

        response = self.client.patch(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == 'Updated Name'

    def test_delete_user(self):
        """Test deleting a user."""
        self.client.force_authenticate(user=self.user)
        url = reverse('user-detail', args=[self.user.id])

        response = self.client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not User.objects.filter(id=self.user.id).exists()
```
