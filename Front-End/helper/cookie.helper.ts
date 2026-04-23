import nookies, { parseCookies } from "nookies";

/**
 * Cookie helper
 */
export class CookieHelper {
  /**
   * set cookie
   */
  static set({
    key,
    value,
    context = null,
    expires = 30 * 24 * 60 * 60,
    path = "/",
  }: {
    key: any;
    value: any;
    context?: any;
    expires?: number;
    path?: string;
  }) {
    nookies.set(context, key, value, {
      maxAge: expires,
      path: path,
    });
  }

  /**
   * get cookie
   * @param {*}
   * @returns
   */
  static get({ key, context = null }: { key: any; context?: any }) {
    const cookiesParse = parseCookies(context);
    return cookiesParse[key];
  }

  /**
   * Destroy cookie
   */
  static destroy({
    key,
    context = null,
    path = "/",
  }: {
    key: any;
    context?: any;
    path?: string;
  }) {
    nookies.destroy(context, key, {
      path: path, // THE KEY IS TO SET THE SAME PATH
    });
  }
}
