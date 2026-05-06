import { Test, TestingModule } from '@nestjs/testing';
import { PrometheusController } from './prometheus.controller';
import { PrometheusService } from './prometheus.service';

// Prevent prom-client from registering real metrics (the Counter constructor
// would conflict when instantiated more than once across test runs because
// prom-client uses a global default registry).
jest.mock('prom-client', () => {
  const actual = jest.requireActual('prom-client');
  return {
    ...actual,
    Counter: jest.fn().mockImplementation(() => ({
      inc: jest.fn(),
    })),
  };
});

const mockPrometheusService = {
  getMetrics: jest.fn(),
};

describe('PrometheusController', () => {
  let controller: PrometheusController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrometheusController],
      providers: [
        { provide: PrometheusService, useValue: mockPrometheusService },
      ],
    }).compile();

    controller = module.get<PrometheusController>(PrometheusController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('hello', () => {
    it('should return the string "Hello!"', () => {
      const result = controller.hello();

      expect(result).toBe('Hello!');
    });

    it('should not throw when called multiple times', () => {
      expect(() => controller.hello()).not.toThrow();
      expect(() => controller.hello()).not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should call PrometheusService.getMetrics and write the result to the response', async () => {
      const metricsOutput =
        '# HELP process_cpu_seconds_total\n# TYPE process_cpu_seconds_total counter\n';
      mockPrometheusService.getMetrics.mockResolvedValue(metricsOutput);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.getMetrics(mockRes);

      expect(mockPrometheusService.getMetrics).toHaveBeenCalledTimes(1);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(mockRes.send).toHaveBeenCalledWith(metricsOutput);
    });

    it('should set the Content-Type header to text/plain before sending', async () => {
      mockPrometheusService.getMetrics.mockResolvedValue('');

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.getMetrics(mockRes);

      const [headerName, headerValue] = mockRes.setHeader.mock.calls[0];
      expect(headerName).toBe('Content-Type');
      expect(headerValue).toBe('text/plain');
    });
  });
});
