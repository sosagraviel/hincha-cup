import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDmThreadsTable1740000000002 implements MigrationInterface {
  name = 'CreateDmThreadsTable1740000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE dm_threads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user1_id, user2_id),
        CONSTRAINT check_different_users CHECK (user1_id != user2_id),
        CONSTRAINT check_canonical_order CHECK (user1_id < user2_id)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_dm_threads_user1 ON dm_threads(user1_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_dm_threads_user2 ON dm_threads(user2_id);
    `);

    // Create composite index for fast lookups
    await queryRunner.query(`
      CREATE INDEX idx_dm_threads_users ON dm_threads(user1_id, user2_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE dm_threads CASCADE;`);
  }
}
