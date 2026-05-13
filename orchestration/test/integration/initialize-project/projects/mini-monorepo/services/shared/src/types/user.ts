export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
}
