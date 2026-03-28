/**
 * Saved Accounts — quick-login credential storage for the Nexara mobile app.
 *
 * Credentials are obfuscated (not encrypted) before being stored in localStorage.
 * This is equivalent in security to a browser's built-in password manager for a
 * WebView app. The device already holds the JWT token in plain localStorage, so
 * the risk profile is the same.
 *
 * Storage key: nexara_saved_accounts (localStorage, survives app restart)
 * Max saved accounts: 10 (oldest last-login dropped if exceeded)
 */

export interface SavedAccount {
  email: string;
  /** Obfuscated password — never store in plain text */
  _pw: string;
  name: string;
  avatarUrl: string;
  lastLogin: string; // ISO timestamp
}

const STORAGE_KEY = 'nexara_saved_accounts';
const MAX_ACCOUNTS = 10;

// Simple reversible obfuscation using a fixed XOR key + base64.
// Not cryptographic, but prevents casual shoulder-surfing of raw localStorage.
const XOR_KEY = 'NxR@2026#mbl';

function obfuscate(value: string): string {
  const key = XOR_KEY;
  let result = '';
  for (let i = 0; i < value.length; i++) {
    result += String.fromCharCode(value.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  if (typeof btoa !== 'undefined') return btoa(result);
  return Buffer.from(result, 'binary').toString('base64');
}

function deobfuscate(encoded: string): string {
  let decoded: string;
  try {
    if (typeof atob !== 'undefined') {
      decoded = atob(encoded);
    } else {
      decoded = Buffer.from(encoded, 'base64').toString('binary');
    }
  } catch {
    return '';
  }
  const key = XOR_KEY;
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

function readAll(): SavedAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(accounts: SavedAccount[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // Quota exceeded — silently ignore
  }
}

export function getSavedAccounts(): SavedAccount[] {
  return readAll();
}

export function saveAccount(
  email: string,
  password: string,
  meta: { name?: string; avatarUrl?: string } = {},
): void {
  const accounts = readAll().filter(a => a.email !== email);
  const entry: SavedAccount = {
    email,
    _pw: obfuscate(password),
    name: meta.name || email,
    avatarUrl: meta.avatarUrl || '',
    lastLogin: new Date().toISOString(),
  };
  // Most-recently-used first
  accounts.unshift(entry);
  writeAll(accounts.slice(0, MAX_ACCOUNTS));
}

export function removeSavedAccount(email: string): void {
  writeAll(readAll().filter(a => a.email !== email));
}

export function getPassword(account: SavedAccount): string {
  return deobfuscate(account._pw);
}
