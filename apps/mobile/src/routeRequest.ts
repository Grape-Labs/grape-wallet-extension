/** Read-only quote/preparation requests must not leave a form indefinitely busy. */
export async function requestRouteJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      if (message.includes('"code":1011') || message.includes('/toChain must be equal to one of the allowed values')) throw new Error('This bridge route is not supported yet.');
      throw new Error(`Route request failed (${response.status}). Retry with your current amount.`);
    }
    return await response.json() as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Route request timed out. Your entries are unchanged; try again.');
    throw error;
  } finally { clearTimeout(timeout); }
}
