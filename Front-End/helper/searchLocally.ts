


export function searchLocally<T>(query: string, data: T[]) {
  const q = query.toLowerCase();
  return data.filter((item: any) => {
    const searchInObject = (obj: any): boolean => {
      return Object.values(obj).some((value) => {
        if (typeof value === "string") {
          return value.toLowerCase().includes(q);
        }
        if (typeof value === "number") {
          return String(value).toLowerCase().includes(q);
        }
        if (typeof value === "object" && value !== null) {
          return searchInObject(value);
        }
        return false;
      });
    };
    return searchInObject(item);
  });
}
