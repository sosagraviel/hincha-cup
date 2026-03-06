import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatRoomsTable1740000000000 implements MigrationInterface {
  name = 'CreateChatRoomsTable1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE chat_rooms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        is_public BOOLEAN DEFAULT true,
        metadata JSONB,
        CONSTRAINT check_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_rooms_org ON chat_rooms(organization_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_rooms_created_by ON chat_rooms(created_by);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE chat_rooms CASCADE;`);
  }
}
