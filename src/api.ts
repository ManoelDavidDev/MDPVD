const TOKEN_STORAGE_KEY = 'mdpdv_session_token';
const EXPLICIT_LOGOUT_KEY = 'mdpdv_explicit_logout';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
  } else {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function markExplicitLogout(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
}

export function hasExplicitlyLoggedOut(): boolean {
  return sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true';
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiClientError(
      data?.error || 'Falha ao comunicar com o serviço local do MDPDV.',
      response.status,
      data?.code || 'API_ERROR'
    );
  }
  return data as T;
}

export function getBackupDownloadUrl(filename: string): string {
  const token = getStoredToken() ?? '';
  return `/api/backups/${encodeURIComponent(filename)}/download?token=${encodeURIComponent(token)}`;
}
