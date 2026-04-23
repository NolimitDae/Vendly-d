/**
 * StringHelper helps us with string methods
 */
export const StringHelper = {
  /**
   * Extract parts of a string
   */
  textShorten: (text, length = 100) => {
    let result;
    if (text.length >= length) {
      result = text.substring(0, length) + "...";
    } else {
      result = text;
    }
    return result;
  },

  /**
   * Replace text with performance
   */
  replace: (str, search, replacement) => {
    return str.split(search).join(replacement);
  },

  /**
   * return discounted price
   * @param {number} price
   * @param {number} discount
   */
  discount: (price, discount) => {
    let result;
    if (discount == null) {
      result = Number(price);
    } else {
      result = Number(price) - (Number(price) * Number(discount)) / 100;
    }
    return result;
  },
};
