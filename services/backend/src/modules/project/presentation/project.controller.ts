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
import { OrgMemberGuard } from '@modules/auth/guards/org-member.guard';
import { ProjectMemberGuard } from '@modules/auth/guards/project-member.guard';
import { OrgRoles } from '@modules/auth/decorators/org-roles.decorator';
import { ProjectRoles } from '@modules/auth/decorators/project-roles.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { ProjectService } from '@modules/project/service/project.service';
import { User } from '@modules/user/database/models/user.model';
import { CreateProjectDto, UpdateProjectDto } from '@livonit/shared';

/**
 * REST endpoints for project CRUD and member management.
 * Routes are scoped under organizations (list/create) or projects (get/update/members).
 *
 * @example
 * // GET  /api/v1/organizations/:orgId/projects
 * // POST /api/v1/projects/:id/members  { userId, role }
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get('organizations/:orgId/projects')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'List all projects in an organization' })
  @ApiOkResponse({ description: 'Array of projects' })
  @ApiForbiddenResponse({ description: 'Not a member of this organization' })
  async listOrgProjects(
    @Param('orgId') orgId: string,
    @CurrentUser() user: User
  ) {
    return this.projectService.listOrgProjects(orgId, user.id);
  }

  @Post('organizations/:orgId/projects')
  @UseGuards(OrgMemberGuard)
  @OrgRoles('owner', 'admin')
  @ApiOperation({
    summary: 'Create a project in an organization (owner/admin only)'
  })
  @ApiCreatedResponse({ description: 'Project created' })
  @ApiForbiddenResponse({ description: 'Requires org owner or admin role' })
  @ApiConflictResponse({
    description: 'Project key already exists in this org'
  })
  @ApiBadRequestResponse({ description: 'Validation error' })
  async create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateProjectDto
  ) {
    return this.projectService.createProject(orgId, dto, user.id);
  }

  @Get('projects/:id')
  @UseGuards(ProjectMemberGuard)
  @ApiOperation({ summary: 'Get project details' })
  @ApiOkResponse({ description: 'Project details' })
  @ApiForbiddenResponse({ description: 'Not a member of this project' })
  async getOne(@Param('id') id: string) {
    return this.projectService.getProject(id);
  }

  @Patch('projects/:id')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles('admin')
  @ApiOperation({ summary: 'Update project details (project admin only)' })
  @ApiOkResponse({ description: 'Updated project' })
  @ApiForbiddenResponse({ description: 'Requires project admin role' })
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectService.updateProject(id, dto);
  }

  @Post('projects/:id/members')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles('admin')
  @ApiOperation({ summary: 'Add a member to a project (project admin only)' })
  @ApiCreatedResponse({ description: 'Member added' })
  @ApiForbiddenResponse({ description: 'Requires project admin role' })
  async addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role?: string }
  ) {
    return this.projectService.addMember(id, body.userId, body.role);
  }

  @Delete('projects/:id/members/:userId')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles('admin')
  @ApiOperation({
    summary: 'Remove a member from a project (project admin only)'
  })
  @ApiOkResponse({ description: 'Member removed' })
  @ApiForbiddenResponse({ description: 'Requires project admin role' })
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    await this.projectService.removeMember(id, userId);
    return { message: 'Member removed successfully' };
  }
}
