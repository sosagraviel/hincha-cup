import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiConflictResponse,
  ApiBadRequestResponse
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { OrgMemberGuard } from '@modules/auth/guards/org-member.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { OrgRoles } from '@modules/auth/decorators/org-roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { OrganizationService } from '@modules/organization/service/organization.service';
import { User } from '@modules/user/database/models/user.model';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  AddOrgMemberDto,
  UpdateMemberRoleDto
} from '@livonit/shared';

/**
 * REST endpoints for organization CRUD and member management.
 * Enforces JWT auth, org membership, and role-based access (owner/admin).
 *
 * @example
 * // GET    /api/v1/organizations
 * // POST   /api/v1/organizations/:id/members  { userId, role }
 */
@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @ApiOperation({
    summary: 'List all organizations the current user belongs to'
  })
  @ApiOkResponse({ description: 'Array of organizations' })
  async list(@CurrentUser() user: User) {
    return this.organizationService.listUserOrganizations(user.id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  @ApiOperation({ summary: 'Create a new organization (super_admin only)' })
  @ApiCreatedResponse({ description: 'Organization created' })
  @ApiForbiddenResponse({ description: 'Requires super_admin Keycloak role' })
  @ApiConflictResponse({ description: 'Slug already taken' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  async create(@CurrentUser() user: User, @Body() dto: CreateOrganizationDto) {
    return this.organizationService.createOrganization(dto, user.id);
  }

  @Get(':id')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Get a single organization by ID' })
  @ApiOkResponse({ description: 'Organization details' })
  @ApiForbiddenResponse({ description: 'Not a member of this organization' })
  async getOne(@Param('id') id: string) {
    return this.organizationService.getOrganization(id);
  }

  @Patch(':id')
  @UseGuards(OrgMemberGuard)
  @OrgRoles('owner', 'admin')
  @ApiOperation({ summary: 'Update organization details (owner/admin only)' })
  @ApiOkResponse({ description: 'Updated organization' })
  @ApiForbiddenResponse({ description: 'Requires owner or admin role' })
  async update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationService.updateOrganization(id, dto);
  }

  @Post(':id/members')
  @UseGuards(OrgMemberGuard)
  @OrgRoles('owner', 'admin')
  @ApiOperation({
    summary: 'Add a user to the organization (owner/admin only)'
  })
  @ApiCreatedResponse({ description: 'Member added' })
  @ApiConflictResponse({ description: 'User is already a member' })
  @ApiForbiddenResponse({ description: 'Requires owner or admin role' })
  async addMember(@Param('id') id: string, @Body() dto: AddOrgMemberDto) {
    return this.organizationService.addMember(id, dto.userId, dto.role);
  }

  @Delete(':id/members/:userId')
  @UseGuards(OrgMemberGuard)
  @OrgRoles('owner', 'admin')
  @ApiOperation({
    summary: 'Remove a member from the organization (owner/admin only)'
  })
  @ApiOkResponse({ description: 'Member removed' })
  @ApiForbiddenResponse({ description: 'Requires owner or admin role' })
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    await this.organizationService.removeMember(id, userId);
    return { message: 'Member removed successfully' };
  }

  @Patch(':id/members/:userId')
  @UseGuards(OrgMemberGuard)
  @OrgRoles('owner', 'admin')
  @ApiOperation({ summary: "Update a member's role (owner/admin only)" })
  @ApiOkResponse({ description: 'Role updated' })
  @ApiForbiddenResponse({ description: 'Requires owner or admin role' })
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto
  ) {
    return this.organizationService.updateMemberRole(id, userId, dto.role);
  }
}
