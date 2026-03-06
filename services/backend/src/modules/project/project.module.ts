import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './database/models/project.model';
import { ProjectMember } from './database/models/project-member.model';
import { ProjectRepository } from './repository/project.repository';
import { ProjectService } from './service/project.service';
import { ProjectController } from './presentation/project.controller';
import { QueueModule } from '@modules/queue/queue.module';

/**
 * Encapsulates project and project-member management.
 * Depends on QueueModule for real-time event emission.
 *
 * @example
 * @Module({ imports: [ProjectModule] })
 */
@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectMember]), QueueModule],
  controllers: [ProjectController],
  providers: [ProjectRepository, ProjectService],
  exports: [ProjectRepository, ProjectService]
})
export class ProjectModule {}
