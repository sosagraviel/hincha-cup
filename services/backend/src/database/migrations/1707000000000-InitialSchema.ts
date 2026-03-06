import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1707000000000 implements MigrationInterface {
  name = 'InitialSchema1707000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "external_id" varchar NOT NULL,
        "email" varchar NOT NULL,
        "full_name" varchar,
        "profile_picture_url" varchar,
        "status" varchar NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_external_id" UNIQUE ("external_id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // Organizations table
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "slug" varchar NOT NULL,
        "description" varchar,
        "logo_url" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_organizations_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id")
      )
    `);

    // Organization members table
    await queryRunner.query(`
      CREATE TABLE "organization_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "role" varchar NOT NULL DEFAULT 'member',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_org_members_user_org" UNIQUE ("user_id", "organization_id"),
        CONSTRAINT "PK_organization_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_org_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_org_members_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // Projects table
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "name" varchar NOT NULL,
        "key" varchar(10) NOT NULL,
        "description" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_projects_org_key" UNIQUE ("organization_id", "key"),
        CONSTRAINT "PK_projects" PRIMARY KEY ("id"),
        CONSTRAINT "FK_projects_org" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // Project members table
    await queryRunner.query(`
      CREATE TABLE "project_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "role" varchar NOT NULL DEFAULT 'member',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_project_members_user_project" UNIQUE ("user_id", "project_id"),
        CONSTRAINT "PK_project_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_project_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_project_members_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    // Tickets table
    await queryRunner.query(`
      CREATE TABLE "tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "ticket_number" integer NOT NULL,
        "title" varchar NOT NULL,
        "description" text,
        "status" varchar NOT NULL DEFAULT 'backlog',
        "priority" varchar NOT NULL DEFAULT 'medium',
        "assignee_id" uuid,
        "reporter_id" uuid NOT NULL,
        "order" integer NOT NULL DEFAULT 0,
        "due_date" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tickets_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tickets_assignee" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_tickets_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Comments table
    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ticket_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "content" text NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_comments_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_comments_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_tickets_project_status" ON "tickets" ("project_id", "status")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tickets_assignee" ON "tickets" ("assignee_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tickets_reporter" ON "tickets" ("reporter_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_comments_ticket" ON "comments" ("ticket_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_org_members_user" ON "organization_members" ("user_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_org_members_org" ON "organization_members" ("organization_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_members_user" ON "project_members" ("user_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_members_project" ON "project_members" ("project_id")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "comments" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tickets" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "project_members" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "projects" CASCADE`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "organization_members" CASCADE`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
  }
}
