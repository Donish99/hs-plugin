import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthCheckService } from '@nestjs/terminus';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;

  const mockHealthCheckService = {
    check: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should return health check result', async () => {
      const mockResult = {
        status: 'ok' as const,
        info: {
          app: { status: 'up' },
        },
        error: {},
        details: {
          app: { status: 'up' },
        },
      };

      mockHealthCheckService.check.mockResolvedValue(mockResult);

      const result = await controller.check();

      expect(result.status).toBe('ok');
      expect(result.info).toBeDefined();
    });

    it('should call health check service with indicators', async () => {
      const mockResult = {
        status: 'ok' as const,
        info: {},
        error: {},
        details: {},
      };

      mockHealthCheckService.check.mockResolvedValue(mockResult);

      await controller.check();

      expect(mockHealthCheckService.check).toHaveBeenCalled();
      expect(mockHealthCheckService.check).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(Function)]),
      );
    });

    it('should include app health indicator', async () => {
      const mockResult = {
        status: 'ok' as const,
        info: { app: { status: 'up' } },
        error: {},
        details: { app: { status: 'up' } },
      };

      mockHealthCheckService.check.mockResolvedValue(mockResult);

      const result = await controller.check();

      expect(result.info?.app).toBeDefined();
    });
  });
});
