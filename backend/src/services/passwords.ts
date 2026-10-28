import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LENGTH = 32;

/** "scrypt$<salt>$<hash>", base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length || KEY_LENGTH);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
