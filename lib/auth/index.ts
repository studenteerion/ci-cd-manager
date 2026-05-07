import { readFile } from '@/lib/server';
import * as path from 'path';

const USERS_FILE = process.env.USERS_FILE || path.join(process.cwd(), 'users.json');

export interface User {
  username: string;
  password: string;
}

export async function loadUsers(): Promise<User[]> {
  try {
    const content = await readFile(USERS_FILE);
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to load users:', error);
    return [];
  }
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const users = await loadUsers();
  const user = users.find(u => u.username === username);
  
  if (!user) return false;
  
  // In production, passwords should be hashed
  // For now, using simple comparison
  return user.password === password;
}

export function createSessionToken(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}
