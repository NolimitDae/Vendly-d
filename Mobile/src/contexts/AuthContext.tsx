// Re-export everything from the canonical AuthContext so existing imports keep working.
export {
  AuthProvider,
  AuthContext,
  useAuth,
} from '../context/AuthContext';
export type {
  AuthUser,
  AuthState,
  AuthContextValue,
  UserType,
} from '../context/AuthContext';
