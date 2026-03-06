import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatMessagesTable1740000000003
  implements MigrationInterface
{
  name = 'CreateChatMessagesTable1740000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        message_type VARCHAR(50) NOT NULL DEFAULT 'text',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

        -- Context (room, group, or DM - exactly one must be set)
        room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
        group_id UUID REFERENCES chat_groups(id) ON DELETE CASCADE,
        dm_thread_id UUID REFERENCES dm_threads(id) ON DELETE CASCADE,

        parent_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
        metadata JSONB,

        CONSTRAINT check_message_type CHECK (
          message_type IN ('text', 'image', 'file', 'system')
        ),
        CONSTRAINT check_exactly_one_context CHECK (
          (room_id IS NOT NULL AND group_id IS NULL AND dm_thread_id IS NULL) OR
          (room_id IS NULL AND group_id IS NOT NULL AND dm_thread_id IS NULL) OR
          (room_id IS NULL AND group_id IS NULL AND dm_thread_id IS NOT NULL)
        ),
        CONSTRAINT check_content_not_empty CHECK (LENGTH(TRIM(content)) > 0)
      );
    `);

    // Indexes for efficient queries
    await queryRunner.query(`
      CREATE INDEX idx_chat_messages_room_created
      ON chat_messages(room_id, created_at DESC)
      WHERE room_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_messages_group_created
      ON chat_messages(group_id, created_at DESC)
      WHERE group_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_messages_dm_created
      ON chat_messages(dm_thread_id, created_at DESC)
      WHERE dm_thread_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_chat_messages_parent ON chat_messages(parent_message_id);
    `);

    // Index for soft deletes
    await queryRunner.query(`
      CREATE INDEX idx_chat_messages_deleted ON chat_messages(deleted_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE chat_messages CASCADE;`);
  }
}
