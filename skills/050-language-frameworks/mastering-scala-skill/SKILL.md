---
name: mastering-scala-skill
description: Comprehensive Scala 3 expertise covering functional programming, type system, effect systems (Cats Effect, ZIO), actor model (Pekko), testing (ScalaTest, MUnit), and sbt build patterns. Use when asked to "write Scala code", "explain Scala concepts", "set up a Scala project", "configure sbt", "write ScalaTest tests", "create http4s endpoints", "use Cats Effect or ZIO", "implement actors with Pekko", "configure Scala CI/CD", or "debug Scala errors". Triggers on "Scala best practices", "type classes", "implicits", "given/using", "opaque types", "pattern matching", "functional effects".
allowed-tools: Read, Write, Bash, Edit
---

# Mastering Scala

Production-ready Scala 3 patterns with idiomatic functional programming.

> **Compatibility:** Scala 3.3 LTS+, sbt 1.10+, JDK 17/21 LTS

## Quick Start

```bash
# Create new Scala 3 project with sbt
sbt new scala/scala3.g8
cd my-project

# Or initialize manually
mkdir -p src/main/scala src/test/scala project
```

```scala
// build.sbt
val scala3Version = "3.3.4"

lazy val root = project
  .in(file("."))
  .settings(
    name := "my-project",
    version := "0.1.0-SNAPSHOT",
    scalaVersion := scala3Version,
    libraryDependencies ++= Seq(
      "org.scalameta" %% "munit" % "1.0.0" % Test
    )
  )
```

```scala
// project/build.properties
sbt.version=1.10.6
```

## When to Use This Skill

Use when:

- Building type-safe functional applications on the JVM
- Implementing concurrent/distributed systems with actors or effect systems
- Working with Cats Effect, ZIO, or http4s
- Designing domain models with ADTs and pattern matching
- Configuring sbt builds, multi-module projects, or cross-building
- Migrating from Scala 2 to Scala 3

## Project Setup Checklist

```
- [ ] Use sbt as build tool (or Mill for simpler projects)
- [ ] Target Scala 3.3 LTS for stability
- [ ] Use JDK 17 or 21 LTS
- [ ] Enable strict compiler options (-Wunused, -Werror)
- [ ] Set up scalafmt for formatting
- [ ] Set up scalafix for linting
- [ ] Configure MUnit or ScalaTest for testing
```

## Workflow

### Phase 1: Setup

1. Verify Scala and sbt versions

   ```bash
   scala -version   # Require 3.3+
   sbt --version    # Require 1.10+
   java -version    # Require 17+
   ```

2. Initialize project structure

   ```
   my-project/
   ├── build.sbt
   ├── project/
   │   ├── build.properties
   │   └── plugins.sbt
   ├── src/
   │   ├── main/
   │   │   ├── scala/
   │   │   └── resources/
   │   └── test/
   │       ├── scala/
   │       └── resources/
   └── .scalafmt.conf
   ```

3. Configure plugins

   ```scala
   // project/plugins.sbt
   addSbtPlugin("org.scalameta" % "sbt-scalafmt" % "2.5.2")
   addSbtPlugin("ch.epfl.scala" % "sbt-scalafix" % "0.12.1")
   addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.10.4")
   ```

### Phase 2: Develop

4. Reference appropriate patterns from sections below
5. Follow idiomatic Scala 3 style (indentation-based syntax preferred)

### Phase 3: Validate

6. Run quality checks

   ```bash
   sbt scalafmtCheckAll
   sbt "scalafixAll --check"
   sbt compile
   ```

7. Run tests

   ```bash
   sbt test
   sbt "testOnly *MySuite"
   ```

### Phase 4: Package and Deploy

8. Build artifacts

   ```bash
   sbt package
   sbt Docker/publishLocal
   ```

**Pre-Completion Checklist:**

```
- [ ] All tests pass
- [ ] No compiler warnings
- [ ] scalafmt applied
- [ ] No unused imports
```

## Language Fundamentals

### Scala 3 Core Syntax

