import dayjs from "dayjs";
/**
 * Date helper
 */
export class DateHelper {
  /**
   * Add days
   * @param value
   * @param unit
   * @returns
   */
  static add(value: number, unit: dayjs.ManipulateType) {
    return dayjs().add(30, unit);
  }

  /**
   * Subtract days
   * @param value
   * @param unit
   * @returns
   * @example
   * DateHelper.subtract(30, "day");
   * DateHelper.subtract(30, "month");
   * DateHelper.subtract(30, "year");
   * DateHelper.subtract(30, "hour");
   */
  static subtract(value: number, unit: dayjs.ManipulateType) {
    return dayjs().subtract(value, unit);
  }

  /**
   * Get difference between two dates
   * @param date1
   * @param date2
   * @returns
   * @example
   * DateHelper.diff({ date1: "2021-01-01", date2: "2021-01-02", unit: "day" });
   */
  static diff({
    date1,
    date2,
    unit = "years",
  }: {
    date1: string | number | Date;
    date2?: string | number | Date;
    unit?: dayjs.ManipulateType;
  }) {
    if (date2) {
      return dayjs(date2).diff(date1, unit);
    } else {
      return dayjs().diff(date1, unit);
    }
  }

  // format
  static format(date: string | number | Date, format: string = "MM-DD-YYYY") {
    let d;
    d = dayjs(date).format(format);
    return d;
  }

  static formatDate(date: string | number | Date) {
    const d = new Date(date);
    return d.toDateString();
  }

  static now() {
    const date = new Date();
    return date;
  }

  static nowString() {
    const date = new Date();
    return date.toISOString();
  }

  static nowDate() {
    const date = new Date();
    return date.toDateString();
  }

  static addDays(dateData: string | number | Date, days: number) {
    days = Number(days);
    const date = new Date(dateData.valueOf());
    date.setDate(date.getDate() + days);
    return date.toDateString();
  }
}
