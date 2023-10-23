type InputLabelProps = {
  value: String;
};

export function InputLabel(props: InputLabelProps) {
  return (
    <p className="text-xs ml-1 mb-1 text-zinc-500 font-medium">{props.value}</p>
  );
}
