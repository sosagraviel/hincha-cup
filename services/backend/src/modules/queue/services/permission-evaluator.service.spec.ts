import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PermissionEvaluatorService } from './permission-evaluator.service';
import { EntityChangeType } from '@livonit/shared';

describe('PermissionEvaluatorService', () => {
  let service: PermissionEvaluatorService;
  let dataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    const mockDataSource = {
      query: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionEvaluatorService,
        {
          provide: DataSource,
          useValue: mockDataSource
        }
      ]
    }).compile();

    service = module.get<PermissionEvaluatorService>(
      PermissionEvaluatorService
    );
    dataSource = module.get(DataSource);
  });

  describe('evaluateTicketPermissions', () => {
    it('should return delivery targets for ticket assignee with assigned channel', async () => {
      const ticketId = 'ticket-123';
      const assigneeId = 'user-1';
      const projectId = 'project-1';
      const orgId = 'org-1';

      // Mock database response
      dataSource.query.mockResolvedValue([
        {
          user_id: assigneeId,
          assignee_id: assigneeId, // User is the assignee
          reporter_id: 'user-2',
          project_id: projectId,
          organization_id: orgId
        }
      ]);

      const event = {
        messageId: 'msg-1',
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'tickets',
        id: ticketId,
        timestamp: new Date().toISOString()
      };

      const targets = await service.evaluatePermissions(event);

      expect(targets).toHaveLength(1);
      expect(targets[0].userId).toBe(assigneeId);
      expect(targets[0].channels).toContain(`user:${assigneeId}`);
      expect(targets[0].channels).toContain(`project:${projectId}:tickets`);
      // CRITICAL: Assignee should have the assigned channel
      expect(targets[0].channels).toContain(
        `user:${assigneeId}:tickets:assigned`
      );
    });

    it('should not include assigned channel for non-assignee project members', async () => {
      const ticketId = 'ticket-123';
      const assigneeId = 'user-1';
      const otherMemberId = 'user-2';
      const projectId = 'project-1';
      const orgId = 'org-1';

      // Mock database response with non-assignee member
      dataSource.query.mockResolvedValue([
        {
          user_id: otherMemberId,
          assignee_id: assigneeId, // Other user is NOT the assignee
          reporter_id: assigneeId,
          project_id: projectId,
          organization_id: orgId
        }
      ]);

      const event = {
        messageId: 'msg-1',
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'tickets',
        id: ticketId,
        timestamp: new Date().toISOString()
      };

      const targets = await service.evaluatePermissions(event);

      expect(targets).toHaveLength(1);
      expect(targets[0].userId).toBe(otherMemberId);
      expect(targets[0].channels).toContain(`user:${otherMemberId}`);
      expect(targets[0].channels).toContain(`project:${projectId}:tickets`);
      // CRITICAL: Non-assignee should NOT have assigned channel
      expect(targets[0].channels).not.toContain(
        `user:${otherMemberId}:tickets:assigned`
      );
    });

    it('should handle multiple project members with different permissions', async () => {
      const ticketId = 'ticket-123';
      const assigneeId = 'user-1';
      const reporterId = 'user-2';
      const otherMemberId = 'user-3';
      const projectId = 'project-1';
      const orgId = 'org-1';

      // Mock database response with 3 project members
      dataSource.query.mockResolvedValue([
        {
          user_id: assigneeId,
          assignee_id: assigneeId,
          reporter_id: reporterId,
          project_id: projectId,
          organization_id: orgId
        },
        {
          user_id: reporterId,
          assignee_id: assigneeId,
          reporter_id: reporterId,
          project_id: projectId,
          organization_id: orgId
        },
        {
          user_id: otherMemberId,
          assignee_id: assigneeId,
          reporter_id: reporterId,
          project_id: projectId,
          organization_id: orgId
        }
      ]);

      const event = {
        messageId: 'msg-1',
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'tickets',
        id: ticketId,
        timestamp: new Date().toISOString()
      };

      const targets = await service.evaluatePermissions(event);

      expect(targets).toHaveLength(3);

      // Assignee should have assigned channel
      const assigneeTarget = targets.find(t => t.userId === assigneeId);
      expect(assigneeTarget?.channels).toContain(
        `user:${assigneeId}:tickets:assigned`
      );

      // Reporter should NOT have assigned channel
      const reporterTarget = targets.find(t => t.userId === reporterId);
      expect(reporterTarget?.channels).not.toContain(
        `user:${reporterId}:tickets:assigned`
      );

      // Other member should NOT have assigned channel
      const otherTarget = targets.find(t => t.userId === otherMemberId);
      expect(otherTarget?.channels).not.toContain(
        `user:${otherMemberId}:tickets:assigned`
      );
    });
  });

  describe('evaluateProjectPermissions', () => {
    it('should return delivery targets for all project members', async () => {
      const projectId = 'project-1';
      const orgId = 'org-1';

      dataSource.query.mockResolvedValue([
        {
          user_id: 'user-1',
          project_id: projectId,
          organization_id: orgId
        },
        {
          user_id: 'user-2',
          project_id: projectId,
          organization_id: orgId
        }
      ]);

      const event = {
        messageId: 'msg-1',
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'projects',
        id: projectId,
        timestamp: new Date().toISOString()
      };

      const targets = await service.evaluatePermissions(event);

      expect(targets).toHaveLength(2);
      targets.forEach(target => {
        expect(target.channels).toContain(`user:${target.userId}`);
        expect(target.channels).toContain(`org:${orgId}`);
        expect(target.channels).toContain(`project:${projectId}`);
      });
    });
  });

  describe('evaluateOrganizationPermissions', () => {
    it('should return delivery targets for all organization members', async () => {
      const orgId = 'org-1';

      dataSource.query.mockResolvedValue([
        { user_id: 'user-1', organization_id: orgId },
        { user_id: 'user-2', organization_id: orgId }
      ]);

      const event = {
        messageId: 'msg-1',
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'organizations',
        id: orgId,
        timestamp: new Date().toISOString()
      };

      const targets = await service.evaluatePermissions(event);

      expect(targets).toHaveLength(2);
      targets.forEach(target => {
        expect(target.channels).toContain(`user:${target.userId}`);
        expect(target.channels).toContain(`org:${orgId}`);
      });
    });
  });

  describe('evaluatePermissions', () => {
    it('should return empty array for unknown entity types', async () => {
      const event = {
        messageId: 'msg-1',
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'unknown',
        id: 'unknown-1',
        timestamp: new Date().toISOString()
      };

      const targets = await service.evaluatePermissions(event);

      expect(targets).toEqual([]);
    });

    it('should return empty array for chat entity (not implemented yet)', async () => {
      const event = {
        messageId: 'msg-1',
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'chat',
        id: 'chat-1',
        timestamp: new Date().toISOString()
      };

      const targets = await service.evaluatePermissions(event);

      expect(targets).toEqual([]);
    });
  });
});
