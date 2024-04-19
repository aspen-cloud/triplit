export function debounce<I extends Array<any>, O>(
  callback: (...args: I) => O,
  n = 1000
) {
  let timer: NodeJS.Timeout | undefined;
  return (...args: I) => {
    if (timer == null) {
      callback(...args);
    } else {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      callback(...args);
    }, n);
  };
}
