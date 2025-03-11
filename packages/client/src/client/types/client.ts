import { TransactOptions } from '@triplit/db';

export type ClientTransactOptions = Pick<TransactOptions, 'skipRules'> & {
  manualSchemaRefresh?: boolean;
};
