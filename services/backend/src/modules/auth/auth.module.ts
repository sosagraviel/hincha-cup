import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthMiddleware } from './middleware/auth.middleware';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { OrgMemberGuard } from './guards/org-member.guard';
import { ProjectMemberGuard } from './guards/project-member.guard';
import { KeycloakAdminService } from './keycloak/keycloak-admin.service';
import { User } from '@modules/user/database/models/user.model';
import { OrganizationMember } from '@modules/organization/database/models/organization-member.model';
import { ProjectMember } from '@modules/project/database/models/project-member.model';

/**
 * Global auth module that applies AuthMiddleware to all routes and provides
 * guards (JwtAuthGuard, RolesGuard, OrgMemberGuard, ProjectMemberGuard)
 * and KeycloakAdminService for use across the application.
 *
 * @example
 * // Guards are available globally after importing AuthModule in AppModule:
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('super_admin')
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, OrganizationMember, ProjectMember])
  ],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    OrgMemberGuard,
    ProjectMemberGuard,
    KeycloakAdminService
  ],
  exports: [
    TypeOrmModule,
    JwtAuthGuard,
    RolesGuard,
    OrgMemberGuard,
    ProjectMemberGuard,
    KeycloakAdminService
  ]
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
