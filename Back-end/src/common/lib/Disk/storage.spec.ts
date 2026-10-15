const putObject = jest.fn(() => ({ promise: () => Promise.resolve({}) }));
const getObject = jest.fn(() => ({ promise: () => Promise.resolve({ Body: Buffer.from('%PDF-1.7') }) }));
const upload = jest.fn(() => ({ promise: () => Promise.resolve({ Location: 'x' }) }));
const S3 = jest.fn(() => ({ putObject, getObject, upload }));
jest.mock('aws-sdk', () => ({ S3 }));

import { contentTypeFor, storageSettings } from './storage-settings';
import { S3Adapter } from './drivers/S3Adapter';
import { PrivateStorage, __resetPrivateStorage } from 'src/modules/contracts/private-storage';

const R2 = {
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  S3_REGION: 'auto',
  S3_BUCKET: 'vendly-public',
  S3_PRIVATE_BUCKET: 'vendly-private',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_URL: 'https://pub-abc.r2.dev/',
};

describe('storage (R2)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...saved };
    __resetPrivateStorage();
  });
  afterAll(() => {
    process.env = saved;
  });

  it('reads the R2 settings (and defaults to local disk)', () => {
    expect(storageSettings().driver).toBe('local');
    Object.assign(process.env, R2);
    expect(storageSettings()).toMatchObject({ driver: 's3', bucket: 'vendly-public', privateBucket: 'vendly-private', region: 'auto', publicUrl: 'https://pub-abc.r2.dev' });
  });

  it('builds public links from the R2 public URL and uploads with a content type and long cache', async () => {
    const s3 = new S3Adapter({ driver: 's3', connection: { awsBucket: 'vendly-public', awsEndpoint: R2.S3_ENDPOINT, awsPublicUrl: 'https://media.vendly.app/', minio: true } });
    expect(s3.url('listings/abc_photo.jpg')).toBe('https://media.vendly.app/listings/abc_photo.jpg');
    await s3.put('avatar/x.png', Buffer.from('png'));
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ Bucket: 'vendly-public', Key: 'avatar/x.png', ContentType: 'image/png', CacheControl: expect.stringContaining('immutable') }));
  });

  it('keeps contracts and event files in the private bucket', async () => {
    Object.assign(process.env, R2);
    await PrivateStorage.put('contracts/2026/a.pdf', Buffer.from('%PDF'));
    expect(putObject).toHaveBeenCalledWith(expect.objectContaining({ Bucket: 'vendly-private', Key: 'contracts/2026/a.pdf', ContentType: 'application/pdf' }));
    const back = await PrivateStorage.get('contracts/2026/a.pdf');
    expect(back.toString()).toBe('%PDF-1.7');
    expect(getObject).toHaveBeenCalledWith({ Bucket: 'vendly-private', Key: 'contracts/2026/a.pdf' });
  });

  it('still refuses keys that try to escape the folder', async () => {
    Object.assign(process.env, R2);
    await expect(PrivateStorage.put('../../etc/passwd', Buffer.from('x'))).rejects.toThrow(/Invalid storage key/);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('knows common content types', () => {
    expect(contentTypeFor('a/b/c.JPG')).toBe('image/jpeg');
    expect(contentTypeFor('shot-list.xlsx')).toMatch(/spreadsheetml/);
    expect(contentTypeFor('noext')).toBe('application/octet-stream');
  });
});
