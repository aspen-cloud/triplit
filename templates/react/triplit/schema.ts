import { Schema as S, type Entity } from '@triplit/client';

// This is your schema definition.
//
// For all of the supported types and options, check the documentation:
//   https://triplit.dev/docs/schemas/types
//
// Whenever you change your schema while the sync server is running
// you'll need to run
//
//   `triplit schema push`
//
// Read more about schema management:
//  https://www.triplit.dev/docs/schemas/updating

export const schema = S.Collections({
  todos: {
    schema: S.Schema({
      id: S.Id(),
      text: S.String(),
      completed: S.Boolean({ default: false }),
      created_at: S.Date({ default: S.Default.now() }),
    }),
  },
});

// Use the `Entity` type to extract clean types for your collections
export type Todo = Entity<typeof schema, 'todos'>;
