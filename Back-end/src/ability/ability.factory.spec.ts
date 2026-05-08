import { AbilityFactory, Action } from './ability.factory';

// Helper to build a mock user with role_users populated from permission triples.
// Each triple is [action, subject] e.g. ['Read', 'User'].
function buildUser(permissionPairs: [string, string][]) {
  return {
    role_users: [
      {
        role: {
          permission_roles: permissionPairs.map(([action, subject]) => ({
            permission: { action, subject },
          })),
        },
      },
    ],
  };
}

describe('AbilityFactory', () => {
  let factory: AbilityFactory;

  beforeEach(() => {
    factory = new AbilityFactory();
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  describe('defineAbility', () => {
    it('should return an ability object with a can() method', () => {
      const user = buildUser([['Read', 'User']]);
      const ability = factory.defineAbility(user);

      expect(ability).toBeDefined();
      expect(typeof ability.can).toBe('function');
    });

    it('should grant the actions declared in the user permissions', () => {
      const user = buildUser([
        ['Read', 'User'],
        ['Update', 'User'],
      ]);
      const ability = factory.defineAbility(user);

      expect(ability.can(Action.Read, 'User')).toBe(true);
      expect(ability.can(Action.Update, 'User')).toBe(true);
    });

    it('should not grant actions that are not in the user permissions', () => {
      const user = buildUser([['Read', 'User']]);
      const ability = factory.defineAbility(user);

      expect(ability.can(Action.Delete, 'User')).toBe(false);
    });

    it('should grant Manage (wildcard) when the permission action is Manage', () => {
      const user = buildUser([['Manage', 'User']]);
      const ability = factory.defineAbility(user);

      // 'manage' acts as a wildcard — all standard actions should be permitted
      expect(ability.can(Action.Read, 'User')).toBe(true);
      expect(ability.can(Action.Create, 'User')).toBe(true);
      expect(ability.can(Action.Delete, 'User')).toBe(true);
    });

    it('should accumulate permissions across multiple role_users entries', () => {
      const user = {
        role_users: [
          {
            role: {
              permission_roles: [{ permission: { action: 'Read', subject: 'User' } }],
            },
          },
          {
            role: {
              permission_roles: [{ permission: { action: 'Create', subject: 'User' } }],
            },
          },
        ],
      };

      const ability = factory.defineAbility(user);

      expect(ability.can(Action.Read, 'User')).toBe(true);
      expect(ability.can(Action.Create, 'User')).toBe(true);
    });

    it('should grant no permissions when the user has no role_users entries', () => {
      const user = { role_users: [] };
      const ability = factory.defineAbility(user);

      expect(ability.can(Action.Read, 'User')).toBe(false);
      expect(ability.can(Action.Manage, 'User')).toBe(false);
    });

    it('should return an ability even when user is falsy', () => {
      // The guard around `if (user)` means no permissions are added for falsy input
      const ability = factory.defineAbility(null);

      expect(ability).toBeDefined();
      expect(ability.can(Action.Read, 'User')).toBe(false);
    });
  });
});
