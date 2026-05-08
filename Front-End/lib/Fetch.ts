import axios, { AxiosError } from "axios";
import { AppConfig } from "../config/app.config";

axios.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const path = window.location.pathname;
      const publicPaths = ["/login", "/register", "/otp", "/forget-password", "/change-password"];
      if (!publicPaths.some((p) => path.startsWith(p))) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

type AdapterOption = "fetch" | "axios";

export class Fetch {
  private static _baseUrl = `${AppConfig().app.apiUrl}`;
  private static _adapter: AdapterOption = "axios";

  static setAdapter(adapter: AdapterOption) {
    this._adapter = adapter;
  }

  static async get(url: string, header?: any) {
    if (this._adapter === "axios") {
      return await axios.get(`${this._baseUrl}${url}`, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, header);
    return await res.json();
  }

  static async post(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.post(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, { ...header, method: "POST", body: data });
    return await res.json();
  }

  static async put(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.put(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, { ...header, method: "PUT", body: data });
    return await res.json();
  }

  static async patch(url: string, data: any, header?: any) {
    if (this._adapter === "axios") {
      return await axios.patch(`${this._baseUrl}${url}`, data, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, { ...header, method: "PATCH", body: data });
    return await res.json();
  }

  static async delete(url: string, header?: any) {
    if (this._adapter === "axios") {
      return await axios.delete(`${this._baseUrl}${url}`, header);
    }
    const res = await fetch(`${this._baseUrl}${url}`, { ...header, method: "DELETE" });
    return await res.json();
  }
}
