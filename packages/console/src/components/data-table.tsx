import {
  Cell,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Input,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Select,
  Textarea,
  Tooltip,
  cn,
  SetInput,
  Button,
  Code,
} from '@triplit/ui';
import { PARSE_FUNCS } from './create-entity-sheet';
import { CopyValueMenu } from './copy-value-menu.js';
import { TriplitClient } from '@triplit/client';
import { ArrowSquareOut } from '@phosphor-icons/react';
import {
  TriplitDataTypes,
  updateTriplitSet,
  updateTriplitValue,
} from 'src/utils/mutate-cells.js';
import { useToast } from 'src/hooks/useToast.js';
import { RoleFilters } from './role-filters.js';
import { atom, useAtom } from 'jotai';
import type {
  SetType,
  Relationship,
  RecordType,
  DataType,
  PrimitiveType,
  CollectionPermissions,
} from '@triplit/db';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

type ColumnHeaderProps = {
  attribute: string;
  onClickHeader?: () => void;
  rightIcon?: React.ReactNode;
  attributeDef?: DataType | Relationship;
} & React.HTMLAttributes<HTMLDivElement>;

function isRelationship(
  attributeDef: DataType | Relationship
): attributeDef is Relationship {
  return (attributeDef as Relationship).query !== undefined;
}

export function TriplitColumnHeader(props: ColumnHeaderProps) {
  const { attribute, onClickHeader, rightIcon, attributeDef, children } = props;
  return (
    <div
      className="flex flex-row gap-2 items-center justify-between text-xs px-4 w-full h-full"
      onClick={onClickHeader}
    >
      <div className="flex flex-row items-center truncate gap-1">
        <div className="truncate">{attribute}</div>
        {attributeDef && (
          <div className="font-normal text-primary/50 truncate">
            {isRelationship(attributeDef) ? 'relation' : attributeDef.type}
          </div>
        )}
        {children}
      </div>
      {rightIcon}
    </div>
  );
}

function SetCellContents({
  triplitSet,
  definition,
  limit = 3,
  className,
}: {
  triplitSet: Set<any> | null;
  definition: SetType;
  limit?: number;
  className?: string;
}) {
  if (!triplitSet) return null;
  const items = [...triplitSet];
  return (
    <div className="flex flex-row gap-1 items-center">
      <div>{'{'}</div>
      {items.slice(0, limit).map((item) => (
        <div
          key={item}
          className={cn('bg-secondary px-1 py-0.5 rounded-sm', className)}
        >
          <CellValue value={item} definition={definition} />
        </div>
      ))}
      {items.length > limit && (
        <Tooltip
          label={
            <SetCellContents
              definition={definition}
              triplitSet={triplitSet}
              limit={Infinity}
              className="border bg-inherit"
            />
          }
        >
          <div>+{items.length - limit}</div>
        </Tooltip>
      )}
      <div>{'}'}</div>
    </div>
  );
}

function RecordCellContents({
  record,
  definition,
  limit = 3,
  className,
}: {
  record: Record<string, any>;
  definition?: RecordType;
  limit?: number;
  className?: string;
}) {
  if (!record) return null;
  const items = Object.entries(record);
  return (
    <div className="flex flex-row gap-1 items-center">
      <div>{'{'}</div>
      {items.slice(0, limit).map(([key, value]) => (
        <div
          key={key}
          className={cn(
            'bg-secondary px-1 py-0.5 rounded-sm flex flex-row items-center gap-1',
            className
          )}
        >
          <div>{key} :</div>
          <CellValue value={value} definition={definition?.properties[key]} />
        </div>
      ))}
      {items.length > limit && (
        <Tooltip
          label={
            <RecordCellContents
              record={record}
              limit={Infinity}
              className="border bg-inherit"
            />
          }
        >
          <div>+{items.length - limit}</div>
        </Tooltip>
      )}
      <div>{'}'}</div>
    </div>
  );
}

function CellValue(props: { definition: DataType; value: TriplitDataTypes }) {
  const { definition, value } = props;
  if (value === null) return <span className="text-primary/50">null</span>;
  if (value === undefined) return '';
  if (definition.type === 'record' && value instanceof Object)
    return <RecordCellContents record={value} definition={definition} />;
  if (definition.type === 'set' && value instanceof Set)
    return (
      <SetCellContents definition={definition} triplitSet={value as Set<any>} />
    );
  if (definition.type === 'date' && value instanceof Date)
    return (value as Date).toISOString();
  if (typeof value === 'number')
    return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return JSON.stringify(value, null, 2);
}

type TriplitRelationCellProps = {
  queryDef: Relationship;
  onClickRelationLink: () => void;
};

export function RelationCell({
  queryDef,
  onClickRelationLink,
}: TriplitRelationCellProps) {
  const { collectionName: linkedCollection } = queryDef.query;
  return (
    <Button
      variant={'link'}
      className="text-blue-500 text-xs px-4 h-auto"
      onClick={onClickRelationLink}
    >
      {linkedCollection} <ArrowSquareOut className="w-3 h-3 ml-1" />
    </Button>
  );
}

