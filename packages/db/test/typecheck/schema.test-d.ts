import { describe, it, assertType } from 'vitest';
import { Schema as S } from '../../src/schema/builder.js';

describe('S.Collections', () => {
  it('relaionships must reference a valid collection', () => {
    assertType(
      S.Collections({
        todos: {
          schema: S.Schema({
            id: S.Id(),
            title: S.String(),
            completed: S.Boolean(),
          }),
          relationships: {
            // @ts-expect-error collection users does not exist
            relId: S.RelationById('users', '$id'),
            // @ts-expect-error collection users does not exist
            relOne: S.RelationOne('users', {
              where: [['id', '=', '$id']],
            }),
            // @ts-expect-error collection users does not exist
            relMany: S.RelationMany('users', {
              where: [['id', '=', '$id']],
            }),
            raw: {
              cardinality: 'one',
              query: {
                // @ts-expect-error collection users does not exist
                collectionName: 'users',
                where: [['id', '=', '$id']],
              },
            },
          },
        },
      })
    );
    assertType(
      S.Collections({
        todos: {
          schema: S.Schema({
            id: S.Id(),
            title: S.String(),
            completed: S.Boolean(),
          }),
          relationships: {
            relId: S.RelationById('users', '$id'),
            relOne: S.RelationOne('users', {
              where: [['id', '=', '$id']],
            }),
            relMany: S.RelationMany('users', {
              where: [['id', '=', '$id']],
            }),
            raw: {
              cardinality: 'one',
              query: {
                collectionName: 'users',
                where: [['id', '=', '$id']],
              },
            },
          },
        },
        users: {
          schema: S.Schema({
            id: S.Id(),
            name: S.String(),
          }),
        },
      })
    );
  });
});

describe('S.Schema', () => {
  it('requires an id field', () => {
    assertType(
      S.Schema(
        // @ts-expect-error requires id
        {
          name: S.String(),
        }
      )
    );
    assertType(
      S.Schema({
        id: S.Id(),
        name: S.String(),
      })
    );
  });
  it('only accepts DataType values', () => {
    assertType(
      S.Schema({
        id: S.Id(),
        name: S.String(),
        // @ts-expect-error not a DataType
        age: 42,
      })
    );
    assertType(
      S.Schema({
        id: S.Id(),
        name: S.String(),
        // @ts-expect-error not a DataType
        age: S.RelationById('users', '123'),
      })
    );
    assertType(
      S.Schema({
        id: S.Id(),
        name: S.String(),
        age: S.Number(),
      })
    );
  });
});
