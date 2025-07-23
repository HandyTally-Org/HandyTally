// Create a custom storage implementation that works in both browser and server environments
class CustomStorage {
  private store: Record<string, string> = {};
  
  async getItem(key: string): Promise<string | null> {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      // Use localStorage in browser
      return localStorage.getItem(key);
    }
    // Use in-memory storage in server
    return this.store[key] || null;
  }
  
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, value);
    } else {
      this.store[key] = value;
    }
  }
  
  async removeItem(key: string): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(key);
    } else {
      delete this.store[key];
    }
  }
}

export const customStorage = new CustomStorage(); 