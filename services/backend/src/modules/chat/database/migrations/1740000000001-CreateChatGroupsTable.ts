import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatGroupsTable1740000000001 implements MigrationInterface {
  name = 'CreateChatGroupsTable1740000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create chat_groups table
    await queryRunner.query(`
      CREATE TABLE chat_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        metadata JSONB,
        CONSTRAINT check_group_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_groups_created_by ON chat_groups(created_by);
    `);

    // Create chat_group_members table
    await queryRunner.query(`
      CREATE TABLE chat_group_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(group_id, user_id),
        CONSTRAINT check_group_role CHECK (role IN ('owner', 'admin', 'member'))
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_group_members_group ON chat_group_members(group_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_group_members_user ON chat_group_members(user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE chat_group_members CASCADE;`);
    await queryRunner.query(`DROP TABLE chat_groups CASCADE;`);
  }
}
