import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { HasPlanGuard } from './has-plan.guard';
import { UserRepository } from '../../repository/user/user.repository';

const mockUserRepository = {
  getUserDetails: jest.fn(),
};

function buildContext(userId: string | undefined) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: userId !== undefined ? { userId } : undefined,
      }),
    }),
  } as any;
}

describe('HasPlanGuard', () => {
  let guard: HasPlanGuard;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HasPlanGuard,
        { provide: UserRepository, useValue: mockUserRepository },
      ],
    }).compile();

    guard = module.get<HasPlanGuard>(HasPlanGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true when the user exists in the repository', async () => {
      mockUserRepository.getUserDetails.mockResolvedValue({ id: 'user-1', type: 'VENDOR' });

      const result = await guard.canActivate(buildContext('user-1'));

      expect(result).toBe(true);
      expect(mockUserRepository.getUserDetails).toHaveBeenCalledWith('user-1');
    });

    it('should return true when getUserDetails resolves to null (guard currently always returns true)', async () => {
      // The current implementation returns true unconditionally after the repo call.
      mockUserRepository.getUserDetails.mockResolvedValue(null);

      const result = await guard.canActivate(buildContext('user-2'));

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when getUserDetails rejects', async () => {
      mockUserRepository.getUserDetails.mockRejectedValue(new Error('DB unreachable'));

      await expect(guard.canActivate(buildContext('user-3'))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException with the original error message', async () => {
      mockUserRepository.getUserDetails.mockRejectedValue(new Error('Access denied'));

      let thrownError: ForbiddenException | undefined;
      try {
        await guard.canActivate(buildContext('user-4'));
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(ForbiddenException);
      expect(thrownError.message).toBe('Access denied');
    });

    it('should throw ForbiddenException when req.user is undefined (TypeError is caught)', async () => {
      // req.user is undefined so req.user.userId throws a TypeError
      const ctxWithNoUser = {
        switchToHttp: () => ({
          getRequest: () => ({ user: undefined }),
        }),
      } as any;

      await expect(guard.canActivate(ctxWithNoUser)).rejects.toThrow(ForbiddenException);
    });
  });
});
