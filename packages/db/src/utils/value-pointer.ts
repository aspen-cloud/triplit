export class ValuePointer {
  static Get(data: Record<string, any>, path: string | Iterable<string>): any {
    const keys = typeof path === 'string' ? path.split('.') : path;
    let current = data;
    for (const key of keys) {
      if (Array.isArray(current)) {
        current = current.map((item) => item[key]);
      } else {
        if (current[key] === undefined) return undefined;
        current = current[key];
      }
    }
    return current;
  }

  static Set(data: Record<string, any>, path: string | string[], value: any) {
    const keys = Array.isArray(path) ? path : path.split('.');
    let current = data;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (current[key] === undefined) current[key] = {};
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
  }
}
