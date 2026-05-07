const USERS_FILE = '/opt/apps/users.json';

export interface User {
  username: string;
  password: string;
}

export async function loadUsers(): Promise<User[]> {
  try {
    // In production, read from USERS_FILE
    // For now, return hardcoded user for testing
    return [
      { username: 'admin', password: 'admin123' }
    ];
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