```scala
// Variables and values
val name: String = "Alice"       // Immutable (preferred)
var counter: Int = 0             // Mutable (avoid when possible)
lazy val expensive = computeIt() // Evaluated on first access

// Type inference
val greeting = "Hello"           // String inferred
val numbers = List(1, 2, 3)     // List[Int] inferred

// String interpolation
val msg = s"Hello, $name"
val formatted = f"Pi is $pi%.2f"
val raw = raw"No \n escape"

// Control flow (expression-based, everything returns a value)
val result = if x > 0 then "positive" else "non-positive"

val description = x match
  case 0 => "zero"
  case n if n > 0 => "positive"
  case _ => "negative"

// For comprehensions
val pairs = for
  x <- List(1, 2, 3)
  y <- List("a", "b")
yield (x, y)
```

### Functions and Methods

```scala
// Method definition
def greet(name: String): String =
  s"Hello, $name"

// Default and named parameters
def connect(host: String, port: Int = 5432, ssl: Boolean = true): Connection = ???

connect("localhost", ssl = false)

// Multiple parameter lists (currying)
def fold[A, B](xs: List[A])(zero: B)(f: (B, A) => B): B = ???

// Extension methods (Scala 3)
extension (s: String)
  def words: List[String] = s.split("\\s+").toList
  def capitalize: String = s.split("\\s+").map(_.capitalize).mkString(" ")

"hello world".words      // List("hello", "world")
"hello world".capitalize // "Hello World"

// Higher-order functions
val doubled = List(1, 2, 3).map(_ * 2)
val evens = List(1, 2, 3, 4).filter(_ % 2 == 0)
val sum = List(1, 2, 3).foldLeft(0)(_ + _)

// Function types
val add: (Int, Int) => Int = _ + _
val isEven: Int => Boolean = _ % 2 == 0
```

### Algebraic Data Types (ADTs)

```scala
// Enums (Scala 3)
enum Color:
  case Red, Green, Blue

enum Planet(val mass: Double, val radius: Double):
  case Mercury extends Planet(3.303e+23, 2.4397e6)
  case Venus   extends Planet(4.869e+24, 6.0518e6)
  case Earth   extends Planet(5.976e+24, 6.37814e6)

  def surfaceGravity: Double = 6.67300e-11 * mass / (radius * radius)

// Sealed traits + case classes (ADTs)
sealed trait Shape
case class Circle(radius: Double) extends Shape
case class Rectangle(width: Double, height: Double) extends Shape
case class Triangle(base: Double, height: Double) extends Shape

def area(shape: Shape): Double = shape match
  case Circle(r) => Math.PI * r * r
  case Rectangle(w, h) => w * h
  case Triangle(b, h) => 0.5 * b * h

// Enum-based ADTs (Scala 3 preferred)
enum JsonValue:
  case JsonNull
  case JsonBool(value: Boolean)
  case JsonNumber(value: Double)
  case JsonString(value: String)
  case JsonArray(items: List[JsonValue])
  case JsonObject(fields: Map[String, JsonValue])
```

### Pattern Matching (Advanced)

```scala
// Destructuring
val (x, y, z) = (1, 2, 3)
val head :: tail = List(1, 2, 3): @unchecked

// Nested patterns
case class Address(city: String, country: String)
case class Person(name: String, age: Int, address: Address)

person match
  case Person(name, age, Address(_, "Argentina")) if age >= 18 =>
    s"$name is an adult from Argentina"
  case Person(name, _, _) =>
    s"$name from elsewhere"

// Type patterns
def describe(x: Any): String = x match
  case i: Int if i > 0 => s"positive int: $i"
  case s: String => s"string: $s"
  case xs: List[?] => s"list of ${xs.length} elements"
  case _ => "something else"

// Extractors (custom pattern matching)
object Email:
  def unapply(s: String): Option[(String, String)] =
    s.split("@") match
      case Array(user, domain) => Some((user, domain))
      case _ => None

"user@example.com" match
  case Email(user, domain) => s"User: $user, Domain: $domain"
```

## Type System

### Opaque Types

