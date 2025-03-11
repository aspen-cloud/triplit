import { TransactOptions } from '@triplit/entity-db';

export type ClientTransactOptions = Pick<TransactOptions, 'skipRules'> & {
  manualSchemaRefresh?: boolean;
};
