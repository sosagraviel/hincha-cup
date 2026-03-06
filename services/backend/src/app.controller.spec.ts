import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataSource } from 'typeorm';
import { TypedConfigService } from './config/typed-config.service';

describe('AppController', () => {
  let appController: AppController;

  const mockDataSource = {
    query: jest.fn()
  };

  const mockTypedConfigService = {
    get: jest.fn()
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DataSource,
          useValue: mockDataSource
        },
        {
          provide: TypedConfigService,
          useValue: mockTypedConfigService
        }
      ]
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return status: ok when all checks pass', async () => {
      mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      mockTypedConfigService.get.mockReturnValue('http://localhost:9000');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true
      });

      const result = await appController.getHealth();
      expect(result).toEqual({ status: 'ok' });
    });

    it('should return status: ok for ready endpoint', () => {
      const result = appController.getHealthReady();
      expect(result).toEqual({ status: 'ok' });
    });
  });
});
