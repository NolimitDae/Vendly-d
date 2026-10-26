/**
 * Test vendors (Admin -> Settings -> Test vendors) sign in with addresses at this domain. Nothing is
 * ever emailed there: the mail would bounce and hurt Vendly's sending reputation.
 */
export const TEST_EMAIL_DOMAIN = 'vendly.test';

export const isTestEmail = (email?: string | null) => !!email && email.trim().toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`);

/** Shown when a test vendor tries to set up payouts or withdraw. */
export const TEST_ACCOUNT_NO_PAYOUTS = 'This is a test vendor, so it can’t set up payouts or withdraw money. Test vendors are demo accounts made in Admin → Settings → Test vendors.';
