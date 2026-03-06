import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './database/models/user.model';
import { UserRepository } from './repository/user.repository';
import { UserService } from './service/user.service';
import { UserController } from './presentation/user.controller';

/**
 * Encapsulates user profile management.
 * Exports UserRepository and UserService for use by other modules (e.g., auth, invite).
 *
 * @example
 * // Import in another module:
 * @Module({ imports: [UserModule] })
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserRepository, UserService],
  exports: [UserRepository, UserService]
})
export class UserModule {}
