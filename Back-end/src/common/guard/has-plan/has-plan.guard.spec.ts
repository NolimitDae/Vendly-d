import { Test, TestingModule } from '@nestjs/testing';
import { HasPlanGuard } from './has-plan.guard';
import { UserRepository } from '../../repository/user/user.repository';

describe('HasPlanGuard', () => {
  let guard: HasPlanGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HasPlanGuard,
        {
          provide: UserRepository,
          useValue: {
            getUserDetails: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<HasPlanGuard>(HasPlanGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
