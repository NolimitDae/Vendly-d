import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { IStorage } from './iStorage';
import { DiskOption } from '../Option';
import { contentTypeFor } from '../storage-settings';

/** A missing object, however the S3-compatible service words it. */
export function isNotFound(error: unknown) {
  const e = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.Code === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/**
 * S3Adapter for s3 bucket storage
 */
export class S3Adapter implements IStorage {
  private _config: DiskOption;
  private s3: S3Client;

  constructor(config: DiskOption) {
    this._config = config;
    this.s3 = new S3Client({
      endpoint: this._config.connection.awsEndpoint || undefined,
      // R2 uses "auto"; the SDK needs some region either way
      region: this._config.connection.awsDefaultRegion || 'us-east-1',
      credentials: {
        accessKeyId: this._config.connection.awsAccessKeyId ?? '',
        secretAccessKey: this._config.connection.awsSecretAccessKey ?? '',
      },
      // required for MinIO
      forcePathStyle: !!this._config.connection.minio,
    });
  }

  private get bucket() {
    return this._config.connection.awsBucket;
  }

  /**
   * returns object url
   *
   * https://[bucketname].s3.[region].amazonaws.com/[object]
   * and for minio
   * http://[endpoint]/[bucketname]/[object]
   * @param key
   * @returns
   */

  url(key: string): string {
    // a public bucket URL or CDN domain (Cloudflare R2) wins.
    // keep the key exactly as put() stored it: '/avatar/x.jpg' and 'avatar/x.jpg' are different R2 objects
    if (this._config.connection.awsPublicUrl) {
      return `${this._config.connection.awsPublicUrl.replace(/\/+$/, '')}/${key}`;
    }
    if (this._config.connection.minio) {
      return `${this._config.connection.awsEndpoint}/${this._config.connection.awsBucket}/${key}`;
    }
    return `https://${this._config.connection.awsBucket}.s3.${this._config.connection.awsDefaultRegion}.amazonaws.com/${key}`;
  }

  /**
   * check if file exists
   * @param key
   * @returns
   */
  async isExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  /**
   * get data
   * @param key
   */
  async get(key: string): Promise<Readable> {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body as Readable;
    } catch (error) {
      throw new Error(`Failed to get object ${key}: ${error}`);
    }
  }

  /**
   * put data
   * @param key
   * @param value
   */
  async put(
    key: string,
    value: Buffer | Uint8Array | string,
  ): Promise<{ Bucket: string; Key: string; Location: string }> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: value,
        ContentType: contentTypeFor(key),
        // file names are random and never reused, so they can be cached forever
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { Bucket: this.bucket, Key: key, Location: this.url(key) };
  }

  /**
   * delete data
   * @param key
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }
}
