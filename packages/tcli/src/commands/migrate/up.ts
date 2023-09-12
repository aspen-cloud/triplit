import { blue, italic } from 'ansis/colors';

export const description = 'Runs up migrations on the database';

export const run = async () => {
  // @ts-ignore
  console.log(blue`Running ${italic('up')} migrations`);
};
