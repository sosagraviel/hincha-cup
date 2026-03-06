---
name: angular-patterns
description: Comprehensive Angular expertise covering components, RxJS, dependency injection, NgRx state management, routing, forms, and testing
user-invokable: true
disable-model-invocation: false
---

# Angular Patterns & Best Practices

Expert guidance for building enterprise-scale Angular applications with modern patterns and best practices.

## Angular Fundamentals

### Component Structure
```typescript
import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-user-card',
  standalone: true,  // Standalone component (Angular 14+)
  templateUrl: './user-card.component.html',
  styleUrls: ['./user-card.component.scss']
})
export class UserCardComponent implements OnInit, OnDestroy {
  // Input property (data from parent)
  @Input() user!: User;
  @Input() showActions = true;

  // Output event (emit to parent)
  @Output() delete = new EventEmitter<number>();
  @Output() edit = new EventEmitter<User>();

  // Component state
  isExpanded = false;

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    // Initialization logic
  }

  ngOnDestroy(): void {
    // Cleanup logic
  }

  onDelete(): void {
    this.delete.emit(this.user.id);
  }

  onEdit(): void {
    this.edit.emit(this.user);
  }
}
```

### Template Syntax
```html
<!-- Data binding -->
<h1>{{ title }}</h1>
<p [innerHTML]="htmlContent"></p>

<!-- Property binding -->
<img [src]="imageUrl" [alt]="description">
<button [disabled]="isLoading">Submit</button>

<!-- Class and style binding -->
<div [class.active]="isActive"></div>
<div [ngClass]="{ 'active': isActive, 'disabled': isDisabled }"></div>
<div [style.color]="textColor"></div>
<div [ngStyle]="{ color: textColor, 'font-size': fontSize + 'px' }"></div>

<!-- Event binding -->
<button (click)="handleClick()">Click</button>
<button (click)="count = count + 1">Increment</button>
<input (keyup.enter)="submit()">

<!-- Two-way binding -->
<input [(ngModel)]="username">

<!-- Structural directives -->
<div *ngIf="isVisible">Visible content</div>
<div *ngIf="user; else loading">{{ user.name }}</div>
<ng-template #loading>Loading...</ng-template>

<ul>
  <li *ngFor="let item of items; let i = index; trackBy: trackByFn">
    {{ i }}: {{ item.name }}
  </li>
</ul>

<div [ngSwitch]="status">
  <p *ngSwitchCase="'active'">Active</p>
  <p *ngSwitchCase="'inactive'">Inactive</p>
  <p *ngSwitchDefault>Unknown</p>
</div>
```

### Lifecycle Hooks
```typescript
import { Component, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-example',
  template: `<div>Example</div>`
})
export class ExampleComponent implements OnInit, OnChanges, OnDestroy {
  @Input() data: any;

  // Called when input properties change
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      console.log('Data changed from', changes['data'].previousValue, 'to', changes['data'].currentValue);
    }
  }

  // Called once after first ngOnChanges
  ngOnInit(): void {
    console.log('Component initialized');
  }

  // Called before component is destroyed
  ngOnDestroy(): void {
    console.log('Component destroyed - cleanup here');
  }
}
```

## Dependency Injection

