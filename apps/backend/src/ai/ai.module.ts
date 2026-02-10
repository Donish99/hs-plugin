import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { OpenAIService } from './services/openai.service';
import { ContextService } from './services/context.service';
import { PromptService } from './services/prompt.service';
import { GeneratorService } from './services/generator.service';
import { VariantService } from './services/variant.service';
import { ReviewService } from './services/review.service';
import { ClassifierService } from './services/classifier.service';
import { GenerationController } from './controllers/generation.controller';
import { ReviewController } from './controllers/review.controller';
import { HubspotModule } from '../hubspot/hubspot.module';
import { MessageVariant } from '../entities/message-variant.entity';
import { ReviewQueue } from '../entities/review-queue.entity';
import { OutreachRecord } from '../entities/outreach-record.entity';
import { Campaign } from '../entities/campaign.entity';
import { QUEUE_NAMES } from '../config/redis.config';

/**
 * AI module - handles OpenAI API integration and message generation
 */
@Module({
  imports: [
    CacheModule.register({
      ttl: 3600, // 1 hour default cache TTL
    }),
    TypeOrmModule.forFeature([MessageVariant, ReviewQueue, OutreachRecord, Campaign]),
    BullModule.registerQueue({
      name: QUEUE_NAMES.SEND_CAMPAIGN,
    }),
    HubspotModule,
  ],
  controllers: [GenerationController, ReviewController],
  providers: [
    OpenAIService,
    ContextService,
    PromptService,
    GeneratorService,
    VariantService,
    ReviewService,
    ClassifierService,
  ],
  exports: [
    OpenAIService,
    ContextService,
    PromptService,
    GeneratorService,
    VariantService,
    ReviewService,
    ClassifierService,
  ],
})
export class AiModule {}
