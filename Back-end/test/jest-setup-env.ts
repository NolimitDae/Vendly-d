// modules that construct API clients at import time need placeholder credentials in tests
process.env.STRIPE_SECRET_KEY ??= 'sk_test_placeholder';
process.env.JWT_SECRET ??= 'test-jwt-secret';