### Services
```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'  // Singleton service
})
export class UserService {
  private apiUrl = '/api/users';

  constructor(private http: HttpClient) {}

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.apiUrl);
  }

  getUser(id: number): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/${id}`);
  }

  createUser(user: Partial<User>): Observable<User> {
    return this.http.post<User>(this.apiUrl, user);
  }

  updateUser(id: number, user: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/${id}`, user);
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
```

### Injection Tokens
```typescript
import { InjectionToken } from '@angular/core';

// Define token
export const API_URL = new InjectionToken<string>('API_URL');

// Provide value
@NgModule({
  providers: [
    { provide: API_URL, useValue: 'https://api.example.com' }
  ]
})
export class AppModule {}

// Inject
constructor(@Inject(API_URL) private apiUrl: string) {}
```

### Provider Scopes
```typescript
// Root level (singleton)
@Injectable({
  providedIn: 'root'
})
export class GlobalService {}

// Module level
@NgModule({
  providers: [ModuleScopedService]
})
export class FeatureModule {}

// Component level (new instance per component)
@Component({
  selector: 'app-user',
  providers: [ComponentScopedService]
})
export class UserComponent {}
```

## RxJS & Reactive Programming

### Common Operators
```typescript
import { map, filter, switchMap, debounceTime, distinctUntilChanged, catchError, tap } from 'rxjs/operators';
import { of, throwError } from 'rxjs';

// Transform data
this.users$ = this.userService.getUsers().pipe(
  map(users => users.filter(u => u.active)),
  tap(users => console.log('Active users:', users)),
  catchError(error => {
    console.error('Error:', error);
    return of([]);  // Return empty array on error
  })
);

// Search with debounce
this.searchTerm$ = new Subject<string>();
this.results$ = this.searchTerm$.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  switchMap(term => this.searchService.search(term))
);

// Combine observables
import { combineLatest, forkJoin } from 'rxjs';

// CombineLatest: emits when any input emits
this.combined$ = combineLatest([
  this.users$,
  this.roles$
]).pipe(
  map(([users, roles]) => ({ users, roles }))
);

// ForkJoin: waits for all to complete (like Promise.all)
forkJoin({
  users: this.userService.getUsers(),
  settings: this.settingsService.getSettings()
}).subscribe(({ users, settings }) => {
  // Both completed
});
```

### Subject Types
```typescript
import { Subject, BehaviorSubject, ReplaySubject } from 'rxjs';

// Subject: no initial value, only new emissions
const subject$ = new Subject<number>();
subject$.subscribe(v => console.log('A:', v));
subject$.next(1);  // A: 1
subject$.subscribe(v => console.log('B:', v));
subject$.next(2);  // A: 2, B: 2

// BehaviorSubject: requires initial value, emits current value to new subscribers
const behavior$ = new BehaviorSubject<number>(0);
behavior$.subscribe(v => console.log('A:', v));  // A: 0
behavior$.next(1);  // A: 1
behavior$.subscribe(v => console.log('B:', v));  // B: 1 (gets current value)

// ReplaySubject: replays N previous values to new subscribers
const replay$ = new ReplaySubject<number>(2);  // Replay last 2
replay$.next(1);
replay$.next(2);
replay$.next(3);
replay$.subscribe(v => console.log(v));  // 2, 3
```

### Async Pipe in Templates
```typescript
// Component
export class UsersComponent {
  users$ = this.userService.getUsers();

  constructor(private userService: UserService) {}
}
```

```html
<!-- Template - async pipe handles subscription/unsubscription -->
<div *ngIf="users$ | async as users; else loading">
  <div *ngFor="let user of users">
    {{ user.name }}
  </div>
</div>
<ng-template #loading>Loading...</ng-template>
```

### Unsubscribe Patterns
```typescript
import { Component, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-example',
  template: `<div>Example</div>`
})
export class ExampleComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(private userService: UserService) {
    // All subscriptions will be canceled on destroy
    this.userService.getUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe(users => console.log(users));

    this.userService.getSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe(settings => console.log(settings));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

## State Management (NgRx)

### Store Setup
```typescript
// state/user.state.ts
export interface UserState {
  users: User[];
  selectedUser: User | null;
  loading: boolean;
  error: string | null;
}

export const initialState: UserState = {
  users: [],
  selectedUser: null,
  loading: false,
  error: null
};
```

### Actions
```typescript
// state/user.actions.ts
import { createAction, props } from '@ngrx/store';

export const loadUsers = createAction('[User] Load Users');
export const loadUsersSuccess = createAction(
  '[User] Load Users Success',
  props<{ users: User[] }>()
);
export const loadUsersFailure = createAction(
  '[User] Load Users Failure',
  props<{ error: string }>()
);

export const selectUser = createAction(
  '[User] Select User',
  props<{ userId: number }>()
);
```

### Reducers
```typescript
// state/user.reducer.ts
import { createReducer, on } from '@ngrx/store';
import * as UserActions from './user.actions';

export const userReducer = createReducer(
  initialState,
  on(UserActions.loadUsers, state => ({
    ...state,
    loading: true,
    error: null
  })),
  on(UserActions.loadUsersSuccess, (state, { users }) => ({
    ...state,
    users,
    loading: false
  })),
  on(UserActions.loadUsersFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error
  })),
  on(UserActions.selectUser, (state, { userId }) => ({
    ...state,
    selectedUser: state.users.find(u => u.id === userId) || null
  }))
);
```

### Selectors
```typescript
// state/user.selectors.ts
import { createFeatureSelector, createSelector } from '@ngrx/store';

