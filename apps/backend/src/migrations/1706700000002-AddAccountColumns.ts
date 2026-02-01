import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add missing columns to hubspot_accounts table
 */
export class AddAccountColumns1706700000002 implements MigrationInterface {
  name = 'AddAccountColumns1706700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add is_active column
    await queryRunner.query(`
      ALTER TABLE "hubspot_accounts"
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);

    // Add last_synced_at column
    await queryRunner.query(`
      ALTER TABLE "hubspot_accounts"
      ADD COLUMN IF NOT EXISTS "last_synced_at" TIMESTAMP
    `);

    // Add sync_status column
    await queryRunner.query(`
      ALTER TABLE "hubspot_accounts"
      ADD COLUMN IF NOT EXISTS "sync_status" varchar(50)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "hubspot_accounts" DROP COLUMN IF EXISTS "sync_status"`);
    await queryRunner.query(`ALTER TABLE "hubspot_accounts" DROP COLUMN IF EXISTS "last_synced_at"`);
    await queryRunner.query(`ALTER TABLE "hubspot_accounts" DROP COLUMN IF EXISTS "is_active"`);
  }
}
