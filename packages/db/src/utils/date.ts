const DATE_TIME_SEPARATOR = /t|\s/i;
export function isDateTime(str: string): boolean {
  // http://tools.ietf.org/html/rfc3339#section-5.6
  const dateTime: string[] = str.split(DATE_TIME_SEPARATOR);
  return (
    dateTime.length === 2 && isDate(dateTime[0]) && isTime(dateTime[1], true)
  );
}

function isLeapYear(year: number): boolean {
  // https://tools.ietf.org/html/rfc3339#appendix-C
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const DATE = /^[\+\-]?([\d]{4,6})-(\d\d)-(\d\d)$/;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isDate(str: string): boolean {
  // full-date from http://tools.ietf.org/html/rfc3339#section-5.6
  const matches: string[] | null = DATE.exec(str);
  if (!matches) return false;
  const year: number = +matches[1];
  const month: number = +matches[2];
  const day: number = +matches[3];
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month])
  );
}

const TIME = /^(\d\d):(\d\d):(\d\d)(\.\d+)?(z|[+-]\d\d(?::?\d\d)?)?$/i;

function isTime(str: string, withTimeZone?: boolean): boolean {
  const matches: string[] | null = TIME.exec(str);
  if (!matches) return false;

  const hour: number = +matches[1];
  const minute: number = +matches[2];
  const second: number = +matches[3];
  const timeZone: string = matches[5];
  return (
    ((hour <= 23 && minute <= 59 && second <= 59) ||
      (hour === 23 && minute === 59 && second === 60)) &&
    (!withTimeZone || timeZone !== '')
  );
}
