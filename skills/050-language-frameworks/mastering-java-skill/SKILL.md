---
name: mastering-java-skill
description: Comprehensive Java expertise covering Spring Boot, JPA/Hibernate, testing, Maven/Gradle, and enterprise patterns
---

# Mastering Java

Expert guidance for Java development with focus on Spring Boot ecosystem and modern Java practices.

## Language Fundamentals

### Modern Java Features (Java 8+)

```java
// Lambda expressions
List<String> names = Arrays.asList("Alice", "Bob", "Charlie");
names.forEach(name -> System.out.println(name));

// Stream API
List<String> filtered = names.stream()
    .filter(name -> name.startsWith("A"))
    .map(String::toUpperCase)
    .collect(Collectors.toList());

// Optional type (avoid null)
Optional<User> user = findUserById(id);
user.ifPresent(u -> System.out.println(u.getName()));
String name = user.map(User::getName).orElse("Unknown");

// Method references
names.stream().map(String::toUpperCase).forEach(System.out::println);

// Try-with-resources
try (BufferedReader reader = new BufferedReader(new FileReader("file.txt"))) {
    String line = reader.readLine();
}

// Records (Java 14+)
public record User(Long id, String name, String email) {}

// Pattern matching (Java 16+)
if (obj instanceof String s) {
    System.out.println(s.toUpperCase());
}

// Switch expressions (Java 14+)
String result = switch (day) {
    case MONDAY, FRIDAY -> "Busy";
    case SATURDAY, SUNDAY -> "Free";
    default -> "Normal";
};
```

### Collections Framework

```java
// List
List<String> list = new ArrayList<>();
list.add("item");

// Set
Set<String> set = new HashSet<>();
set.add("unique");

// Map
Map<String, Integer> map = new HashMap<>();
map.put("key", 123);
map.computeIfAbsent("key", k -> 0);
map.merge("key", 1, Integer::sum);

// Immutable collections (Java 9+)
List<String> immutable = List.of("a", "b", "c");
Map<String, Integer> immutableMap = Map.of("key1", 1, "key2", 2);
```

## Spring Boot Framework

### Application Structure

```java
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

### Dependency Injection

```java
// Component declaration
@Component
@Service  // Specialized @Component for service layer
@Repository  // Specialized @Component for data access
@Controller  // For MVC controllers
@RestController  // For RESTful controllers (@Controller + @ResponseBody)
public class UserService {
    private final UserRepository userRepository;

    // Constructor injection (preferred)
    @Autowired  // Optional in Spring 4.3+ with single constructor
    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // Field injection (avoid in production code)
    @Autowired
    private EmailService emailService;  // Harder to test

