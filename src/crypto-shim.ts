/**
 * Browser crypto shim using Web Crypto API
 */

// Re-export Web Crypto as node:crypto compatible interface
export function createHmac(algorithm: string, secret: string) {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  let data: Uint8Array[] = [];

  return {
    update(input: string) {
      data.push(encoder.encode(input));
      return this;
    },
    async digestAsync(): Promise<string> {
      const key = await crypto.subtle.importKey(
        'raw',
        secretKey,
        { name: 'HMAC', hash: algorithm === 'sha256' ? 'SHA-256' : 'SHA-512' },
        false,
        ['sign']
      );
      
      // Concatenate all data
      const totalLength = data.reduce((sum, arr) => sum + arr.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const arr of data) {
        combined.set(arr, offset);
        offset += arr.length;
      }
      
      const signature = await crypto.subtle.sign('HMAC', key, combined);
      return btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    },
    digest(encoding: 'base64url'): string {
      // Sync version - will throw in browser
      throw new Error('Use digestAsync() in browser environment');
    }
  };
}

export function createHash(algorithm: string) {
  const encoder = new TextEncoder();
  let data: Uint8Array[] = [];

  return {
    update(input: string) {
      data.push(encoder.encode(input));
      return this;
    },
    async digestAsync(encoding: 'hex'): Promise<string> {
      const totalLength = data.reduce((sum, arr) => sum + arr.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const arr of data) {
        combined.set(arr, offset);
        offset += arr.length;
      }
      
      const hashBuffer = await crypto.subtle.digest(
        algorithm === 'sha256' ? 'SHA-256' : 'SHA-512',
        combined
      );
      
      const hashArray = new Uint8Array(hashBuffer);
      return Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    },
    digest(encoding: 'hex'): string {
      throw new Error('Use digestAsync() in browser environment');
    }
  };
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export default { createHmac, createHash, randomUUID };
