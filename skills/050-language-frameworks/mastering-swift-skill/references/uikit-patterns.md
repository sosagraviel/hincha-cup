# UIKit Patterns

> **Load when:** building UIKit screens, wiring Combine bindings between a ViewModel and a view controller, implementing navigation with the Coordinator pattern, presenting errors to the user, or bridging UIKit and SwiftUI.

## Quick Snippets

| I need to... | Pattern |
|---|---|
| Register and dequeue a cell safely | `UICollectionView.CellRegistration` + `dequeueConfiguredReusableCell` |
| Animate list changes without a full reload | `dataSource.apply(snapshot, animatingDifferences: true)` |
| Bind `@Published` to a `UILabel` | `.assign(to: \.text, on: label).store(in: &cancellables)` |
| Bind `@Published` with side effects (avoid retain cycle) | `.sink { [weak self] value in ... }.store(in: &cancellables)` |
| Own navigation flow | `Coordinator` with `childCoordinators` |
| Push a view controller | `navigationController?.pushViewController(vc, animated: true)` |
| Present a modal | `present(vc, animated: true)` |
| Swap root after login / logout | `window.rootViewController = ...; UIView.transition(with: window, ...)` |
| Show an error alert | `showError(_:)` extension on `UIViewController` |
| Embed a SwiftUI view inside UIKit | `UIHostingController(rootView: ...)` |
| Expose a UIKit view controller to SwiftUI | `UIViewControllerRepresentable` |
| Wire dependencies at startup | `AppDependencies.live()` — see [Toolchain — Dependency Container](toolchain.md#dependency-container) |

## View Controller Lifecycle

```swift
class ProfileViewController: UIViewController {

    // Prefer lazy initialization over implicitly-unwrapped optionals
    private lazy var tableView: UITableView = {
        let tv = UITableView(frame: .zero, style: .insetGrouped)
        tv.translatesAutoresizingMaskIntoConstraints = false
        tv.dataSource = self
        tv.delegate = self
        return tv
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        setupLayout()
        bindViewModel()
    }

    private func setupLayout() {
        view.addSubview(tableView)
        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func bindViewModel() {
        // Subscribe to viewModel updates here
    }
}
```

### Lifecycle Method Order

| Method | Purpose |
|--------|---------|
| `loadView` | Create root view (if not using storyboards) |
| `viewDidLoad` | One-time setup: layout, delegates, bindings |
| `viewWillAppear` | Pre-appearance work (refresh data) |
| `viewDidAppear` | Start animations or monitoring |
| `viewWillDisappear` | Pause animations, commit edits |
| `viewDidDisappear` | Stop heavy work, remove observers |
| `deinit` | Clean up manually-retained resources |

## Modern Collection Views

Use `UICollectionViewDiffableDataSource` with `CellRegistration` (iOS 14+). `CellRegistration` replaces the legacy `register(_:forCellWithReuseIdentifier:)` + `as! Cell` pattern — no reuse identifiers, no force casts.

```swift
// Item must be Hashable — the differ uses hash equality to detect moves/inserts/deletes
enum Section: Hashable { case main }

final class ItemListViewController: UIViewController {
    private lazy var collectionView = UICollectionView(
        frame: .zero,
        collectionViewLayout: UICollectionViewCompositionalLayout.list(
            using: UICollectionLayoutListConfiguration(appearance: .insetGrouped)
        )
    )

    // CellRegistration — typed, no reuse identifiers, no force casts
    private let cellRegistration = UICollectionView.CellRegistration<UICollectionViewListCell, Item> { cell, _, item in
        var content = cell.defaultContentConfiguration()
        content.text = item.name
        content.secondaryText = item.subtitle
        cell.contentConfiguration = content
    }

    private lazy var dataSource = UICollectionViewDiffableDataSource<Section, Item>(
        collectionView: collectionView
    ) { [weak self] cv, indexPath, item in
        guard let self else { return nil }
        return cv.dequeueConfiguredReusableCell(using: cellRegistration, for: indexPath, item: item)
    }

    func apply(_ items: [Item], animated: Bool = true) {
        var snapshot = NSDiffableDataSourceSnapshot<Section, Item>()
        snapshot.appendSections([.main])
        snapshot.appendItems(items, toSection: .main)
        dataSource.apply(snapshot, animatingDifferences: animated)
    }
}
```

**Key rules:**
- Call `apply(_:animatingDifferences:)` from the main thread.
- Never mutate `dataSource.snapshot()` directly — always build a fresh snapshot and apply it.
- Use `reconfigureItems(_:)` (iOS 15+) to update cell content without reloading the full cell.
- For custom `UICollectionViewCell` subclasses, substitute the generic parameter: `CellRegistration<MyCell, Item>`.

## Combine Integration

Use Combine to bind ViewModel `@Published` properties to UI updates.

```swift
import Combine

class SearchViewModel {
    @Published var query: String = ""
    @Published private(set) var results: [Item] = []

    private let repository: ItemRepository
    private var cancellables = Set<AnyCancellable>()

    init(repository: ItemRepository) {
        self.repository = repository
        $query
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .removeDuplicates()
            .filter { !$0.isEmpty }
            .flatMap { [weak self] query -> AnyPublisher<[Item], Never> in
                // weak self because the closure is stored on self via the pipeline
                self?.repository.search(query: query) ?? Just([]).eraseToAnyPublisher()
            }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.results = $0 }   // assign(to:on:) would retain self strongly → cycle
            .store(in: &cancellables)
    }
}
```

### Binding @Published to UIKit Controls

```swift
class ProfileViewController: UIViewController {
    private let viewModel: ProfileViewModel   // injected; never force-unwrapped
    private var cancellables = Set<AnyCancellable>()

    private lazy var nameLabel = UILabel()
    private lazy var activityIndicator = UIActivityIndicatorView(style: .medium)

    init(viewModel: ProfileViewModel) {
        self.viewModel = viewModel
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("use init(viewModel:)") }

    override func viewDidLoad() {
        super.viewDidLoad()
        bindViewModel()
    }

    private func bindViewModel() {
        viewModel.$name
            .receive(on: DispatchQueue.main)
            .assign(to: \.text, on: nameLabel)
            .store(in: &cancellables)

        viewModel.$isLoading
            .receive(on: DispatchQueue.main)
            .sink { [weak self] loading in
                loading ? self?.activityIndicator.startAnimating()
                        : self?.activityIndicator.stopAnimating()
            }
            .store(in: &cancellables)
    }
}
```

## Coordinator Pattern

Coordinators own navigation flow, keeping view controllers free of routing logic.

```swift
protocol Coordinator: AnyObject {
    var childCoordinators: [Coordinator] { get set }
    func start()
}

extension Coordinator {
    func removeChild(_ coordinator: Coordinator) {
        childCoordinators.removeAll { $0 === coordinator }
    }
}

final class AppCoordinator: Coordinator {
    var childCoordinators: [Coordinator] = []
    private let window: UIWindow

    init(window: UIWindow) { self.window = window }

    func start() {
        let auth = AuthCoordinator(window: window)
        auth.delegate = self
        childCoordinators.append(auth)
        auth.start()
    }
}

extension AppCoordinator: AuthCoordinatorDelegate {
    func coordinatorDidFinish(_ coordinator: AuthCoordinator) {
        // Remove the finished child first so it can deallocate
        removeChild(coordinator)

        let home = HomeCoordinator(window: window)
        childCoordinators.append(home)
        home.start()
    }
}
```

## Navigation Primitives

Coordinators own the decision of where to go; these primitives are the implementation. All navigation calls happen inside coordinator methods, never inside view controllers.

### Push and Pop

```swift
// Push — adds to the navigation stack
navigationController.pushViewController(detailVC, animated: true)

// Pop — goes back one level
navigationController.popViewController(animated: true)

// Pop to a specific VC already on the stack
if let target = navigationController.viewControllers.first(where: { $0 is HomeViewController }) {
    navigationController.popToViewController(target, animated: true)
}

// Pop to root
navigationController.popToRootViewController(animated: true)
```

### Modal Presentation

```swift
// Full-screen modal
let vc = ProfileEditViewController(viewModel: viewModel)
vc.modalPresentationStyle = .fullScreen
present(vc, animated: true)

// Sheet (default iOS 13+ card style)
let vc = FilterViewController()
present(vc, animated: true)   // .pageSheet is the default

// Dismiss from inside the presented VC — delegate back to the coordinator instead of dismissing directly
// The coordinator calls:
presentingViewController.dismiss(animated: true)
```

### Replacing the Root — Auth Flows

Swap `window.rootViewController` to transition between the auth stack and the main app. Use `UIView.transition` for a crossfade so the swap isn't jarring.

```swift
final class AppCoordinator: Coordinator {
    var childCoordinators: [Coordinator] = []
    private let window: UIWindow

    init(window: UIWindow) { self.window = window }

    func start() {
        showAuth()
    }

    private func showAuth() {
        let auth = AuthCoordinator(window: window)
        auth.delegate = self
        childCoordinators.append(auth)
        auth.start()
    }

    private func showMain() {
        let main = HomeCoordinator(window: window, dependencies: AppDependencies.live())
        childCoordinators.append(main)
        main.start()

        UIView.transition(
            with: window,
            duration: 0.35,
            options: .transitionCrossDissolve,
            animations: nil
        )
    }
}

extension AppCoordinator: AuthCoordinatorDelegate {
    func authDidComplete(_ coordinator: AuthCoordinator) {
        removeChild(coordinator)
        showMain()
    }
}
```

### Coordinator Navigation — Wiring UINavigationController

Each coordinator owns a `UINavigationController` (or receives one from its parent) and creates view controllers itself. View controllers never import the coordinator — they communicate back via a delegate protocol or closure.

```swift
final class HomeCoordinator: Coordinator {
    var childCoordinators: [Coordinator] = []
    private let navigationController: UINavigationController
    private let dependencies: AppDependencies

    init(window: UIWindow, dependencies: AppDependencies) {
        self.navigationController = UINavigationController()
        self.dependencies = dependencies
        window.rootViewController = navigationController
        window.makeKeyAndVisible()
    }

    func start() {
        let vm = HomeViewModel(repository: dependencies.itemRepository)
        let vc = HomeViewController(viewModel: vm)
        vc.delegate = self
        navigationController.setViewControllers([vc], animated: false)
    }
}

extension HomeCoordinator: HomeViewControllerDelegate {
    func didSelectItem(_ item: Item) {
        let vm = DetailViewModel(item: item, repository: dependencies.itemRepository)
        let vc = DetailViewController(viewModel: vm)
        navigationController.pushViewController(vc, animated: true)
    }
}
```

## Error Presentation

Define a reusable `showError` extension on `UIViewController` so every screen surfaces errors consistently without duplicating alert setup code.

```swift
extension UIViewController {
    func showError(_ error: Error, retryHandler: (() -> Void)? = nil) {
        let alert = UIAlertController(
            title: "Something went wrong",
            message: error.localizedDescription,
            preferredStyle: .alert
        )
        if let retry = retryHandler {
            alert.addAction(UIAlertAction(title: "Retry", style: .default) { _ in retry() })
        }
        alert.addAction(UIAlertAction(title: "OK", style: .cancel))
        present(alert, animated: true)
    }

    func showConfirmation(
        title: String,
        message: String,
        confirmTitle: String = "Confirm",
        confirmStyle: UIAlertAction.Style = .default,
        onConfirm: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: confirmTitle, style: confirmStyle) { _ in onConfirm() })
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        present(alert, animated: true)
    }
}

// Usage in a view controller
func bindViewModel() {
    viewModel.$error
        .compactMap { $0 }
        .receive(on: DispatchQueue.main)
        .sink { [weak self] error in
            self?.showError(error) { [weak self] in
                self?.viewModel.retry()
            }
        }
        .store(in: &cancellables)
}
```

**Rules:**
- Always call `showError` from the main thread — it calls `present`, which is a UI operation.
- Don't show raw `error.localizedDescription` for network errors in user-facing code — map domain errors to human-readable messages at the ViewModel layer before surfacing them.
- Use `showConfirmation` for destructive actions (delete, sign out) that need user acknowledgment before proceeding.

## Dependency Injection

Use a `struct AppDependencies` container with `live()` and `mock()` factory methods to wire concrete types at startup and swap them in tests. See the canonical pattern and example in [Toolchain — Dependency Container](toolchain.md).

## SwiftUI / UIKit Interop

### UIHostingController — embed SwiftUI inside UIKit

```swift
func embedSwiftUIView<Content: View>(_ content: Content, in parent: UIViewController) {
    let host = UIHostingController(rootView: content)
    parent.addChild(host)
    parent.view.addSubview(host.view)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
        host.view.topAnchor.constraint(equalTo: parent.view.topAnchor),
        host.view.leadingAnchor.constraint(equalTo: parent.view.leadingAnchor),
        host.view.trailingAnchor.constraint(equalTo: parent.view.trailingAnchor),
        host.view.bottomAnchor.constraint(equalTo: parent.view.bottomAnchor),
    ])
    host.didMove(toParent: parent)
}

// Pass @Observable state into the embedded SwiftUI subtree
let vm = CartViewModel()
let host = UIHostingController(rootView: CartView().environment(vm))
```

### UIViewControllerRepresentable — expose UIKit inside SwiftUI

```swift
struct ImagePickerView: UIViewControllerRepresentable {
    @Binding var selectedImage: UIImage?

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.filter = .images
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ vc: PHPickerViewController, context: Context) { }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: ImagePickerView
        init(_ parent: ImagePickerView) { self.parent = parent }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            guard let provider = results.first?.itemProvider,
                  provider.canLoadObject(ofClass: UIImage.self) else { return }
            provider.loadObject(ofClass: UIImage.self) { [weak self] image, _ in
                DispatchQueue.main.async { self?.parent.selectedImage = image as? UIImage }
            }
        }
    }
}
```

## Pitfalls

| Don't | Do |
|---|---|
| Mutate `dataSource.snapshot()` and re-apply | Always build a fresh `NSDiffableDataSourceSnapshot` and apply it |
| `.assign(to:on:)` where `on` is `self` | Use `.sink { [weak self] in ... }` — `assign(to:on:)` retains the target strongly, causing a cycle |
| `register(_:forCellWithReuseIdentifier:)` + `as! Cell` | Use `CellRegistration` — no string identifiers, no force casts, typed |
| Call `apply(snapshot:)` off the main thread | Diffable data source mutations must happen on the main thread |
| Store `AnyCancellable` in a local variable | Store in `Set<AnyCancellable>` on the controller — locals cancel immediately on dealloc |
| Storyboard segue for navigation in a Coordinator app | Push/present programmatically from the coordinator — segues bypass the coordinator |
| `navigationController?.pushViewController` from inside a view controller | Push from the coordinator — view controllers should not know where they navigate to |
| `window.rootViewController = newVC` without a transition | Wrap in `UIView.transition(with: window, ...)` — a bare swap is visually jarring |
| `error.localizedDescription` shown directly in alerts | Map domain errors to human-readable strings at the ViewModel layer before surfacing them |

## Best Practices

- Never subclass `UIView` for layout — compose with Auto Layout constraints instead
- Use `translatesAutoresizingMaskIntoConstraints = false` for every programmatic view
- Store `AnyCancellable` in a `Set<AnyCancellable>` on the view controller, not globally
- Use `.receive(on: DispatchQueue.main)` before any UI update in a Combine chain
- Cancel subscriptions in `deinit` (automatic when the `Set` deallocates)
- Prefer `[weak self]` in `sink` closures to avoid retain cycles
