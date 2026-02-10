import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add requires_review column to campaigns table
 * This enables the review queue integration where AI-generated messages
 * can be routed through human review before sending
 */
export class AddReviewIntegration1738700000000 implements MigrationInterface {
  name = 'AddReviewIntegration1738700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add requires_review column to campaigns table
    await queryRunner.query(`
      ALTER TABLE "campaigns"
      ADD COLUMN IF NOT EXISTS "requires_review" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove requires_review column from campaigns table
    await queryRunner.query(`
      ALTER TABLE "campaigns"
      DROP COLUMN IF EXISTS "requires_review"
    `);
  }
}