```scala
// Zero-cost type abstractions (Scala 3)
object Types:
  opaque type UserId = Long
  opaque type Email = String
  opaque type NonEmptyString = String

  object UserId:
    def apply(value: Long): UserId = value
  extension (id: UserId)
    def value: Long = id

  object Email:
    def fromString(s: String): Either[String, Email] =
      if s.contains("@") then Right(s) else Left("Invalid email")
  extension (e: Email)
    def value: String = e
    def domain: String = e.split("@").last

  object NonEmptyString:
    def fromString(s: String): Option[NonEmptyString] =
      Option.when(s.nonEmpty)(s)
  extension (s: NonEmptyString)
    def value: String = s

// Usage: compile-time safety, zero runtime overhead
import Types.*
val id: UserId = UserId(42L)
val email: Email = Email.fromString("user@example.com").toOption.get
// val bad: UserId = 42L  // Won't compile outside Types object
```

### Given Instances and Using Clauses

```scala
// Type classes with given/using (replaces implicits)
trait JsonEncoder[A]:
  def encode(value: A): String

trait JsonDecoder[A]:
  def decode(json: String): Either[String, A]

// Given instances (type class implementations)
given JsonEncoder[String] with
  def encode(value: String): String = s""""$value""""

given JsonEncoder[Int] with
  def encode(value: Int): String = value.toString

given [A](using encoder: JsonEncoder[A]): JsonEncoder[List[A]] with
  def encode(values: List[A]): String =
    values.map(encoder.encode).mkString("[", ",", "]")

// Using clauses (context parameters)
def toJson[A](value: A)(using encoder: JsonEncoder[A]): String =
  encoder.encode(value)

// Summon instance
val encoder = summon[JsonEncoder[String]]

// Context bounds (shorthand)
def toJsonShort[A: JsonEncoder](value: A): String =
  summon[JsonEncoder[A]].encode(value)
```

### Union and Intersection Types

```scala
// Union types
type StringOrInt = String | Int

def show(value: StringOrInt): String = value match
  case s: String => s"String: $s"
  case i: Int => s"Int: $i"

// Intersection types
trait Resettable:
  def reset(): Unit

trait Growable[A]:
  def add(a: A): Unit

def process(x: Resettable & Growable[String]): Unit =
  x.add("item")
  x.reset()

// Type lambdas
type MapTo[V] = [K] =>> Map[K, V]
type StringMap = MapTo[String]  // [K] =>> Map[K, String]
```

### Dependent Types and Match Types

```scala
// Match types (compile-time type computation)
type Elem[X] = X match
  case String => Char
  case Array[t] => t
  case Iterable[t] => t

val c: Elem[String] = 'a'        // Char
val i: Elem[List[Int]] = 42      // Int

// Literal types
val x: 42 = 42
val s: "hello" = "hello"

// Singleton types
def identity(x: Int): x.type = x
```

### Traits and Mixins

```scala
// Trait with abstract and concrete members
trait Repository[F[_], A]:
  def findById(id: Long): F[Option[A]]
  def findAll: F[List[A]]
  def save(entity: A): F[A]
  def delete(id: Long): F[Unit]

// Mixin composition
trait Logging:
  def log(msg: String): Unit = println(s"[LOG] $msg")

trait Auditing:
  def audit(action: String): Unit = println(s"[AUDIT] $action")

class UserService extends Repository[IO, User], Logging, Auditing:
  override def findById(id: Long): IO[Option[User]] =
    log(s"Finding user $id")
    audit(s"findById($id)")
    IO.pure(None)
  // ...
```

## Functional Effect Systems

### Cats Effect (IO)

```scala
// build.sbt dependency
// "org.typelevel" %% "cats-effect" % "3.5.7"

import cats.effect.*
import cats.syntax.all.*

// Pure effect composition
def program: IO[Unit] = for
  _    <- IO.println("What is your name?")
  name <- IO.readLine
  _    <- IO.println(s"Hello, $name!")
yield ()

// Resource management (bracket pattern)
def readFile(path: String): IO[String] =
  Resource
    .fromAutoCloseable(IO(scala.io.Source.fromFile(path)))
    .use(source => IO(source.mkString))

// Concurrency
def fetchParallel: IO[(String, String)] =
  (fetchUrl("https://api1.example.com"), fetchUrl("https://api2.example.com")).parTupled

// Error handling
def safeDivide(a: Int, b: Int): IO[Int] =
  if b == 0 then IO.raiseError(ArithmeticException("Division by zero"))
  else IO.pure(a / b)

val result: IO[Int] = safeDivide(10, 0).handleErrorWith: e =>
  IO.println(s"Error: ${e.getMessage}") *> IO.pure(0)

// IOApp entry point
object Main extends IOApp.Simple:
  def run: IO[Unit] = program
```

