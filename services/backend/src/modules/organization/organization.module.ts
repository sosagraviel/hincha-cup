import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './database/models/organization.model';
import { OrganizationMember } from './database/models/organization-member.model';
import { OrganizationRepository } from './repository/organization.repository';
import { OrganizationService } from './service/organization.service';
import { OrganizationController } from './presentation/organization.controller';
import { QueueModule } from '@modules/queue/queue.module';

/**
 * Encapsulates organization and member management.
 * Depends on QueueModule for real-time event emission.
 *
 * @example
 * @Module({ imports: [OrganizationModule] })
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, OrganizationMember]),
    QueueModule
  ],
  controllers: [OrganizationController],
  providers: [OrganizationRepository, OrganizationService],
  exports: [OrganizationRepository, OrganizationService]
})
export class OrganizationModule {}
