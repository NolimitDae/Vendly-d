/**
 * UtilHelper
 */
export const UtilHelper = {
  /**
   * debouncing
   * @param {*} fn
   * @param {*} delay
   * @returns
   */
  debounce: function (fn: any, delay: number = 300) {
    let timer: any;
    return function () {
      let context = this,
        args = arguments;

      clearTimeout(timer);
      timer = setTimeout(() => {
        fn.apply(context, args);
      }, delay);
    };
  },
};
