import { BaseProcessor, JobResult, JobStatus } from './base.processor';
import { Job } from 'bull';

// Mock concrete implementation for testing
class TestProcessor extends BaseProcessor<{ value: number }> {
  readonly queueName = 'test-queue';

  async processJob(job: Job<{ value: number }>): Promise<JobResult> {
    if (job.data.value < 0) {
      throw new Error('Negative value not allowed');
    }
    return {
      status: JobStatus.COMPLETED,
      message: `Processed value: ${job.data.value}`,
      data: { doubled: job.data.value * 2 },
    };
  }
}

describe('BaseProcessor', () => {
  let processor: TestProcessor;

  beforeEach(() => {
    processor = new TestProcessor();
  });

  describe('process', () => {
    it('should process a job successfully', async () => {
      const mockJob = {
        id: '1',
        data: { value: 5 },
        progress: jest.fn(),
      } as unknown as Job<{ value: number }>;

      const result = await processor.process(mockJob);

      expect(result.status).toBe(JobStatus.COMPLETED);
      expect(result.data?.doubled).toBe(10);
    });

    it('should handle job failure', async () => {
      const mockJob = {
        id: '2',
        data: { value: -1 },
        progress: jest.fn(),
      } as unknown as Job<{ value: number }>;

      await expect(processor.process(mockJob)).rejects.toThrow('Negative value not allowed');
    });

    it('should update job progress', async () => {
      const progressFn = jest.fn();
      const mockJob = {
        id: '3',
        data: { value: 10 },
        progress: progressFn,
      } as unknown as Job<{ value: number }>;

      await processor.process(mockJob);

      expect(progressFn).toHaveBeenCalled();
    });
  });

  describe('onCompleted', () => {
    it('should handle completed jobs', () => {
      const mockJob = {
        id: '1',
        data: { value: 5 },
      } as unknown as Job<{ value: number }>;

      const result: JobResult = {
        status: JobStatus.COMPLETED,
        message: 'Done',
      };

      // Should not throw
      expect(() => processor.onCompleted(mockJob, result)).not.toThrow();
    });
  });

  describe('onFailed', () => {
    it('should handle failed jobs', () => {
      const mockJob = {
        id: '1',
        data: { value: -1 },
        attemptsMade: 1,
      } as unknown as Job<{ value: number }>;

      const error = new Error('Test error');

      // Should not throw
      expect(() => processor.onFailed(mockJob, error)).not.toThrow();
    });
  });

  describe('queueName', () => {
    it('should have a queue name', () => {
      expect(processor.queueName).toBe('test-queue');
    });
  });
});
