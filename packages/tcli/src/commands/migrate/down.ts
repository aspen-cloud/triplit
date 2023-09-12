import { yellow, italic } from 'ansis/colors';

export const description = 'Runs down migrations on the database';

export const run = async () => {
  console.log(yellow`Running ${italic('down')} migrations`);
};
