// Simple parseApiError placeholder
export function parseApiError(error: any) {
  if (typeof error === 'string') return { statusCode: 0, errorCode: 'UNKNOWN', message: error };
  if (error?.response?.data) return error.response.data;
  return { statusCode: error?.status || 0, errorCode: error?.code || 'UNKNOWN', message: error?.message || 'Ocurrió un error' };
}
