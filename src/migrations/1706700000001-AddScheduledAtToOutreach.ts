import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add scheduled_at column to outreach_records table
 * Supports scheduling follow-up outreach based on response classification
 */
export class AddScheduledAtToOutreach1706700000001 implements MigrationInterface {
  name = 'AddScheduledAtToOutreach1706700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add scheduled_at column to outreach_records table
    await queryRunner.query(`
      ALTER TABLE "outreach_records"
      ADD COLUMN "scheduled_at" TIMESTAMP
    `);

    // Add variant_id column for A/B testing
    await queryRunner.query(`
      ALTER TABLE "outreach_records"
      ADD COLUMN "variant_id" uuid
    `);

    // Add variant_group_id column for A/B testing
    await queryRunner.query(`
      ALTER TABLE "outreach_records"
      ADD COLUMN "variant_group_id" uuid
    `);

    // Add selected_variant_index column for A/B testing
    await queryRunner.query(`
      ALTER TABLE "outreach_records"
      ADD COLUMN "selected_variant_index" integer
    `);

    // Create index on scheduled_at for finding records to send
    await queryRunner.query(`
      CREATE INDEX "IDX_outreach_records_scheduled_at"
      ON "outreach_records" ("scheduled_at")
      WHERE "scheduled_at" IS NOT NULL
    `);

    // Create index on variant_id for variant tracking
    await queryRunner.query(`
      CREATE INDEX "IDX_outreach_records_variant_id"
      ON "outreach_records" ("variant_id")
    `);

    // Create index on variant_group_id for variant group tracking
    await queryRunner.query(`
      CREATE INDEX "IDX_outreach_records_variant_group_id"
      ON "outreach_records" ("variant_group_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_outreach_records_variant_group_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_outreach_records_variant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_outreach_records_scheduled_at"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "outreach_records" DROP COLUMN IF EXISTS "selected_variant_index"`);
    await queryRunner.query(`ALTER TABLE "outreach_records" DROP COLUMN IF EXISTS "variant_group_id"`);
    await queryRunner.query(`ALTER TABLE "outreach_records" DROP COLUMN IF EXISTS "variant_id"`);
    await queryRunner.query(`ALTER TABLE "outreach_records" DROP COLUMN IF EXISTS "scheduled_at"`);
  }
}
