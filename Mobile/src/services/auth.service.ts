import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, TOKEN_KEY, USER_KEY } from './api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  type: string;
  avatar?: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: AuthUser;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  type: string;
}

export const AuthService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),

  register: (data: RegisterData) =>
    api.post<LoginResponse>('/auth/register', data),

  me: () =>
    api.get<{ success: boolean; data: AuthUser }>('/auth/me'),

  logout: async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  },

  updateProfile: (data: Partial<AuthUser> & { avatar?: string | null }) => {
    if (data.avatar && data.avatar.startsWith('file://')) {
      const form = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value != null) {
          if (key === 'avatar') {
            const filename = (value as string).split('/').pop() ?? 'avatar.jpg';
            const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            form.append('avatar', { uri: value, name: filename, type: mime } as any);
          } else {
            form.append(key, value as string);
          }
        }
      });
      return api.patch<{ success: boolean; data: AuthUser }>('/auth/update', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.patch<{ success: boolean; data: AuthUser }>('/auth/update', data);
  },
};
