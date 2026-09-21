// Usage: node scripts/set-admin-password.mjs   (reads the new password from stdin)
// Creates or resets the single `admin` account and logs out existing sessions.
import { readFileSync } from 'node:fs';
import { hashPassword, writeUsers } from '../server.mjs';

const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (password.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }

let data;
try { data = JSON.parse(readFileSync(new URL('../data/users.json', import.meta.url), 'utf8')); } catch { data = { users: [] }; }
const existing = data.users.find((u) => u.username === 'admin');
const record = { username: 'admin', role: 'admin', ...hashPassword(password), sessionEpoch: (existing?.sessionEpoch || 0) + 1, updatedAt: new Date().toISOString() };
data.users = [...data.users.filter((u) => u.username !== 'admin'), record];
writeUsers(data);
console.log('admin password set.');
