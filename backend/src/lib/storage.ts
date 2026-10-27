import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const SIGNED_URL_TTL_SEC = 10 * 60;

/**
 * Fayl saqlash interfeysi. Ikki drayver:
 *  - `s3`    — S3/MinIO/R2 (production uchun tavsiya);
 *  - `local` — server diskida (Docker/MinIO'siz lokal ishlab chiqish yoki kichik VPS).
 * Public fayllar (avatar, mashina va yuk rasmlari) ochiq URL bilan; private (haydovchi hujjatlari) —
 * faqat 10 daqiqalik imzolangan havola orqali.
 * Obyekt ko'rinishida — testlarda vi.spyOn bilan almashtirish oson.
 */
export interface Storage {
  putPublic(key: string, body: Buffer, contentType: string): Promise<string>;
  putPrivate(key: string, body: Buffer, contentType: string): Promise<string>;
  signedUrl(key: string): Promise<string>;
  deletePrivate(key: string): Promise<void>;
  deletePublicUrl(url: string | null | undefined): Promise<void>;
  init(): Promise<void>;
}

// ───────────────────────── S3 ─────────────────────────

function s3Storage(): Storage {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY!, secretAccessKey: env.S3_SECRET_KEY! },
    forcePathStyle: true, // MinIO uchun
  });
  const pub = env.S3_BUCKET_PUBLIC!;
  const priv = env.S3_BUCKET_PRIVATE!;
  const publicBase = (env.S3_PUBLIC_URL ?? `${env.S3_ENDPOINT}/${pub}`).replace(/\/$/, '');

  return {
    async putPublic(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: pub, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }),
      );
      return `${publicBase}/${key}`;
    },
    async putPrivate(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: priv, Key: key, Body: body, ContentType: contentType }));
      return key;
    },
    signedUrl(key) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: priv, Key: key }), { expiresIn: SIGNED_URL_TTL_SEC });
    },
    async deletePrivate(key) {
      await client.send(new DeleteObjectCommand({ Bucket: priv, Key: key })).catch((err) => logger.warn({ err, key }, "Private fayl o'chirilmadi"));
    },
    // Faqat bizning public bucket'dagi URL bo'lsa o'chiradi (Telegram avatarlari tegilmaydi)
    async deletePublicUrl(url) {
      if (!url?.startsWith(`${publicBase}/`)) return;
      const key = url.slice(publicBase.length + 1);
      await client.send(new DeleteObjectCommand({ Bucket: pub, Key: key })).catch((err) => logger.warn({ err, key }, "Public fayl o'chirilmadi"));
    },
    // Bucket'lar yo'q bo'lsa yaratadi; public bucket'ga anonim o'qish ruxsati beriladi
    async init() {
      for (const bucket of [pub, priv]) {
        try {
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch {
          await client.send(new CreateBucketCommand({ Bucket: bucket }));
          logger.info(`S3 bucket yaratildi: ${bucket}`);
        }
      }
      const policy = {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${pub}/*`] }],
      };
      await client
        .send(new PutBucketPolicyCommand({ Bucket: pub, Policy: JSON.stringify(policy) }))
        .catch((err) => logger.warn({ err }, "Public bucket siyosati o'rnatilmadi"));
    },
  };
}

// ───────────────────────── Lokal disk ─────────────────────────

export const localRoot = () => path.resolve(env.LOCAL_STORAGE_DIR);
const filesBase = () => (env.PUBLIC_FILES_URL ?? '').replace(/\/$/, '');
const signKey = createHmac('sha256', env.JWT_ACCESS_SECRET).update('abutax:files:v1').digest();

function sign(key: string, exp: number): string {
  return createHmac('sha256', signKey).update(`${key}:${exp}`).digest('base64url');
}

/** Kalitni xavfsiz yo'lga aylantiradi: root'dan tashqariga chiqib bo'lmaydi (../ hujumi). */
export function safePath(dir: 'public' | 'private', key: string): string | null {
  if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes('..')) return null;
  const base = path.join(localRoot(), dir);
  const full = path.resolve(base, key);
  return full.startsWith(base + path.sep) ? full : null;
}

/** Imzolangan private havolani tekshiradi (vaqtga chidamli). */
export function verifyPrivateLink(key: string, exp: string, sig: string, now = Date.now()): boolean {
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum * 1000 < now) return false;
  const expected = Buffer.from(sign(key, expNum));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function localStorage(): Storage {
  async function write(dir: 'public' | 'private', key: string, body: Buffer) {
    const full = safePath(dir, key);
    if (!full) throw new Error(`Noto'g'ri fayl kaliti: ${key}`);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, { mode: 0o640 });
  }
  async function remove(dir: 'public' | 'private', key: string) {
    const full = safePath(dir, key);
    if (full) await rm(full, { force: true }).catch((err) => logger.warn({ err, key }, "Fayl o'chirilmadi"));
  }

  return {
    async putPublic(key, body) {
      await write('public', key, body);
      return `${filesBase()}/uploads/${key}`;
    },
    async putPrivate(key, body) {
      await write('private', key, body);
      return key;
    },
    async signedUrl(key) {
      const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SEC;
      return `${filesBase()}/files/private/${key}?exp=${exp}&sig=${sign(key, exp)}`;
    },
    deletePrivate: (key) => remove('private', key),
    async deletePublicUrl(url) {
      const prefix = `${filesBase()}/uploads/`;
      if (url?.startsWith(prefix)) await remove('public', url.slice(prefix.length));
    },
    async init() {
      await mkdir(path.join(localRoot(), 'public'), { recursive: true });
      await mkdir(path.join(localRoot(), 'private'), { recursive: true });
    },
  };
}

export const storage: Storage = env.STORAGE_DRIVER === 'local' ? localStorage() : s3Storage();