### ZIO

```scala
// build.sbt dependency
// "dev.zio" %% "zio" % "2.1.14"

import zio.*

// ZIO[R, E, A] - environment R, error E, success A
def program: ZIO[Any, Nothing, Unit] = for
  _    <- Console.printLine("What is your name?").orDie
  name <- Console.readLine.orDie
  _    <- Console.printLine(s"Hello, $name!").orDie
yield ()

// Service pattern with ZLayer
trait UserRepository:
  def findById(id: Long): Task[Option[User]]
  def save(user: User): Task[User]

case class UserRepositoryLive(db: Database) extends UserRepository:
  def findById(id: Long): Task[Option[User]] = ???
  def save(user: User): Task[User] = ???

object UserRepositoryLive:
  val layer: ZLayer[Database, Nothing, UserRepository] =
    ZLayer.fromFunction(UserRepositoryLive(_))

// ZIOApp entry point
object Main extends ZIOAppDefault:
  def run = program
```

### http4s (Functional HTTP)

```scala
// build.sbt dependencies
// "org.http4s" %% "http4s-ember-server" % "0.23.30"
// "org.http4s" %% "http4s-ember-client" % "0.23.30"
// "org.http4s" %% "http4s-circe"        % "0.23.30"
// "org.http4s" %% "http4s-dsl"          % "0.23.30"

import cats.effect.*
import org.http4s.*
import org.http4s.dsl.io.*
import org.http4s.ember.server.EmberServerBuilder
import org.http4s.circe.*
import io.circe.generic.auto.*
import com.comcast.ip4s.*

case class User(id: Long, name: String, email: String)

// Routes definition
val userRoutes: HttpRoutes[IO] = HttpRoutes.of[IO]:
  case GET -> Root / "users" =>
    Ok(List(User(1, "Alice", "alice@example.com")))

  case GET -> Root / "users" / LongVar(id) =>
    Ok(User(id, "Alice", "alice@example.com"))

  case req @ POST -> Root / "users" =>
    for
      user <- req.as[User]
      resp <- Created(user)
    yield resp

// Server setup
object Server extends IOApp.Simple:
  def run: IO[Unit] =
    EmberServerBuilder
      .default[IO]
      .withHost(host"0.0.0.0")
      .withPort(port"8080")
      .withHttpApp(userRoutes.orNotFound)
      .build
      .useForever
```

## Concurrency and Actor Model

### Apache Pekko (Typed Actors)

```scala
// build.sbt dependency
// "org.apache.pekko" %% "pekko-actor-typed" % "1.1.3"

import org.apache.pekko.actor.typed.*
import org.apache.pekko.actor.typed.scaladsl.*

// Define protocol (messages)
sealed trait Command
case class Greet(name: String, replyTo: ActorRef[Greeting]) extends Command
case class Greeting(message: String)

// Define behavior
object Greeter:
  def apply(): Behavior[Command] = Behaviors.receive: (context, message) =>
    message match
      case Greet(name, replyTo) =>
        context.log.info(s"Greeting $name")
        replyTo ! Greeting(s"Hello, $name!")
        Behaviors.same

// Spawn and use
object Main:
  def apply(): Behavior[Nothing] =
    Behaviors.setup[Nothing]: context =>
      val greeter = context.spawn(Greeter(), "greeter")
      // ...
      Behaviors.empty
```

### Scala Futures and Concurrency

```scala
import scala.concurrent.{Future, ExecutionContext}
import scala.concurrent.ExecutionContext.Implicits.global
import scala.util.{Success, Failure}

// Creating futures
val future: Future[Int] = Future:
  Thread.sleep(1000)
  42

// Composing futures
val combined: Future[String] = for
  a <- Future(fetchData("url1"))
  b <- Future(fetchData("url2"))
yield s"$a and $b"

// Parallel execution
val parallel: Future[(String, String)] =
  val f1 = Future(fetchData("url1"))
  val f2 = Future(fetchData("url2"))
  f1.zip(f2)

// Error handling
future.recover:
  case _: TimeoutException => 0
  case e: Exception => -1

// Callbacks
future.onComplete:
  case Success(value) => println(s"Got: $value")
  case Failure(ex) => println(s"Failed: ${ex.getMessage}")
```