type TriplitDataCellProps = {
  entityId: string;
  client: TriplitClient<any>;
  collection: string;
  attribute: string;
  value: TriplitDataTypes;
  attributeDef?: DataType;
  editable?: boolean;
  optional?: boolean;
  permissions?: CollectionPermissions<any, any>;
};

const selectedAtom = atom<string | null>(null);

export function DataCell({
  value,
  entityId,
  attribute,
  attributeDef = { type: 'string', config: { nullable: true } },
  client,
  collection,
  editable = true,
  optional = false,
  permissions,
}: TriplitDataCellProps) {
  const { toast } = useToast();
  const rowKey = `${attribute}:${entityId}`;
  const [selected] = useAtom(
    useMemo(() => atom((get) => get(selectedAtom) === rowKey), [rowKey])
  );
  const [_, setSelected] = useAtom(selectedAtom);
  const [isEditing, setIsEditing] = useState(false);
  const nullable = attributeDef?.config?.nullable ?? false;

  return (
    <Popover
      open={isEditing && editable && selected}
      // onOpenChange={setIsEditing}
    >
      <CopyValueMenu value={value}>
        <PopoverTrigger
          disabled={!editable}
          onClick={() => {
            if (!selected) {
              setSelected(rowKey);
              return;
            }
            setIsEditing(!isEditing);
          }}
          // setting height manually until we can figure out how to get these to fill the row
          className={`text-left px-3 py-2 border truncate w-full h-[38px] ${
            selected ? 'border-blue-600' : 'border-transparent'
          }`}
        >
          <CellValue
            definition={attributeDef ?? { type: 'string', options: {} }}
            value={value}
          />
        </PopoverTrigger>
      </CopyValueMenu>

      <PopoverContent className="text-xs p-1.5" align="start">
        {attributeDef?.type === 'set' ? (
          <SetCellEditor
            set={value}
            definition={attributeDef}
            onChangeSet={async (value, action) => {
              const error = await updateTriplitSet(
                attribute,
                client,
                collection,
                entityId,
                value,
                action
              );
              if (error) {
                toast({
                  title: 'Error',
                  description: error,
                  variant: 'destructive',
                });
                return;
              }
            }}
          />
        ) : (
          <PrimitiveCellEditor
            value={value}
            definition={attributeDef}
            onBlur={() => setIsEditing(false)}
            onSubmit={async (newValue: TriplitDataTypes) => {
              if (newValue !== value) {
                const error = await updateTriplitValue(
                  attribute,
                  client,
                  collection,
                  entityId,
                  newValue
                );
                if (error) {
                  toast({
                    title: 'Error',
                    description: error,
                    variant: 'destructive',
                  });
                  return;
                }
              }
              setIsEditing(false);
            }}
          />
        )}
        {(nullable || optional) && (
          <div className="pt-2 flex flex-row gap-2">
            <Button
              className="text-xs h-auto py-1 px-2 justify-self-start"
              variant={'ghost'}
              disabled={value === null}
              onClick={async (e) => {
                const error = await updateTriplitValue(
                  attribute,
                  client,
                  collection,
                  entityId,
                  null
                );
                if (error) {
                  toast({
                    title: 'Error',
                    description: error,
                    variant: 'destructive',
                  });
                  return;
                }
              }}
            >
              Set to <Code className="text-xs ml-1">null</Code>
            </Button>
          </div>
        )}
        {permissions && (
          <RoleFilters
            permissions={permissions}
            rule="update"
            client={client}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

type SetCellEditorProps = {
  onChangeSet(value: string | null, action: 'add' | 'delete' | 'null'): void;
  set: Set<string> | undefined;
  definition: SetType;
};

function SetCellEditor(props: SetCellEditorProps) {
  const { set, onChangeSet, definition } = props;
  return (
    <SetInput
      value={set}
      onAddItem={(value) => {
        onChangeSet(value, 'add');
      }}
      onRemoveItem={(value) => {
        onChangeSet(value, 'delete');
      }}
      parse={PARSE_FUNCS[definition.items.type]}
      renderItem={(value) => (
        <CellValue value={value} definition={definition.items} />
      )}
    />
  );
}

type PrimitiveCellEditorProps = {
  value: TriplitDataTypes;
  definition: PrimitiveType;
  onSubmit: (newValue: TriplitDataTypes) => void;
  onBlur: () => void;
};

function coerceStringToTriplitType(
  value: string | null | Array<any>,
  definition: DataType
) {
  const { type } = definition;
  if (value === null) return value;
  if (type === 'json') return JSON.parse(value);
  if (type === 'number') return Number(value);
  if (type === 'boolean') return JSON.parse(value);
  if (type === 'date') return new Date(value);
  if (type === 'set') return new Set(value);
  return value;
}

function coerceTriplitTypeToInput(
  value: TriplitDataTypes,
  definition: DataType
) {
  const { type } = definition;
  if (value === null || value === undefined) return '';
  if (type && type === 'date')
    return new Date(value as string | Date).toISOString();
  if (type && type === 'json') return JSON.stringify(value);
  return String(value);
}

function PrimitiveCellEditor(props: PrimitiveCellEditorProps) {
  const { value, definition, onSubmit, onBlur } = props;
  const { type, config } = definition;
  const nullable = config?.nullable ?? false;
  const [draftValue, setDraftValue] = useState<string>(
    type ? coerceTriplitTypeToInput(value, definition) : JSON.stringify(value)
  );
  const [error, setError] = useState('');
  const EditorInput = useMemo(() => {
    if (type === 'date') return DateInput;
    if (type === 'boolean') return BooleanInput;
    if (type === 'number') return NumberInput;
    if (type === 'string' && definition.config?.enum) return EnumInput;
    return StringInput;
  }, [type]);

  const submitNewValue = useCallback(() => {
    try {
      const submitValue = type
        ? coerceStringToTriplitType(draftValue, definition)
        : JSON.parse(draftValue);
      onSubmit(submitValue);
    } catch (e: any) {
      setError(e.message);
    }
  }, [definition, draftValue]);

  return (
    <div>
      <EditorInput
        onChange={(newValue) => {
          setDraftValue(newValue);
          setError('');
        }}
        value={draftValue}
        options={definition.config?.enum}
      />
      {error && <div className="text-red-500 my-1 text-xs">{error}</div>}
      <div className="flex flex-row gap-1 justify-end mt-1">
        <Button
          onClick={(e) => {
            onBlur();
          }}
          size={'sm'}
          className="text-xs h-auto py-1 px-2"
          variant={'outline'}
        >
          Cancel
        </Button>
        <Button
          onClick={(e) => {
            e.preventDefault();
            submitNewValue();
          }}
          size={'sm'}
          className="text-xs h-auto py-1 px-2"
        >
          Save
        </Button>
      </div>
    </div>
  );
}

type InputProps = {
  value: string;
  onChange: (newValue: any) => void;
};

function NumberInput(props: InputProps) {
  const { value, onChange } = props;
  return (
    <Input
      autoFocus
      type="number"
      value={value || undefined}
      onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
    />
  );
}

function BooleanInput(props: InputProps) {
  const { value, onChange } = props;
  return (
    <Select
      data={['false', 'true']}
      value={value}
      onValueChange={(value) => onChange(value)}
    />
  );
}

function StringInput(props: InputProps) {
  const { value, onChange } = props;
  return (
    <Textarea
      className="bg-muted"
      autoFocus
      value={value as string}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function EnumInput(props: InputProps & { options: string[] }) {
  const { value, onChange, options } = props;
  return (
    <Select
      data={options}
      value={value}
      onValueChange={(value) => onChange(value)}
    />
  );
}

function DateInput(props: InputProps) {
  const { value, onChange } = props;
  return (
    <Input
      autoFocus
      type="text"
      maxLength={24}
      value={value as string}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    defaultColumn: {
      size: 150,
      minSize: 50,
      maxSize: 1000,
    },
    getRowId: (row) => row.id,
  });

  return (
    <Table
      className="bg-popover text-xs border-r "
      style={{ width: table.getCenterTotalSize() }}
    >
      <TableHeader className="sticky top-0 bg-popover border-t">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className={``}>
            {headerGroup.headers.map((header, index) => {
              return (
                <TableHead
                  key={header.id}
                  className="px-0 relative truncate "
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                  {header.id !== 'new_column_creator' && (
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className="cursor-col-resize absolute right-0 top-0 w-2 h-full"
                    />
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody className="h-full w-full min-w-max  overflow-y-auto">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => {
            return (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
              >
                {row.getVisibleCells().map((cell) => (
                  // This key shouldn't use index
                  <FlashingCell key={cell.id} cell={cell} />
                ))}
              </TableRow>
            );
          })
        ) : (
          <TableRow className="bg-popover hover:bg-inherit">
            <TableCell className="w-full text-left text-muted-foreground">
              No results
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function FlashingCell({ cell }: { cell: Cell<any, any> }) {
  const stringifiedValue = useMemo(() => {
    const value = cell.getValue();
    if (typeof value !== 'object' || value === null) return value;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Set) return JSON.stringify([...value]);
    if (value instanceof Map) return JSON.stringify([...value]);
    return JSON.stringify(value);
  }, [cell.getValue()]);
  const [hasRecentlyChanged, setHasRecentlyChanged] = useState(false);

  const prevState = useRef(undefined);
  // const [isFirstRender, setIsFirstRender] = useState(true);

  useEffect(() => {
    if (
      prevState.current !== stringifiedValue &&
      prevState.current !== undefined
    ) {
      setHasRecentlyChanged(true);
      setTimeout(() => {
        setHasRecentlyChanged(false);
      }, 1000);
    }
    prevState.current = stringifiedValue;
  }, [stringifiedValue]);

  return (
    <TableCell
      className={`truncate p-0 transition-colors ${
        hasRecentlyChanged ? 'bg-muted' : 'bg-transparent'
      }`}
      style={{ width: cell.column.getSize() }}
    >
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </TableCell>
  );
}
