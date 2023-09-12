export const flags = {
  //   file: Flags.file({
  //     description: 'The file to run',
  //     required: false,
  //     char: 'f',
  //   }),
};

export function run({ flags, args }) {
  console.log(flags);
}