export const selectUserState = createFeatureSelector<UserState>('user');

export const selectAllUsers = createSelector(
  selectUserState,
  state => state.users
);

export const selectActiveUsers = createSelector(
  selectAllUsers,
  users => users.filter(u => u.active)
);

export const selectUserById = (id: number) => createSelector(
  selectAllUsers,
  users => users.find(u => u.id === id)
);

export const selectLoading = createSelector(
  selectUserState,
  state => state.loading
);
```

### Effects
```typescript
// state/user.effects.ts
import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import * as UserActions from './user.actions';

@Injectable()
export class UserEffects {
  loadUsers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UserActions.loadUsers),
      switchMap(() =>
        this.userService.getUsers().pipe(
          map(users => UserActions.loadUsersSuccess({ users })),
          catchError(error => of(UserActions.loadUsersFailure({ error: error.message })))
        )
      )
    )
  );

  constructor(
    private actions$: Actions,
    private userService: UserService
  ) {}
}
```

### Using Store in Components
```typescript
import { Store } from '@ngrx/store';
import * as UserActions from './state/user.actions';
import * as UserSelectors from './state/user.selectors';

@Component({
  selector: 'app-users',
  template: `
    <div *ngIf="loading$ | async">Loading...</div>
    <div *ngFor="let user of users$ | async">
      {{ user.name }}
    </div>
  `
})
export class UsersComponent implements OnInit {
  users$ = this.store.select(UserSelectors.selectAllUsers);
  loading$ = this.store.select(UserSelectors.selectLoading);

  constructor(private store: Store) {}

  ngOnInit(): void {
    this.store.dispatch(UserActions.loadUsers());
  }

  selectUser(id: number): void {
    this.store.dispatch(UserActions.selectUser({ userId: id }));
  }
}
```

## Routing

### Route Configuration
```typescript
import { Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'users/:id', component: UserDetailComponent },
  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'users', component: AdminUsersComponent },
      { path: 'settings', component: AdminSettingsComponent }
    ]
  },
  {
    path: 'lazy',
    loadChildren: () => import('./lazy/lazy.module').then(m => m.LazyModule)
  },
  { path: '**', component: NotFoundComponent }
];
```

### Route Guards
```typescript
import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    if (this.authService.isAuthenticated()) {
      return true;
    }

    this.router.navigate(['/login'], {
      queryParams: { returnUrl: state.url }
    });
    return false;
  }
}

// CanDeactivate guard
export interface CanComponentDeactivate {
  canDeactivate: () => Observable<boolean> | Promise<boolean> | boolean;
}

@Injectable({ providedIn: 'root' })
export class CanDeactivateGuard implements CanDeactivate<CanComponentDeactivate> {
  canDeactivate(component: CanComponentDeactivate): Observable<boolean> | Promise<boolean> | boolean {
    return component.canDeactivate ? component.canDeactivate() : true;
  }
}
```

### Route Parameters and Navigation
```typescript
import { ActivatedRoute, Router } from '@angular/router';

export class UserDetailComponent {
  userId: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {
    // Route params
    this.route.params.subscribe(params => {
      this.userId = +params['id'];
    });

    // Query params
    this.route.queryParams.subscribe(params => {
      const page = params['page'];
    });
  }