## Data Access

### Doobie (Functional JDBC)

```scala
// build.sbt dependency
// "org.tpolecat" %% "doobie-core"     % "1.0.0-RC6"
// "org.tpolecat" %% "doobie-hikari"   % "1.0.0-RC6"
// "org.tpolecat" %% "doobie-postgres" % "1.0.0-RC6"

import doobie.*
import doobie.implicits.*
import cats.effect.IO

case class User(id: Long, name: String, email: String)

// Queries
val findById: Long => ConnectionIO[Option[User]] = id =>
  sql"SELECT id, name, email FROM users WHERE id = $id"
    .query[User]
    .option

val findAll: ConnectionIO[List[User]] =
  sql"SELECT id, name, email FROM users"
    .query[User]
    .to[List]

val insert: User => ConnectionIO[Int] = user =>
  sql"INSERT INTO users (name, email) VALUES (${user.name}, ${user.email})"
    .update
    .run

// Transactor setup
import doobie.hikari.HikariTransactor
import cats.effect.Resource

val transactor: Resource[IO, HikariTransactor[IO]] =
  HikariTransactor.newHikariTransactor[IO](
    driverClassName = "org.postgresql.Driver",
    url = "jdbc:postgresql://localhost:5432/mydb",
    user = "postgres",
    pass = "password",
    connectEC = ExecutionContext.global
  )

// Execute queries
val program: IO[Option[User]] =
  transactor.use: xa =>
    findById(1L).transact(xa)
```

### Circe (JSON)

```scala
// build.sbt dependency
// "io.circe" %% "circe-core"    % "0.14.10"
// "io.circe" %% "circe-generic" % "0.14.10"
// "io.circe" %% "circe-parser"  % "0.14.10"

import io.circe.*
import io.circe.generic.auto.*
import io.circe.syntax.*
import io.circe.parser.*

case class User(id: Long, name: String, email: String)

// Automatic derivation
val user = User(1, "Alice", "alice@example.com")
val json: String = user.asJson.noSpaces
// {"id":1,"name":"Alice","email":"alice@example.com"}

val parsed: Either[Error, User] = decode[User](json)

// Custom encoders/decoders
given Encoder[User] = Encoder.instance: u =>
  Json.obj(
    "id" -> u.id.asJson,
    "name" -> u.name.asJson,
    "email" -> u.email.asJson
  )

given Decoder[User] = Decoder.instance: cursor =>
  for
    id    <- cursor.downField("id").as[Long]
    name  <- cursor.downField("name").as[String]
    email <- cursor.downField("email").as[String]
  yield User(id, name, email)
```

## Testing

### MUnit

```scala
// build.sbt dependency
// "org.scalameta" %% "munit" % "1.0.0" % Test

import munit.FunSuite

class CalculatorSuite extends FunSuite:
  test("addition"):
    assertEquals(1 + 1, 2)

  test("division by zero"):
    intercept[ArithmeticException]:
      1 / 0

  test("async operation".ignore):
    // Skipped test
    ???

// Fixtures
class DatabaseSuite extends FunSuite:
  val db = FunFixture[Database](
    setup = _ => Database.connect(),
    teardown = db => db.close()
  )

  db.test("query returns results"): db =>
    val results = db.query("SELECT 1")
    assert(results.nonEmpty)
```

### ScalaTest

