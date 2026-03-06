---
name: pytest-patterns
description: Comprehensive pytest expertise covering fixtures, parametrization, mocking, coverage reporting, plugins, and advanced testing patterns
user-invokable: true
disable-model-invocation: false
---

# Pytest Patterns & Best Practices

Expert guidance for writing comprehensive, maintainable tests using pytest.

## Pytest Fundamentals

### Test Discovery and Naming
```python
# Test files: test_*.py or *_test.py
# Test functions: test_*()
# Test classes: Test* (no __init__ method)

# tests/test_calculator.py
def test_addition():
    assert 2 + 2 == 4

def test_subtraction():
    result = 10 - 5
    assert result == 5

class TestCalculator:
    def test_multiply(self):
        assert 3 * 4 == 12

    def test_divide(self):
        assert 10 / 2 == 5
```

### Running Tests
```bash
# Run all tests
pytest

# Run specific file
pytest tests/test_calculator.py

# Run specific test
pytest tests/test_calculator.py::test_addition

# Run tests by keyword
pytest -k "addition or subtraction"

# Run tests with verbose output
pytest -v

# Run with coverage
pytest --cov=myapp --cov-report=html

# Run in parallel
pytest -n auto  # Requires pytest-xdist

# Stop on first failure
pytest -x

# Show local variables in traceback
pytest -l

# Run only failed tests from last run
pytest --lf

# Run failed tests first, then all
pytest --ff
```

### Assertions
```python
# Basic assertions
assert value == expected
assert value != unexpected
assert value > 0
assert value in [1, 2, 3]
assert 'substring' in text
assert isinstance(obj, MyClass)

# pytest.raises for exceptions
import pytest

def test_zero_division():
    with pytest.raises(ZeroDivisionError):
        1 / 0

def test_exception_message():
    with pytest.raises(ValueError, match=r"invalid.*value"):
        raise ValueError("invalid value provided")

# pytest.approx for floating point
def test_floating_point():
    assert 0.1 + 0.2 == pytest.approx(0.3)
    assert {'a': 0.1 + 0.2} == {'a': pytest.approx(0.3)}

# pytest.warns for warnings
def test_deprecation_warning():
    with pytest.warns(DeprecationWarning):
        some_deprecated_function()
```

## Fixtures

### Basic Fixtures
```python
import pytest

@pytest.fixture
def sample_user():
    """Provides a sample user for testing."""
    return {
        'id': 1,
        'name': 'Alice',
        'email': 'alice@example.com'
    }

def test_user_name(sample_user):
    assert sample_user['name'] == 'Alice'

def test_user_email(sample_user):
    assert '@' in sample_user['email']
```

### Fixture Scopes
```python
# Function scope (default): New instance for each test
@pytest.fixture(scope='function')
def user():
    return User('Alice')

# Class scope: One instance per test class
@pytest.fixture(scope='class')
def database():
    db = Database()
    db.connect()
    yield db
    db.disconnect()

# Module scope: One instance per test module
@pytest.fixture(scope='module')
def app():
    app = create_app()
    yield app
    app.cleanup()

# Session scope: One instance for entire test session
@pytest.fixture(scope='session')
def config():
    return load_config()
```

### Fixture Factories
```python
@pytest.fixture
def make_user():
    """Factory fixture that creates users on demand."""
    users = []

    def _make_user(name='Alice', email=None):
        user = User(name=name, email=email or f'{name.lower()}@example.com')
        users.append(user)
        return user

    yield _make_user

    # Cleanup all created users
    for user in users:
        user.delete()

def test_multiple_users(make_user):
    user1 = make_user('Alice')
    user2 = make_user('Bob')
    assert user1.name != user2.name
```

### conftest.py (Shared Fixtures)
```python
# tests/conftest.py - Fixtures available to all tests in directory and subdirectories
import pytest
from myapp import create_app, db

@pytest.fixture(scope='session')
def app():
    """Create application for testing."""
    app = create_app('testing')
    return app

@pytest.fixture(scope='function')
def database(app):
    """Create clean database for each test."""
    with app.app_context():
        db.create_all()
        yield db
        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    """Test client for making requests."""
    return app.test_client()
```

### Built-in Fixtures
```python
def test_with_tmp_path(tmp_path):
    """tmp_path provides a temporary directory unique to the test."""
    file = tmp_path / "test.txt"
    file.write_text("content")
    assert file.read_text() == "content"

def test_with_tmpdir(tmpdir):
    """tmpdir is similar to tmp_path (legacy)."""
    file = tmpdir.join("test.txt")
    file.write("content")
    assert file.read() == "content"

def test_capture_output(capsys):
    """capsys captures stdout/stderr."""
    print("Hello")
    print("Error", file=sys.stderr)
    captured = capsys.readouterr()
    assert captured.out == "Hello\n"
    assert captured.err == "Error\n"

def test_monkeypatch(monkeypatch):
    """monkeypatch for runtime patching."""
    monkeypatch.setattr('os.environ.API_KEY', 'test-key')
    monkeypatch.setenv('DEBUG', '1')
    monkeypatch.delenv('PROD_VAR', raising=False)
```

