import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { UserService } from '@modules/user/service/user.service';
import { User } from '@modules/user/database/models/user.model';
import { UpdateUserDto } from '@modules/user/presentation/dto/update-user.dto';

/**
 * Handles current-user endpoints: profile retrieval and updates.
 * All routes require JWT authentication.
 *
 * @example
 * // GET  /api/v1/users/me
 * // PATCH /api/v1/users/me  { fullName: 'New Name' }
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ description: 'Current user profile' })
  async getMe(@CurrentUser() user: User) {
    return this.userService.getCurrentUser(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiOkResponse({ description: 'Updated user profile' })
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateUserDto) {
    return this.userService.updateCurrentUser(user.id, dto);
  }
}
