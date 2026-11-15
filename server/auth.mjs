import { timingSafeEqual } from 'node:crypto';

const encoder = new TextEncoder();
const secondsPerDay = 86400;
const cookieName = 'mallki_session';

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function digest(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}

export async function passwordHash(password, pepper, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  if (!pepper || pepper.length < 32) throw new Error('Falta configurar AUTH_PEPPER');
  const key = await crypto.subtle.importKey('raw', encoder.encode(`${pepper}:${password}`), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000,
  }, key, 256);
  return `${salt}:${hex(new Uint8Array(derived))}`;
}

export async function passwordMatches(password, pepper, stored) {
  const [salt] = stored.split(':');
  const actual = await passwordHash(password, pepper, salt);
  return timingSafeEqual(encoder.encode(actual), encoder.encode(stored));
}

export function publicAccount(account) {
  return { id: account.id, name: account.name, business: account.business, role: account.role, assistance: !!account.assistance };
}

export function sessionToken(request) {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)mallki_session=([a-f0-9]{64})(?:;|$)/)?.[1];
}

export function cookie(request, value = '', maxAge = 0) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSession(db, request, account, now) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const ttl = 7 * secondsPerDay;
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await digest(token), account.id, now + ttl),
  ]);
  return cookie(request, token, ttl);
}

export async function getAccount(db, request, now) {
  const token = sessionToken(request);
  if (!token) return null;
  return db.prepare(`SELECT a.id,a.name,a.business,a.role,a.assistance,a.cart_version
    FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?`)
    .bind(await digest(token), now).first();
}

export async function consumeAuthAttempt(db, request, now) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const actor = await digest(ip);
  const bucket = Math.floor(now / 600) * 600;
  const result = await db.prepare(`INSERT INTO auth_attempts(actor,window_start,attempts) VALUES(?,?,1)
    ON CONFLICT(actor) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN MIN(attempts+1,31) ELSE 1 END,
      window_start=excluded.window_start RETURNING attempts`).bind(actor, bucket).first();
  return result.attempts <= 30;
}
