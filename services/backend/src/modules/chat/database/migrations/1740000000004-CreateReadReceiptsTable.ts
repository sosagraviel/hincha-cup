import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReadReceiptsTable1740000000004
  implements MigrationInterface
{
  name = 'CreateReadReceiptsTable1740000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE message_read_receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(message_id, user_id)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_read_receipts_message ON message_read_receipts(message_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_read_receipts_user ON message_read_receipts(user_id);
    `);

    // Composite index for efficient lookups
    await queryRunner.query(`
      CREATE INDEX idx_read_receipts_message_user
      ON message_read_receipts(message_id, user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE message_read_receipts CASCADE;`);
  }
}
