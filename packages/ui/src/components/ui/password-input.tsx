import { Input } from './input';
import { Button } from './button';
import { ComponentProps, useState } from 'react';
import { Tooltip } from './tooltip-simple';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordInput(props: ComponentProps<typeof Input>) {
  const [type, setType] = useState('password');
  return (
    <div className="flex flex-row gap-2 items-center w-full">
      <Input type={type} {...props} />
      <Tooltip label={type === 'password' ? 'Reveal' : 'Hide'}>
        <Button
          variant={'ghost'}
          type="button"
          className="p-1 h-auto"
          onClick={() => {
            setType(type === 'password' ? 'text' : 'password');
          }}
        >
          {type === 'password' ? <Eye size={18} /> : <EyeOff size={18} />}
        </Button>
      </Tooltip>
    </div>
  );
}