```scala
// build.sbt dependency
// "org.scalatest" %% "scalatest" % "3.2.19" % Test

import org.scalatest.flatspec.AnyFlatSpec
import org.scalatest.matchers.should.Matchers

class CalculatorSpec extends AnyFlatSpec, Matchers:
  "A Calculator" should "add numbers correctly" in:
    val result = Calculator.add(2, 3)
    result shouldBe 5

  it should "handle negative numbers" in:
    Calculator.add(-1, -2) shouldBe -3

  it should "throw on overflow" in:
    an[ArithmeticException] should be thrownBy:
      Calculator.addExact(Int.MaxValue, 1)

// FunSpec style
import org.scalatest.funspec.AnyFunSpec

class UserServiceSpec extends AnyFunSpec, Matchers:
  describe("UserService"):
    describe("findById"):
      it("should return user when exists"):
        val user = service.findById(1L)
        user shouldBe defined

      it("should return None when not found"):
        val user = service.findById(999L)
        user shouldBe empty
```

### ScalaCheck (Property-Based Testing)

```scala
// build.sbt dependency
// "org.scalameta" %% "munit-scalacheck" % "1.0.0" % Test

import munit.ScalaCheckSuite
import org.scalacheck.Prop.*

class MathPropertySuite extends ScalaCheckSuite:
  property("addition is commutative"):
    forAll: (a: Int, b: Int) =>
      assertEquals(a + b, b + a)

  property("list reverse is involutive"):
    forAll: (xs: List[Int]) =>
      assertEquals(xs.reverse.reverse, xs)

  property("string length is non-negative"):
    forAll: (s: String) =>
      assert(s.length >= 0)

// Custom generators
import org.scalacheck.Gen

val genPositiveInt: Gen[Int] = Gen.posNum[Int]
val genEmail: Gen[String] = for
  user   <- Gen.alphaNumStr.suchThat(_.nonEmpty)
  domain <- Gen.alphaNumStr.suchThat(_.nonEmpty)
yield s"$user@$domain.com"
```

### Cats Effect Testing

```scala
// build.sbt dependency
// "org.typelevel" %% "munit-cats-effect" % "2.0.0" % Test

import cats.effect.IO
import munit.CatsEffectSuite

class ServiceSuite extends CatsEffectSuite:
  test("IO returns expected value"):
    IO.pure(42).map: result =>
      assertEquals(result, 42)

  test("resource is properly managed"):
    val resource = Resource.make(IO.println("acquire"))(_ => IO.println("release"))
    resource.use(_ => IO.pure("done")).map: result =>
      assertEquals(result, "done")
```

## Build and Tooling

### sbt Multi-Module Project

```scala
// build.sbt
ThisBuild / scalaVersion := "3.3.4"
ThisBuild / organization := "com.example"
ThisBuild / version := "0.1.0-SNAPSHOT"

// Shared settings
lazy val commonSettings = Seq(
  scalacOptions ++= Seq(
    "-Wunused:all",
    "-Werror",
    "-deprecation",
    "-feature"
  )
)

lazy val root = project
  .in(file("."))
  .aggregate(core, api, cli)

lazy val core = project
  .in(file("modules/core"))
  .settings(
    commonSettings,
    libraryDependencies ++= Seq(
      "org.typelevel" %% "cats-effect" % "3.5.7",
      "org.scalameta" %% "munit" % "1.0.0" % Test
    )
  )

lazy val api = project
  .in(file("modules/api"))
  .dependsOn(core)
  .settings(
    commonSettings,
    libraryDependencies ++= Seq(
      "org.http4s" %% "http4s-ember-server" % "0.23.30",
      "org.http4s" %% "http4s-circe" % "0.23.30",
      "org.http4s" %% "http4s-dsl" % "0.23.30"
    )
  )

lazy val cli = project
  .in(file("modules/cli"))
  .dependsOn(core)
  .settings(commonSettings)
```

### scalafmt Configuration

```hocon
# .scalafmt.conf
version = 3.8.3
runner.dialect = scala3
maxColumn = 100
indent.main = 2
indent.callSite = 2
indent.defnSite = 2
align.preset = more
rewrite.rules = [
  RedundantBraces,
  RedundantParens,
  SortModifiers,
  PreferCurlyFors
]
rewrite.scala3.convertToNewSyntax = true
rewrite.scala3.removeOptionalBraces = true
```

### sbt Commands Reference

```bash
sbt compile          # Compile main sources
sbt test             # Run all tests
sbt "testOnly *Spec" # Run specific test
sbt run              # Run main class
sbt console          # Start Scala REPL with project classpath
sbt clean            # Clean build artifacts
sbt assembly         # Create fat JAR (requires sbt-assembly)
sbt scalafmtAll      # Format all sources
sbt dependencyTree   # Show dependency tree (requires sbt-dependency-graph)
sbt "show fullClasspath" # Show classpath
```