  navigateToEdit(): void {
    this.router.navigate(['/users', this.userId, 'edit']);
  }

  navigateWithQuery(): void {
    this.router.navigate(['/users'], {
      queryParams: { page: 2, sort: 'name' }
    });
  }
}
```

## Forms

### Reactive Forms
```typescript
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';

@Component({
  selector: 'app-user-form',
  templateUrl: './user-form.component.html'
})
export class UserFormComponent implements OnInit {
  userForm: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      age: [null, [Validators.min(18), Validators.max(100)]],
      address: this.fb.group({
        street: [''],
        city: [''],
        zip: ['']
      }),
      hobbies: this.fb.array([])
    });
  }

  get hobbies(): FormArray {
    return this.userForm.get('hobbies') as FormArray;
  }

  addHobby(): void {
    this.hobbies.push(this.fb.control(''));
  }

  removeHobby(index: number): void {
    this.hobbies.removeAt(index);
  }

  onSubmit(): void {
    if (this.userForm.valid) {
      console.log(this.userForm.value);
    } else {
      this.userForm.markAllAsTouched();
    }
  }
}
```

```html
<form [formGroup]="userForm" (ngSubmit)="onSubmit()">
  <input formControlName="name">
  <div *ngIf="userForm.get('name')?.invalid && userForm.get('name')?.touched">
    Name is required and must be at least 2 characters
  </div>

  <input formControlName="email">
  <div *ngIf="userForm.get('email')?.invalid && userForm.get('email')?.touched">
    Valid email is required
  </div>

  <div formGroupName="address">
    <input formControlName="street" placeholder="Street">
    <input formControlName="city" placeholder="City">
  </div>

  <div formArrayName="hobbies">
    <div *ngFor="let hobby of hobbies.controls; let i = index">
      <input [formControlName]="i">
      <button type="button" (click)="removeHobby(i)">Remove</button>
    </div>
  </div>
  <button type="button" (click)="addHobby()">Add Hobby</button>

  <button type="submit" [disabled]="userForm.invalid">Submit</button>
</form>
```

### Custom Validators
```typescript
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function forbiddenNameValidator(nameRe: RegExp): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const forbidden = nameRe.test(control.value);
    return forbidden ? { forbiddenName: { value: control.value } } : null;
  };
}

// Usage
this.userForm = this.fb.group({
  name: ['', [Validators.required, forbiddenNameValidator(/admin/i)]]
});
```

## Testing

### Component Testing
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserCardComponent } from './user-card.component';

describe('UserCardComponent', () => {
  let component: UserCardComponent;
  let fixture: ComponentFixture<UserCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UserCardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(UserCardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display user name', () => {
    component.user = { id: 1, name: 'Alice' };
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('h2').textContent).toContain('Alice');
  });

  it('should emit delete event', () => {
    component.user = { id: 1, name: 'Alice' };
    spyOn(component.delete, 'emit');

    component.onDelete();

    expect(component.delete.emit).toHaveBeenCalledWith(1);
  });
});
```

### Service Testing
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UserService]
    });

    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should fetch users', () => {
    const mockUsers = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ];

    service.getUsers().subscribe(users => {
      expect(users.length).toBe(2);
      expect(users).toEqual(mockUsers);
    });

    const req = httpMock.expectOne('/api/users');
    expect(req.request.method).toBe('GET');
    req.flush(mockUsers);
  });
});
```

## Best Practices

1. **Components**: Keep components small and focused, use OnPush change detection
2. **Services**: Use services for business logic, HTTP requests, state management
3. **RxJS**: Use async pipe in templates, unsubscribe from observables
4. **Forms**: Use reactive forms for complex forms, template-driven for simple
5. **State Management**: Use NgRx for complex state, services for simple state
6. **Routing**: Lazy load feature modules for better performance
7. **Testing**: Write unit tests for services and components
8. **TypeScript**: Enable strict mode, use interfaces for type safety
9. **Performance**: Use trackBy with *ngFor, lazy load images and routes
10. **Architecture**: Follow feature module structure, separate concerns