## Parametrization

### Basic Parametrization
```python
@pytest.mark.parametrize('input,expected', [
    (2, 4),
    (3, 9),
    (4, 16),
])
def test_square(input, expected):
    assert input ** 2 == expected

# Multiple parameters
@pytest.mark.parametrize('a,b,expected', [
    (1, 2, 3),
    (5, 5, 10),
    (10, -5, 5),
])
def test_addition(a, b, expected):
    assert a + b == expected
```

### Parametrize with IDs
```python
@pytest.mark.parametrize('input,expected', [
    (2, 4),
    (3, 9),
    (4, 16),
], ids=['two', 'three', 'four'])
def test_square_with_ids(input, expected):
    assert input ** 2 == expected

# Dynamic IDs
@pytest.mark.parametrize('user', [
    {'name': 'Alice', 'age': 30},
    {'name': 'Bob', 'age': 25},
], ids=lambda u: u['name'])
def test_user(user):
    assert user['age'] > 0
```

### Parametrize Multiple Decorators
```python
@pytest.mark.parametrize('x', [1, 2])
@pytest.mark.parametrize('y', [3, 4])
def test_combinations(x, y):
    # Runs 4 tests: (1,3), (1,4), (2,3), (2,4)
    assert x + y > 0
```

### Parametrize Fixtures
```python
@pytest.fixture(params=['sqlite', 'postgresql', 'mysql'])
def database(request):
    """Test with multiple database backends."""
    db = Database(request.param)
    yield db
    db.cleanup()

def test_query(database):
    # Runs 3 times, once for each database
    result = database.query('SELECT 1')
    assert result is not None
```

## Mocking

### unittest.mock
```python
from unittest.mock import Mock, MagicMock, patch

def test_with_mock():
    # Create mock object
    mock_api = Mock()
    mock_api.get_user.return_value = {'id': 1, 'name': 'Alice'}

    # Use mock
    result = mock_api.get_user(123)
    assert result['name'] == 'Alice'

    # Verify calls
    mock_api.get_user.assert_called_once_with(123)
    assert mock_api.get_user.call_count == 1

def test_with_magic_mock():
    # MagicMock supports magic methods
    mock_list = MagicMock()
    mock_list.__len__.return_value = 5
    assert len(mock_list) == 5

def test_side_effect():
    mock = Mock()
    # Different returns for each call
    mock.get.side_effect = [1, 2, 3]
    assert mock.get() == 1
    assert mock.get() == 2
    assert mock.get() == 3

    # Raise exception
    mock.delete.side_effect = ValueError('Cannot delete')
    with pytest.raises(ValueError):
        mock.delete()
```

### Patching
```python
# Patch function
@patch('myapp.api.requests.get')
def test_api_call(mock_get):
    mock_get.return_value.json.return_value = {'status': 'ok'}

    result = fetch_data('https://api.example.com')
    assert result['status'] == 'ok'
    mock_get.assert_called_once()

# Patch multiple
@patch('myapp.services.EmailService')
@patch('myapp.services.Database')
def test_service(mock_db, mock_email):
    # Patches are in reverse order
    service = UserService(mock_db, mock_email)
    service.create_user('Alice')
    mock_db.insert.assert_called_once()

# Context manager
def test_with_context():
    with patch('os.path.exists', return_value=True):
        assert os.path.exists('/fake/path')

# Patch object attribute
def test_patch_attribute():
    with patch.object(MyClass, 'attribute', 'new_value'):
        assert MyClass.attribute == 'new_value'
```

### pytest-mock Plugin
```python
def test_with_mocker(mocker):
    # Cleaner syntax with mocker fixture
    mock_api = mocker.patch('myapp.api.get_data')
    mock_api.return_value = {'id': 1}

    result = fetch_user(1)
    assert result['id'] == 1
    mock_api.assert_called_once_with(1)

def test_spy(mocker):
    # Spy wraps real object
    spy = mocker.spy(MyClass, 'method')
    obj = MyClass()
    obj.method('arg')
    spy.assert_called_once_with(obj, 'arg')
```

## Coverage

### pytest-cov Plugin
```bash
# Basic coverage
pytest --cov=myapp

# Coverage with HTML report
pytest --cov=myapp --cov-report=html

# Coverage with terminal report
pytest --cov=myapp --cov-report=term

# Coverage with missing lines
pytest --cov=myapp --cov-report=term-missing

# Coverage for specific module
pytest --cov=myapp.services tests/

# Fail if coverage below threshold
pytest --cov=myapp --cov-fail-under=80

# Branch coverage
pytest --cov=myapp --cov-branch
```

### .coveragerc Configuration
```ini
# .coveragerc
[run]
source = myapp
omit =
    */tests/*
    */migrations/*
    */venv/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise NotImplementedError
    if __name__ == .__main__.:
    if TYPE_CHECKING:
    @abstractmethod

[html]
directory = htmlcov
```

## Markers

