import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('development'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
  });

  describe('getInfo', () => {
    it('should return app info object', () => {
      const result = appController.getInfo();

      expect(result).toBeDefined();
      expect(result.name).toBe('HubSpot Dormant Lead Reactivation Plugin');
      expect(result.version).toBeDefined();
      expect(result.status).toBe('running');
    });

    it('should include environment info', () => {
      const result = appController.getInfo();

      expect(result.environment).toBeDefined();
    });
  });
});

describe('AppService', () => {
  let appService: AppService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('development'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    appService = module.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAppInfo', () => {
    it('should return correct app name', () => {
      const info = appService.getAppInfo();
      expect(info.name).toBe('HubSpot Dormant Lead Reactivation Plugin');
    });

    it('should return version from package.json', () => {
      const info = appService.getAppInfo();
      expect(info.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should return running status', () => {
      const info = appService.getAppInfo();
      expect(info.status).toBe('running');
    });

    it('should return environment from config', () => {
      mockConfigService.get.mockReturnValue('production');
      const info = appService.getAppInfo();
      expect(info.environment).toBe('production');
    });

    it('should default to development when NODE_ENV is undefined', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const info = appService.getAppInfo();
      expect(info.environment).toBe('development');
    });
  });
});
