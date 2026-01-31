import { Processor, Process, OnQueueCompleted, OnQueueFailed, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { QUEUE_NAMES } from '../config/redis.config';
import { BaseProcessor, JobResult, JobStatus } from './base.processor';
import { ContactsService } from '../hubspot/services/contacts.service';

/**
 * Job data for contact sync
 */
export interface ContactSyncJobData {
  portalId: number;
  fullSync: boolean;
  lastSyncAt?: string;
}

/**
 * Processor for contact synchronization jobs
 * Syncs contacts from HubSpot on app install and periodically
 */
@Injectable()
@Processor(QUEUE_NAMES.CONTACT_SYNC)
export class ContactSyncProcessor extends BaseProcessor<ContactSyncJobData> {
  readonly queueName = QUEUE_NAMES.CONTACT_SYNC;
  protected readonly logger = new Logger(ContactSyncProcessor.name);

  constructor(
    private readonly contactsService: ContactsService,
    @InjectQueue(QUEUE_NAMES.CONTACT_SYNC)
    private readonly syncQueue: Queue<ContactSyncJobData>,
  ) {
    super();
  }

  @Process()
  async processJob(job: Job<ContactSyncJobData>): Promise<JobResult> {
    const { portalId, fullSync, lastSyncAt } = job.data;
    this.logger.log(
      `Starting ${fullSync ? 'full' : 'incremental'} contact sync for portal ${portalId}`,
    );

    try {
      await job.progress(10);

      // Fetch contacts from HubSpot
      const contacts = await this.contactsService.getContacts(portalId, {
        fetchAll: fullSync,
      });

      await job.progress(80);

      // TODO: Store/update contacts in local database for faster querying
      // For now, we just count them

      await job.progress(100);

      const syncCompletedAt = new Date().toISOString();

      this.logger.log(
        `Contact sync completed for portal ${portalId}: ${contacts.length} contacts synced`,
      );

      return {
        status: JobStatus.COMPLETED,
        message: `Contact sync completed for portal ${portalId}`,
        data: {
          portalId,
          contactsSynced: contacts.length,
          fullSync,
          syncCompletedAt,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Contact sync failed for portal ${portalId}: ${errorMessage}`);

      return {
        status: JobStatus.FAILED,
        message: `Contact sync failed for portal ${portalId}`,
        error: errorMessage,
      };
    }
  }

  /**
   * Schedule an initial full sync for a newly installed portal
   */
  async scheduleInitialSync(portalId: number): Promise<Job<ContactSyncJobData>> {
    this.logger.log(`Scheduling initial sync for portal ${portalId}`);

    return this.syncQueue.add(
      {
        portalId,
        fullSync: true,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        priority: 1, // High priority for initial sync
      },
    );
  }

  /**
   * Schedule an incremental sync for an existing portal
   */
  async scheduleIncrementalSync(
    portalId: number,
    lastSyncAt: string,
  ): Promise<Job<ContactSyncJobData>> {
    this.logger.log(`Scheduling incremental sync for portal ${portalId}`);

    return this.syncQueue.add(
      {
        portalId,
        fullSync: false,
        lastSyncAt,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );
  }

  @OnQueueCompleted()
  override onCompleted(job: Job<ContactSyncJobData>, result: JobResult): void {
    this.logger.log(
      `Contact sync job ${job.id} completed: ${result.data?.contactsSynced} contacts synced`,
    );
  }

  @OnQueueFailed()
  override onFailed(job: Job<ContactSyncJobData>, error: Error): void {
    this.logger.error(
      `Contact sync job ${job.id} failed for portal ${job.data.portalId}: ${error.message}`,
    );
  }
}