## Common Patterns

### Error Handling Strategy

```scala
// Domain errors as ADTs
enum AppError:
  case NotFound(resource: String, id: String)
  case ValidationFailed(errors: List[String])
  case Unauthorized(reason: String)
  case InternalError(cause: Throwable)

// Either-based error handling
type Result[A] = Either[AppError, A]

def findUser(id: Long): Result[User] =
  repository.findById(id) match
    case Some(user) => Right(user)
    case None => Left(AppError.NotFound("User", id.toString))

def validateUser(user: User): Result[User] =
  val errors = List.newBuilder[String]
  if user.name.isEmpty then errors += "Name is required"
  if !user.email.contains("@") then errors += "Invalid email"
  val errs = errors.result()
  if errs.isEmpty then Right(user)
  else Left(AppError.ValidationFailed(errs))

// Chaining with for-comprehension
def createUser(request: CreateUserRequest): Result[User] = for
  validated <- validateUser(request.toUser)
  saved     <- saveUser(validated)
yield saved
```

### Service Layer Pattern

```scala
// Tagless final style
trait UserService[F[_]]:
  def findById(id: Long): F[Option[User]]
  def create(request: CreateUserRequest): F[User]
  def update(id: Long, request: UpdateUserRequest): F[User]
  def delete(id: Long): F[Unit]

// Implementation with Cats Effect
class UserServiceImpl[F[_]: Sync](
    repository: UserRepository[F],
    validator: UserValidator
) extends UserService[F]:

  def findById(id: Long): F[Option[User]] =
    repository.findById(id)

  def create(request: CreateUserRequest): F[User] =
    for
      _    <- Sync[F].fromEither(validator.validate(request))
      user <- repository.save(request.toUser)
    yield user

  def update(id: Long, request: UpdateUserRequest): F[User] =
    for
      existing <- repository.findById(id).flatMap:
        case Some(u) => Sync[F].pure(u)
        case None    => Sync[F].raiseError(NotFoundException(s"User $id"))
      updated  <- repository.save(existing.applyUpdate(request))
    yield updated

  def delete(id: Long): F[Unit] =
    repository.delete(id)
```

### Configuration with PureConfig

```scala
// build.sbt dependency
// "com.github.pureconfig" %% "pureconfig-core" % "0.17.7"

import pureconfig.*
import pureconfig.generic.derivation.default.*

case class DatabaseConfig(
    url: String,
    user: String,
    password: String,
    maxConnections: Int = 10
) derives ConfigReader

case class ServerConfig(
    host: String,
    port: Int
) derives ConfigReader

case class AppConfig(
    database: DatabaseConfig,
    server: ServerConfig
) derives ConfigReader

// application.conf
// database {
//   url = "jdbc:postgresql://localhost:5432/mydb"
//   user = "postgres"
//   password = ${DB_PASSWORD}
//   max-connections = 20
// }
// server {
//   host = "0.0.0.0"
//   port = 8080
// }

val config: AppConfig = ConfigSource.default.loadOrThrow[AppConfig]
```

## Best Practices

1. **Immutability**: Prefer `val` over `var`, use immutable collections by default
2. **ADTs**: Model domain with sealed traits/enums, make illegal states unrepresentable
3. **Pattern Matching**: Use exhaustive matching, avoid wildcard catches on sealed types
4. **Effects**: Use IO/ZIO for side effects, keep business logic pure
5. **Type Safety**: Leverage opaque types, avoid `Any`/`AnyRef`, minimize casts
6. **Error Handling**: Use `Either`/`Option` over exceptions for expected failures
7. **Testing**: Write property-based tests for invariants, unit tests for behavior
8. **Concurrency**: Prefer effect-based concurrency (Cats Effect/ZIO) over raw Futures
9. **Build**: Use sbt with strict compiler flags, enable `-Werror` in CI
10. **Style**: Follow scalafmt conventions, use Scala 3 syntax (indentation-based, `given`/`using`)
