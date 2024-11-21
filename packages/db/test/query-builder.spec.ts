import { it, expect, describe } from 'vitest';
import DB from '../src/db.js';
import { Models } from '../src/schema/types/index.js';
import {
  FilterGroup,
  FilterStatement,
  OrderStatement,
  RelationshipExistsFilter,
  SubQueryFilter,
  WhereFilter,
} from '../src/query/types/index.js';
import { QueryClauseFormattingError } from '../src/errors.ts';

it('query builder doesnt overwrite previous builder objects', async () => {
  const db = new DB();
  const originalBuilder = db
    .query('test')
    .id('123')
    .include('foo', {
      subquery: { collectionName: 'bar' },
      cardinality: 'many',
    })
    .limit(10)
    .order('name', 'ASC')
    .after(['1', '1'])
    .select(['id', 'name'])
    .vars({ foo: 'bar' })
    .where(['name', '=', 'foo']);

  const updatedBuilder = originalBuilder
    .id('234')
    .include('bar', {
      subquery: { collectionName: 'baz' },
      cardinality: 'one',
    })
    .limit(20)
    .order('name', 'DESC')
    .after(['2', '2'])
    .select(['id', 'name', 'age'])
    .vars({ bar: 'baz' })
    .where(['age', '=', 21]);

  expect(originalBuilder.build()).toEqual({
    collectionName: 'test',
    after: [['1', '1'], false],
    include: {
      foo: {
        subquery: { collectionName: 'bar' },
        cardinality: 'many',
      },
    },
    limit: 10,
    order: [['name', 'ASC']],
    select: ['id', 'name'],
    vars: { foo: 'bar' },
    where: [
      ['id', '=', '123'],
      ['name', '=', 'foo'],
    ],
  });

  expect(updatedBuilder.build()).toEqual({
    collectionName: 'test',
    after: [['2', '2'], false],
    include: {
      bar: {
        subquery: { collectionName: 'baz' },
        cardinality: 'one',
      },
      foo: {
        subquery: { collectionName: 'bar' },
        cardinality: 'many',
      },
    },
    limit: 20,
    order: [
      ['name', 'ASC'],
      ['name', 'DESC'],
    ],
    select: ['id', 'name', 'age'],
    vars: { bar: 'baz' },
    where: [
      ['id', '=', '234'],
      ['name', '=', 'foo'],
      ['age', '=', 21],
    ],
  });
});

describe('where', () => {
  const booleanClause = true;
  const filterClause: FilterStatement<Models, any> = ['name', '=', 'foo'];
  const subqueryClause: SubQueryFilter<Models, any> = {
    exists: {
      collectionName: 'bar',
      where: [['id', '=', 'baz']],
    },
  };
  const existsClause: RelationshipExistsFilter<Models, any> = {
    type: 'relationshipExists',
    relationship: 'foo' as never,
    query: {
      where: [['id', '=', 'baz']],
    },
  };
  const filterGroupClause: FilterGroup<Models, any> = {
    mod: 'or',
    filters: [
      ['name', '=', 'foo'],
      ['age', '>', 21],
    ],
  };
  const clauses: WhereFilter<Models, any>[] = [
    booleanClause,
    filterClause,
    subqueryClause,
    existsClause,
    filterGroupClause,
  ];
  it('where() accepts single clause', () => {
    const db = new DB();
    for (const clause of clauses) {
      const query = db.query('test').where(clause).build();
      expect(query.where).toEqual([clause]);
    }
  });
  it('where() accepts multiple clauses', () => {
    const db = new DB();
    const query = db
      .query('test')
      .where(...clauses)
      .build();
    expect(query.where).toEqual(clauses);
  });
  it('where() accepts a joint clause', () => {
    const db = new DB();
    const query = db.query('test').where(clauses).build();
    expect(query.where).toEqual(clauses);
  });
  it('adding multiple where clauses appends them to the existing where clauses', () => {
    const db = new DB();
    let query = db.query('test');
    for (const clause of clauses) {
      query = query.where(clause);
    }
    expect(query.build().where).toEqual(clauses);
  });
  it('passing undefined is a no-op', () => {
    const db = new DB();
    const query = db
      .query('test')
      .where(filterClause)
      .where(undefined)
      .where()
      .build();
    expect(query.where).toEqual([filterClause]);
  });
  it('a malformed clause throws an error', () => {
    const db = new DB();
    expect(() =>
      db
        .query('test')
        .where(
          // @ts-expect-error
          'invalid'
        )
        .build()
    ).toThrow(QueryClauseFormattingError);
  });
});

describe('order', () => {
  const order1: OrderStatement<Models, any> = ['name', 'ASC'];
  const order2: OrderStatement<Models, any> = ['age', 'DESC'];
  const clauses = [order1, order2];
  it('order() accepts single clause', () => {
    const db = new DB();
    for (const clause of clauses) {
      const query = db.query('test').order(clause).build();
      expect(query.order).toEqual([clause]);
    }
  });
  it('order() accepts multiple clauses', () => {
    const db = new DB();
    const query = db
      .query('test')
      .order(...clauses)
      .build();
    expect(query.order).toEqual(clauses);
  });
  it('order() accepts a joint clause', () => {
    const db = new DB();
    const query = db.query('test').order(clauses).build();
    expect(query.order).toEqual(clauses);
  });
  it('adding multiple order clauses appends them to the existing order clauses', () => {
    const db = new DB();
    let query = db.query('test');
    for (const clause of clauses) {
      query = query.order(clause);
    }
    expect(query.build().order).toEqual(clauses);
  });
  it('passing undefined is a no-op', () => {
    const db = new DB();
    const query = db
      .query('test')
      .order(order1)
      .order(undefined)
      .order()
      .build();
    expect(query.order).toEqual([order1]);
  });
  it('a malformed clause throws an error', () => {
    const db = new DB();
    expect(() =>
      db
        .query('test')
        .order(
          // @ts-expect-error
          'invalid'
        )
        .build()
    ).toThrow(QueryClauseFormattingError);
  });
});
