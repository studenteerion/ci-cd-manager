import { readFile } from '@/lib/server';
import { isTesting } from '@/lib/env';
import * as path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';

const APPS_DIR = process.env.APPS_BASE_DIR || '/opt/apps';
const configuredUsersFile = process.env.USERS_FILE;
const usersBaseDir = isTesting ? process.cwd() : APPS_DIR;
const USERS_FILE = configuredUsersFile
  ? path.isAbsolute(configuredUsersFile)
    ? configuredUsersFile
    : path.resolve(usersBaseDir, configuredUsersFile)
  : path.join(APPS_DIR, 'users.json');

export type UserRole = 'admin' | 'team';
export type UserStatus = 'active' | 'inactive';

export interface User {
  username: string;
  password: string;
  role: UserRole;
  status: UserStatus;
}

const normalizeUser = (user: Partial<User> & { username: string; password: string }): User => ({
  username: user.username,
  password: user.password,
  role: (user.role as UserRole) || 'admin',
  status: (user.status as UserStatus) || 'active',
});

export async function loadUsers(): Promise<User[]> {
  try {
    const content = await readFile(USERS_FILE);
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && entry.username && entry.password)
      .map((entry) => normalizeUser(entry));
  } catch (error) {
    console.error('Failed to load users:', error);
    return [];
  }
}

export async function saveUsers(users: User[]): Promise<void> {
  const payload = JSON.stringify(users, null, 2);
  await fs.writeFile(USERS_FILE, payload, 'utf8');
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const users = await loadUsers();
  return users.find((user) => user.username === username) || null;
}

export async function updateUserCredentials(
  username: string,
  updates: Partial<Pick<User, 'password' | 'status' | 'role'>>
): Promise<User | null> {
  const users = await loadUsers();
  const index = users.findIndex((user) => user.username === username);
  if (index === -1) return null;
  const updated = { ...users[index], ...updates } as User;
  users[index] = normalizeUser(updated);
  await saveUsers(users);
  return users[index];
}

export function generateRandomPassword(length: number = 12): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()_-+=[]{}|;:,.<>?';
  const all = upper + lower + digits + symbols;

  const pick = (chars: string) => chars[crypto.randomInt(0, chars.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export async function createOrResetTeamUser(teamName: string): Promise<{ user: User; password: string }> {
  const users = await loadUsers();
  const password = generateRandomPassword(12);
  const index = users.findIndex((user) => user.username === teamName);
  const nextUser: User = {
    username: teamName,
    password,
    role: 'team',
    status: 'active',
  };
  if (index === -1) {
    users.push(nextUser);
  } else {
    users[index] = normalizeUser({ ...users[index], ...nextUser });
  }
  await saveUsers(users);
  return { user: nextUser, password };
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<{ valid: boolean; reason?: 'not-found' | 'invalid' | 'inactive'; user?: User }> {
  const users = await loadUsers();
  const user = users.find(u => u.username === username);

  if (!user) return { valid: false, reason: 'not-found' };
  if (user.status === 'inactive') return { valid: false, reason: 'inactive', user };
  if (user.password !== password) return { valid: false, reason: 'invalid' };

  return { valid: true, user };
}

export function createSessionToken(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}
