import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard.js';
import { UsersService } from './users.service.js';
import { User } from './users.entity.js';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @UseGuards(AuthGuard)
  async create(@Body() dto: CreateUserDto): Promise<User> {
    return this.users.create(dto);
  }
}
