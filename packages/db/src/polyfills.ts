// @ts-nocheck
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof Symbol.dispose === 'undefined') {
  Symbol.dispose = Symbol('Symbol.dispose');
}
if (typeof Symbol.asyncDispose === 'undefined') {
  Symbol.asyncDispose = Symbol('Symbol.asyncDispose');
}
