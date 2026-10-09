export class RetryableHttpClient {
    private readonly maxRetries = 3;
    private readonly initialDelayMs = 1000;
    private readonly maxDelayMs = 10000;
    private readonly backoffMultiplier = 2;

    async fetchWithRetry<T>(
        url: string,
        options: RequestInit = {},
        onRetry?: (attempt: number, error: Error) => void
    ): Promise<T> {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);

                if (!response.ok) {
                    if (response.status >= 500 && attempt < this.maxRetries - 1) {
                        throw new Error(`Server error: ${response.status}`);
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json() as T;
            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));

                if (attempt < this.maxRetries - 1) {
                    const delayMs = Math.min(
                        this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt),
                        this.maxDelayMs
                    );
                    onRetry?.(attempt + 1, err);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                } else {
                    throw err;
                }
            }
        }

        throw new Error('Max retries exceeded');
    }

    async postWithRetry<T>(
        url: string,
        body: any,
        headers: Record<string, string> = {}
    ): Promise<T> {
        return this.fetchWithRetry<T>(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(body),
        });
    }

    async getWithRetry<T>(
        url: string,
        headers: Record<string, string> = {}
    ): Promise<T> {
        return this.fetchWithRetry<T>(url, {
            method: 'GET',
            headers,
        });
    }

    async putWithRetry<T>(
        url: string,
        body: any,
        headers: Record<string, string> = {}
    ): Promise<T> {
        return this.fetchWithRetry<T>(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: JSON.stringify(body),
        });
    }

    async deleteWithRetry<T>(
        url: string,
        headers: Record<string, string> = {}
    ): Promise<T> {
        return this.fetchWithRetry<T>(url, {
            method: 'DELETE',
            headers,
        });
    }
}

export const httpClient = new RetryableHttpClient();
