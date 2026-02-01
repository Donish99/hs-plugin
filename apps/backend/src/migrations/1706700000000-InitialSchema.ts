import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial database schema migration
 * Creates all core tables for the HubSpot Dormant Lead Reactivation plugin
 */
export class InitialSchema1706700000000 implements MigrationInterface {
  name = 'InitialSchema1706700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create hubspot_accounts table
    await queryRunner.query(`
      CREATE TABLE "hubspot_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "portal_id" bigint NOT NULL,
        "company_name" varchar(255),
        "access_token_encrypted" text NOT NULL,
        "refresh_token_encrypted" text NOT NULL,
        "token_expires_at" TIMESTAMP NOT NULL,
        "settings" jsonb NOT NULL DEFAULT '{}',
        "plan" varchar(50) NOT NULL DEFAULT 'free',
        "monthly_email_limit" integer NOT NULL DEFAULT 100,
        "emails_sent_this_month" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_hubspot_accounts_portal_id" UNIQUE ("portal_id"),
        CONSTRAINT "PK_hubspot_accounts" PRIMARY KEY ("id")
      )
    `);

    // Create index on portal_id for fast lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_hubspot_accounts_portal_id" ON "hubspot_accounts" ("portal_id")
    `);

    // Create dormancy_rules table
    await queryRunner.query(`
      CREATE TABLE "dormancy_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "criteria" jsonb NOT NULL,
        "action_type" varchar(50) NOT NULL,
        "action_config" jsonb NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dormancy_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_dormancy_rules_account" FOREIGN KEY ("account_id")
          REFERENCES "hubspot_accounts"("id") ON DELETE CASCADE
      )
    `);

    // Create index on account_id for fast lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_dormancy_rules_account_id" ON "dormancy_rules" ("account_id")
    `);

    // Create campaigns table
    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "account_id" uuid NOT NULL,
        "rule_id" uuid,
        "name" varchar(255),
        "status" varchar(50) NOT NULL DEFAULT 'draft',
        "total_contacts" integer NOT NULL DEFAULT 0,
        "emails_sent" integer NOT NULL DEFAULT 0,
        "emails_opened" integer NOT NULL DEFAULT 0,
        "emails_replied" integer NOT NULL DEFAULT 0,
        "meetings_booked" integer NOT NULL DEFAULT 0,
        "scheduled_at" TIMESTAMP,
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_campaigns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_campaigns_account" FOREIGN KEY ("account_id")
          REFERENCES "hubspot_accounts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_campaigns_rule" FOREIGN KEY ("rule_id")
          REFERENCES "dormancy_rules"("id") ON DELETE SET NULL
      )
    `);

    // Create index on account_id for fast lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_campaigns_account_id" ON "campaigns" ("account_id")
    `);

    // Create index on status for filtering
    await queryRunner.query(`
      CREATE INDEX "IDX_campaigns_status" ON "campaigns" ("status")
    `);

    // Create outreach_records table
    await queryRunner.query(`
      CREATE TABLE "outreach_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "campaign_id" uuid,
        "account_id" uuid NOT NULL,
        "hubspot_contact_id" bigint NOT NULL,
        "hubspot_deal_id" bigint,
        "contact_email" varchar(255),
        "contact_name" varchar(255),
        "company_name" varchar(255),
        "channel" varchar(50) NOT NULL,
        "subject" text,
        "body_text" text,
        "body_html" text,
        "ai_model" varchar(100),
        "ai_prompt_tokens" integer,
        "ai_completion_tokens" integer,
        "status" varchar(50) NOT NULL DEFAULT 'pending',
        "sent_at" TIMESTAMP,
        "opened_at" TIMESTAMP,
        "clicked_at" TIMESTAMP,
        "replied_at" TIMESTAMP,
        "sendgrid_message_id" varchar(255),
        "twilio_message_sid" varchar(255),
        "hubspot_email_id" bigint,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outreach_records" PRIMARY KEY ("id"),
        CONSTRAINT "FK_outreach_records_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_outreach_records_account" FOREIGN KEY ("account_id")
          REFERENCES "hubspot_accounts"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for outreach_records
    await queryRunner.query(`
      CREATE INDEX "IDX_outreach_records_campaign_id" ON "outreach_records" ("campaign_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_outreach_records_account_id" ON "outreach_records" ("account_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_outreach_records_hubspot_contact" ON "outreach_records" ("hubspot_contact_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_outreach_records_status" ON "outreach_records" ("account_id", "status")
    `);

    // Create responses table
    await queryRunner.query(`
      CREATE TABLE "responses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "outreach_id" uuid NOT NULL,
        "response_type" varchar(50),
        "sentiment" varchar(50),
        "intent" varchar(50),
        "content" text,
        "action_taken" varchar(100),
        "task_created_id" bigint,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_responses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_responses_outreach" FOREIGN KEY ("outreach_id")
          REFERENCES "outreach_records"("id") ON DELETE CASCADE
      )
    `);

    // Create index on outreach_id
    await queryRunner.query(`
      CREATE INDEX "IDX_responses_outreach_id" ON "responses" ("outreach_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order (respecting foreign key constraints)
    await queryRunner.query(`DROP TABLE IF EXISTS "responses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outreach_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dormancy_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hubspot_accounts"`);
  }
}
