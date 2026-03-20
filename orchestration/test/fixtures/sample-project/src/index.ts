import React from 'react';
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number()
});

export type User = z.infer<typeof UserSchema>;

export function validateUser(data: unknown): User {
  return UserSchema.parse(data);
}
