import { Test, TestingModule } from '@nestjs/testing';
import { PrometheusService } from './prometheus.service';

describe('PrometheusService', () => {
  let service: PrometheusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrometheusService],
    }).compile();

    service = module.get<PrometheusService>(PrometheusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMetrics', () => {
    it('should return a non-empty string of Prometheus metrics', async () => {
      const result = await service.getMetrics();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include default Prometheus metric names in the output', async () => {
      const result = await service.getMetrics();

      // prom-client collectDefaultMetrics always emits process metrics
      expect(result).toContain('process_');
    });

    it('should return a Promise that resolves to a string', async () => {
      const promise = service.getMetrics();

      expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toEqual(expect.any(String));
    });

    it('should not reject under normal conditions', async () => {
      await expect(service.getMetrics()).resolves.not.toThrow();
    });
  });
});
