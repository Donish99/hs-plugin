import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add message_variants and review_queue tables
 * Also adds variant_id and variant_group_id columns to outreach_records
 */
export class AddMessageVariantsAndReviewQueue1706700000003 implements MigrationInterface {
  name = 'AddMessageVariantsAndReviewQueue1706700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create message_variants table
    await queryRunner.query(`
      CREATE TABLE "message_variants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_id" uuid NOT NULL,
        "hubspot_contact_id" bigint NOT NULL,
        "variant_group_id" uuid NOT NULL,
        "variant_index" integer NOT NULL,
        "tone" varchar(50) NOT NULL,
        "subject" text NOT NULL,
        "body" text NOT NULL,
        "ai_model" varchar(100),
        "prompt_tokens" integer,
        "completion_tokens" integer,
        "is_selected" boolean NOT NULL DEFAULT false,
        "is_sent" boolean NOT NULL DEFAULT false,
        "context_snapshot" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_message_variants" PRIMARY KEY ("id"),
        CONSTRAINT "FK_message_variants_account" FOREIGN KEY ("account_id")
          REFERENCES "hubspot_accounts"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for message_variants
    await queryRunner.query(`
      CREATE INDEX "IDX_message_variants_account_id" ON "message_variants" ("account_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_message_variants_hubspot_contact_id" ON "message_variants" ("hubspot_contact_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_message_variants_variant_group_id" ON "message_variants" ("variant_group_id")
    `);

    // Create review_queue table
    await queryRunner.query(`
      CREATE TABLE "review_queue" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "campaign_id" uuid,
        "hubspot_contact_id" bigint NOT NULL,
        "contact_name" varchar(255),
        "contact_email" varchar(255),
        "company_name" varchar(255),
        "original_subject" text NOT NULL,
        "original_body" text NOT NULL,
        "edited_subject" text,
        "edited_body" text,
        "status" varchar(50) NOT NULL DEFAULT 'pending',
        "reviewed_by" varchar(255),
        "reviewed_at" TIMESTAMP,
        "rejection_reason" text,
        "auto_approved" boolean NOT NULL DEFAULT false,
        "priority" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_review_queue" PRIMARY KEY ("id"),
        CONSTRAINT "FK_review_queue_account" FOREIGN KEY ("account_id")
          REFERENCES "hubspot_accounts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_queue_variant" FOREIGN KEY ("variant_id")
          REFERENCES "message_variants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_queue_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes for review_queue
    await queryRunner.query(`
      CREATE INDEX "IDX_review_queue_account_id" ON "review_queue" ("account_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_review_queue_variant_id" ON "review_queue" ("variant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_review_queue_campaign_id" ON "review_queue" ("campaign_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_review_queue_hubspot_contact_id" ON "review_queue" ("hubspot_contact_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_review_queue_status" ON "review_queue" ("account_id", "status")
    `);

    // Add variant_id and variant_group_id columns to outreach_records if they don't exist
    await queryRunner.query(`
      ALTER TABLE "outreach_records"
      ADD COLUMN IF NOT EXISTS "variant_id" uuid,
      ADD COLUMN IF NOT EXISTS "variant_group_id" uuid,
      ADD COLUMN IF NOT EXISTS "selected_variant_index" integer
    `);

    // Add foreign key for variant_id
    await queryRunner.query(`
      ALTER TABLE "outreach_records"
      ADD CONSTRAINT "FK_outreach_records_variant"
      FOREIGN KEY ("variant_id") REFERENCES "message_variants"("id") ON DELETE SET NULL
    `);

    // Create indexes for variant columns
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outreach_records_variant_id" ON "outreach_records" ("variant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_outreach_records_variant_group_id" ON "outreach_records" ("variant_group_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes and constraints from outreach_records
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_outreach_records_variant_group_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_outreach_records_variant_id"`);
    await queryRunner.query(`
      ALTER TABLE "outreach_records" DROP CONSTRAINT IF EXISTS "FK_outreach_records_variant"
    `);
    await queryRunner.query(`
      ALTER TABLE "outreach_records"
      DROP COLUMN IF EXISTS "selected_variant_index",
      DROP COLUMN IF EXISTS "variant_group_id",
      DROP COLUMN IF EXISTS "variant_id"
    `);

    // Drop review_queue table
    await queryRunner.query(`DROP TABLE IF EXISTS "review_queue"`);

    // Drop message_variants table
    await queryRunner.query(`DROP TABLE IF EXISTS "message_variants"`);
  }
}
