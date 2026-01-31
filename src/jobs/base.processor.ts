import { Job } from 'bull';
import { Logger } from '@nestjs/common';

/**
 * Job processing status
 */
export enum JobStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

/**
 * Result returned from job processing
 */
export interface JobResult {
  status: JobStatus;
  message?: string;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Base class for all job processors
 * Provides common functionality for logging, error handling, and progress tracking
 */
export abstract class BaseProcessor<T> {
  protected readonly logger = new Logger(this.constructor.name);

  /**
   * Name of the queue this processor handles
   */
  abstract readonly queueName: string;

  /**
   * Main processing method - wraps processJob with error handling and logging
   */
  async process(job: Job<T>): Promise<JobResult> {
    const startTime = Date.now();
    this.logger.log(`Processing job ${job.id} from queue ${this.queueName}`);

    try {
      // Update progress to indicate job has started
      await job.progress(10);

      // Call the concrete implementation
      const result = await this.processJob(job);

      // Update progress to 100% on completion
      await job.progress(100);

      const duration = Date.now() - startTime;
      this.logger.log(`Job ${job.id} completed in ${duration}ms`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Job ${job.id} failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Abstract method to be implemented by concrete processors
   */
  abstract processJob(job: Job<T>): Promise<JobResult>;

  /**
   * Handle completed jobs - can be overridden for custom behavior
   */
  onCompleted(job: Job<T>, result: JobResult): void {
    this.logger.log(`Job ${job.id} completed with status: ${result.status}`);
  }

  /**
   * Handle failed jobs - can be overridden for custom behavior
   */
  onFailed(job: Job<T>, error: Error): void {
    this.logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`);
  }

  /**
   * Handle job progress updates
   */
  onProgress(job: Job<T>, progress: number): void {
    this.logger.debug(`Job ${job.id} progress: ${progress}%`);
  }
}