### Built-in Markers
```python
@pytest.mark.skip(reason="Not implemented yet")
def test_future_feature():
    pass

@pytest.mark.skipif(sys.platform == 'win32', reason="Does not run on Windows")
def test_unix_only():
    pass

@pytest.mark.xfail(reason="Known bug #123")
def test_known_failure():
    assert False

@pytest.mark.xfail(strict=True)
def test_must_fail():
    # Test will fail if this passes
    assert False

@pytest.mark.parametrize('input,expected', [(1, 2), pytest.param(2, 4, marks=pytest.mark.xfail)])
def test_with_xfail_param(input, expected):
    assert input + 1 == expected
```

### Custom Markers
```python
# pytest.ini or pyproject.toml
# [tool.pytest.ini_options]
# markers =
#     slow: marks tests as slow
#     integration: marks tests as integration tests

@pytest.mark.slow
def test_slow_operation():
    time.sleep(5)
    assert True

@pytest.mark.integration
def test_database_integration():
    pass

# Run specific markers
# pytest -m slow
# pytest -m "not slow"
# pytest -m "integration and not slow"
```

## Plugins

### pytest-django
```python
import pytest

@pytest.mark.django_db
def test_user_create():
    user = User.objects.create(username='alice')
    assert user.username == 'alice'

@pytest.fixture
def user(db):
    return User.objects.create(username='alice')

def test_user(user):
    assert user.username == 'alice'

# Test with transaction rollback
@pytest.mark.django_db(transaction=True)
def test_with_transaction():
    pass
```

### pytest-asyncio
```python
import pytest

@pytest.mark.asyncio
async def test_async_function():
    result = await async_fetch_data()
    assert result is not None

@pytest.fixture
async def async_client():
    async with AsyncClient() as client:
        yield client

@pytest.mark.asyncio
async def test_with_async_fixture(async_client):
    response = await async_client.get('/api/users')
    assert response.status == 200
```

### pytest-xdist (Parallel Testing)
```bash
# Run with 4 processes
pytest -n 4

# Auto-detect number of CPUs
pytest -n auto

# Load balancing
pytest -n auto --dist loadscope
```

### pytest-benchmark
```python
def test_performance(benchmark):
    result = benchmark(expensive_function, arg1, arg2)
    assert result is not None

def test_with_setup(benchmark):
    def setup():
        return [1, 2, 3, 4, 5]

    result = benchmark.pedantic(sum, setup=setup, rounds=100)
    assert result == 15
```

### pytest-timeout
```python
@pytest.mark.timeout(5)
def test_with_timeout():
    # Fails if takes more than 5 seconds
    time.sleep(3)
    assert True
```

## Advanced Patterns

### Fixtures with Teardown
```python
@pytest.fixture
def database():
    db = Database()
    db.connect()
    # Setup code above yield
    yield db
    # Teardown code below yield
    db.disconnect()

@pytest.fixture
def file_handle():
    f = open('test.txt', 'w')
    yield f
    f.close()
    os.remove('test.txt')
```

### Fixture Dependencies
```python
@pytest.fixture
def database():
    db = Database()
    db.connect()
    yield db
    db.disconnect()

@pytest.fixture
def user(database):
    # Depends on database fixture
    user = database.create_user('Alice')
    yield user
    database.delete_user(user.id)

def test_user(user):
    # Both database and user fixtures are set up
    assert user.name == 'Alice'
```

### Snapshot Testing
```python
def test_snapshot(snapshot):
    """Snapshot testing with pytest-snapshot."""
    data = generate_complex_data()
    snapshot.assert_match(data, 'complex_data.json')
```

### Property-based Testing (Hypothesis)
```python
from hypothesis import given, strategies as st

@given(st.integers(), st.integers())
def test_commutative_addition(a, b):
    assert a + b == b + a

@given(st.lists(st.integers()))
def test_reversing_twice_gives_original(lst):
    assert list(reversed(list(reversed(lst)))) == lst
```

## Best Practices

1. **Naming**: Use descriptive test names that explain what is being tested
2. **Fixtures**: Use fixtures for reusable test data and setup/teardown
3. **Parametrize**: Use parametrize for testing multiple input/output combinations
4. **Mocking**: Mock external dependencies (APIs, databases) for unit tests
5. **Coverage**: Aim for high coverage but focus on meaningful tests
6. **Markers**: Use markers to organize and selectively run tests
7. **conftest.py**: Share fixtures across test files using conftest.py
8. **Assertions**: Write clear assertions with helpful error messages
9. **Isolation**: Each test should be independent and not rely on other tests
10. **Fast Tests**: Keep unit tests fast, use markers for slow integration tests

## Common Commands

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=myapp --cov-report=html

# Run specific tests
pytest tests/test_users.py::test_create_user

# Run tests matching keyword
pytest -k "user and not delete"

# Run tests with specific marker
pytest -m "integration"

# Run in parallel
pytest -n auto

# Show locals on failure
pytest -l

# Stop on first failure
pytest -x

# Run only failed tests
pytest --lf

# Verbose output
pytest -v

# Very verbose output
pytest -vv

# Show test durations
pytest --durations=10

# Generate JUnit XML report
pytest --junitxml=report.xml
```