    // Setter injection
    @Autowired
    public void setPaymentService(PaymentService paymentService) {
        this.paymentService = paymentService;
    }
}
```

### REST Controllers

```java
@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<User> getAllUsers() {
        return userService.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<User> getUserById(@PathVariable Long id) {
        return userService.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<User> createUser(@Valid @RequestBody CreateUserDto dto) {
        User user = userService.create(dto);
        return ResponseEntity.created(
            URI.create("/api/users/" + user.getId())
        ).body(user);
    }

    @PutMapping("/{id}")
    public ResponseEntity<User> updateUser(
        @PathVariable Long id,
        @Valid @RequestBody UpdateUserDto dto
    ) {
        return userService.update(id, dto)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

### Configuration

```java
// Configuration class
@Configuration
public class AppConfig {
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }
}

// Conditional beans
@Bean
@ConditionalOnProperty(name = "feature.enabled", havingValue = "true")
public FeatureService featureService() {
    return new FeatureServiceImpl();
}
```

### Application Properties

```yaml
# application.yml
spring:
  application:
    name: my-app
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: ${DB_USER}
    password: ${DB_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        format_sql: true

server:
  port: 8080

# Custom properties
app:
  jwt:
    secret: ${JWT_SECRET}
    expiration: 86400
```

```java
// Bind properties to class
@ConfigurationProperties(prefix = "app.jwt")
@Configuration
public class JwtProperties {
    private String secret;
    private long expiration;

    // Getters and setters
}

// Use @Value for individual properties
@Value("${app.jwt.secret}")
private String jwtSecret;
```

### Profiles

```java
// Profile-specific configuration
@Configuration
@Profile("dev")
public class DevConfig {
    // Dev-only beans
}

@Configuration
@Profile("prod")
public class ProdConfig {
    // Production-only beans
}
```

```yaml
# application-dev.yml
spring:
  jpa:
    show-sql: true

# application-prod.yml
spring:
  jpa:
    show-sql: false
```

## Data Access (JPA/Hibernate)

### Entity Definition

```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "created_at", nullable = false, updatable = false)
    @CreatedDate
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    @LastModifiedDate
    private LocalDateTime updatedAt;

    // Getters and setters
}
```

### Entity Relationships

```java
// One-to-Many
@Entity
public class Author {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToMany(mappedBy = "author", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Book> books = new ArrayList<>();

    public void addBook(Book book) {
        books.add(book);
        book.setAuthor(this);
    }
}

@Entity
public class Book {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id", nullable = false)
    private Author author;
}

// Many-to-Many
@Entity
public class Student {
    @ManyToMany
    @JoinTable(
        name = "student_course",
        joinColumns = @JoinColumn(name = "student_id"),
        inverseJoinColumns = @JoinColumn(name = "course_id")
    )
    private Set<Course> courses = new HashSet<>();
}
```

### Spring Data JPA Repositories

```java
public interface UserRepository extends JpaRepository<User, Long> {
    // Query methods (auto-generated)
    Optional<User> findByEmail(String email);
    List<User> findByNameContaining(String name);
    boolean existsByEmail(String email);

    // Custom queries
    @Query("SELECT u FROM User u WHERE u.createdAt > :date")
    List<User> findRecentUsers(@Param("date") LocalDateTime date);

    @Query(value = "SELECT * FROM users WHERE name LIKE %:name%", nativeQuery = true)
    List<User> searchByName(@Param("name") String name);

    // Modifying queries
    @Modifying
    @Query("UPDATE User u SET u.active = false WHERE u.lastLogin < :date")
    int deactivateInactiveUsers(@Param("date") LocalDateTime date);
}
```

### Transactions

```java
@Service
public class UserService {
    private final UserRepository userRepository;

    @Transactional  // Default: propagation=REQUIRED, readOnly=false
    public User createUser(CreateUserDto dto) {
        User user = new User();
        user.setName(dto.getName());
        user.setEmail(dto.getEmail());
        return userRepository.save(user);
    }

    @Transactional(readOnly = true)  // Optimization for read-only operations
    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logAction(String action) {
        // Runs in separate transaction
    }
}
```

## Testing

### JUnit 5

```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService userService;

    @Test
    void shouldCreateUser() {
        // Arrange
        CreateUserDto dto = new CreateUserDto("John", "john@example.com");
        User expected = new User(1L, "John", "john@example.com");

        when(userRepository.save(any(User.class))).thenReturn(expected);

        // Act
        User result = userService.create(dto);

        // Assert
        assertThat(result).isNotNull();
        assertThat(result.getName()).isEqualTo("John");
        verify(userRepository).save(any(User.class));
    }

    @Test
    void shouldThrowExceptionWhenUserNotFound() {
        when(userRepository.findById(1L)).thenReturn(Optional.empty());

        assertThrows(UserNotFoundException.class, () -> {
            userService.getById(1L);
        });
    }
}
```

### Spring Boot Test

```java
@SpringBootTest
@ActiveProfiles("test")
class UserIntegrationTest {
    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
    }

    @Test
    void shouldCreateAndRetrieveUser() {
        CreateUserDto dto = new CreateUserDto("Alice", "alice@example.com");
        User created = userService.create(dto);

        Optional<User> found = userService.findById(created.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getEmail()).isEqualTo("alice@example.com");
    }
}
```

### Web Layer Testing

```java
@WebMvcTest(UserController.class)
class UserControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private UserService userService;

    @Test
    void shouldReturnUser() throws Exception {
        User user = new User(1L, "John", "john@example.com");
        when(userService.findById(1L)).thenReturn(Optional.of(user));

        mockMvc.perform(get("/api/users/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("John"))
            .andExpect(jsonPath("$.email").value("john@example.com"));
    }

    @Test
    void shouldCreateUser() throws Exception {
        CreateUserDto dto = new CreateUserDto("Alice", "alice@example.com");
        User created = new User(1L, "Alice", "alice@example.com");

        when(userService.create(any())).thenReturn(created);

        mockMvc.perform(post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Alice\",\"email\":\"alice@example.com\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value(1));
    }
}
```

### Repository Testing

```java
@DataJpaTest
class UserRepositoryTest {
    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void shouldFindUserByEmail() {
        User user = new User();
        user.setName("Bob");
        user.setEmail("bob@example.com");
        entityManager.persist(user);
        entityManager.flush();

        Optional<User> found = userRepository.findByEmail("bob@example.com");
        assertThat(found).isPresent();
        assertThat(found.get().getName()).isEqualTo("Bob");
    }
}
```

### TestContainers

```java
@SpringBootTest
@Testcontainers
class DatabaseIntegrationTest {
    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Test
    void testDatabaseConnection() {
        // Test with real PostgreSQL container
    }
}
```

## Exception Handling

### Global Exception Handler

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleUserNotFound(UserNotFoundException ex) {
        ErrorResponse error = new ErrorResponse(
            HttpStatus.NOT_FOUND.value(),
            ex.getMessage(),
            LocalDateTime.now()
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidation(ValidationException ex) {
        ErrorResponse error = new ErrorResponse(
            HttpStatus.BAD_REQUEST.value(),
            ex.getMessage(),
            LocalDateTime.now()
        );
        return ResponseEntity.badRequest().body(error);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneral(Exception ex) {
        ErrorResponse error = new ErrorResponse(
            HttpStatus.INTERNAL_SERVER_ERROR.value(),
            "An unexpected error occurred",
            LocalDateTime.now()
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
```

### Validation

```java
// DTO with validation
public class CreateUserDto {
    @NotBlank(message = "Name is required")
    @Size(min = 2, max = 100)
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    @Min(value = 18, message = "Must be at least 18")
    private Integer age;
}

// Controller with validation
@PostMapping
public ResponseEntity<User> create(@Valid @RequestBody CreateUserDto dto) {
    // Validation occurs automatically before method execution
    return ResponseEntity.ok(userService.create(dto));
}
```

## Build Tools

### Maven

```xml
<!-- pom.xml -->
<project>
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>myapp</artifactId>
    <version>1.0.0</version>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

```bash
# Maven commands
mvn clean install      # Build and install
mvn spring-boot:run    # Run application
mvn test              # Run tests
mvn package           # Create JAR/WAR
```

### Gradle

```groovy
// build.gradle
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.0'
    id 'io.spring.dependency-management' version '1.1.0'
}

group = 'com.example'
version = '1.0.0'
sourceCompatibility = '17'

repositories {
    mavenCentral()
}

dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    runtimeOnly 'org.postgresql:postgresql'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}

test {
    useJUnitPlatform()
}
```

```bash
# Gradle commands
./gradlew clean build    # Build project
./gradlew bootRun        # Run application
./gradlew test           # Run tests
```

## Common Patterns

### DTO Pattern

```java
// Separate DTOs from entities
public record CreateUserDto(String name, String email) {}
public record UpdateUserDto(String name) {}
public record UserResponseDto(Long id, String name, String email) {}

// Mapper
@Component
public class UserMapper {
    public UserResponseDto toDto(User user) {
        return new UserResponseDto(user.getId(), user.getName(), user.getEmail());
    }

    public User toEntity(CreateUserDto dto) {
        User user = new User();
        user.setName(dto.name());
        user.setEmail(dto.email());
        return user;
    }
}
```

### Service Layer

```java
@Service
@Transactional
public class UserService {
    private final UserRepository userRepository;
    private final UserMapper userMapper;

    public UserService(UserRepository userRepository, UserMapper userMapper) {
        this.userRepository = userRepository;
        this.userMapper = userMapper;
    }

    @Transactional(readOnly = true)
    public List<UserResponseDto> findAll() {
        return userRepository.findAll().stream()
            .map(userMapper::toDto)
            .toList();
    }

    public UserResponseDto create(CreateUserDto dto) {
        User user = userMapper.toEntity(dto);
        User saved = userRepository.save(user);
        return userMapper::toDto(saved);
    }
}
```

## Best Practices

1. **Dependency Injection**: Use constructor injection for required dependencies
2. **Layered Architecture**: Controller → Service → Repository
3. **Immutability**: Use records for DTOs, final fields where possible
4. **Transactions**: Apply `@Transactional` at service layer
5. **Exception Handling**: Use `@RestControllerAdvice` for global handling
6. **Validation**: Use Bean Validation annotations on DTOs
7. **Testing**: Write unit tests for services, integration tests for repositories
8. **Logging**: Use SLF4J with Logback (Spring Boot default)
9. **Configuration**: Externalize configuration, use profiles
10. **Security**: Use Spring Security for authentication/authorization
