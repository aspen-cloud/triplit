/**
 * Tests for SQL Query Planner
 */

import { describe, it, expect, vi } from 'vitest';
import { SQLQueryPlanner } from './query-planner.js';
import type { PreparedQuery } from '../query/types/index.js';

describe('SQLQueryPlanner', () => {
  describe('Basic SELECT queries', () => {
    it('should generate simple SELECT * query', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
      };

      const result = planner.planSelect(query);

      expect(result.sql).toBe('SELECT *\nFROM "posts"');
      expect(result.params).toEqual([]);
    });

    it('should generate SELECT with specific columns', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        select: ['id', 'title', 'content'],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toBe('SELECT "id", "title", "content"\nFROM "posts"');
      expect(result.params).toEqual([]);
    });

    it('should escape table names with special characters', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'user-posts',
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('FROM "user-posts"');
    });
  });

  describe('WHERE clause - comparison operators', () => {
    it('should handle equality operator', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['status', '=', 'published']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "status" = $1');
      expect(result.params).toEqual(['published']);
    });

    it('should handle inequality operator', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['status', '!=', 'deleted']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "status" != $1');
      expect(result.params).toEqual(['deleted']);
    });

    it('should handle greater than operator', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['views', '>', 100]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "views" > $1');
      expect(result.params).toEqual([100]);
    });

    it('should handle less than or equal operator', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['age', '<=', 18]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "age" <= $1');
      expect(result.params).toEqual([18]);
    });

    it('should handle multiple WHERE conditions with AND', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          ['status', '=', 'published'],
          ['views', '>', 100],
        ],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "status" = $1 AND "views" > $2');
      expect(result.params).toEqual(['published', 100]);
    });
  });

  describe('WHERE clause - pattern matching', () => {
    it('should handle LIKE operator', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['title', 'like', '%Triplit%']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "title" LIKE $1');
      expect(result.params).toEqual(['%Triplit%']);
    });

    it('should handle NOT LIKE operator', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['title', 'nlike', '%test%']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "title" NOT LIKE $1');
      expect(result.params).toEqual(['%test%']);
    });
  });

  describe('WHERE clause - set operations', () => {
    it('should handle IN operator with Set', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['status', 'in', new Set(['published', 'featured', 'pinned'])]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "status" IN ($1, $2, $3)');
      expect(result.params).toEqual(['published', 'featured', 'pinned']);
    });

    it('should handle NOT IN operator', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['status', 'nin', new Set(['deleted', 'banned'])]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "status" NOT IN ($1, $2)');
      expect(result.params).toEqual(['deleted', 'banned']);
    });

    it('should handle empty IN set', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['status', 'in', new Set([])]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE FALSE');
      expect(result.params).toEqual([]);
    });

    it('should handle empty NOT IN set', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['status', 'nin', new Set([])]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE TRUE');
      expect(result.params).toEqual([]);
    });
  });

  describe('WHERE clause - JSONB operations', () => {
    it('should handle has operator for JSONB', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['tags', 'has', 'important']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "tags" ? $1');
      expect(result.params).toEqual(['important']);
    });

    it('should handle !has operator for JSONB', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['tags', '!has', 'spam']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "tags" NOT ? $1');
      expect(result.params).toEqual(['spam']);
    });
  });

  describe('WHERE clause - null checks', () => {
    it('should handle isDefined operator', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['email', 'isDefined', true]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "email" IS NOT NULL');
      expect(result.params).toEqual([]);
    });
  });

  describe('WHERE clause - boolean filters', () => {
    it('should handle true boolean filter (match all)', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [true],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE TRUE');
      expect(result.params).toEqual([]);
    });

    it('should handle false boolean filter (match none)', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [false],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE FALSE');
      expect(result.params).toEqual([]);
    });
  });

  describe('WHERE clause - filter groups', () => {
    it('should handle OR filter group', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          {
            mod: 'or',
            filters: [
              ['status', '=', 'published'],
              ['featured', '=', true],
            ],
          },
        ],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE ("status" = $1 OR "featured" = $2)');
      expect(result.params).toEqual(['published', true]);
    });

    it('should handle AND filter group', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          {
            mod: 'and',
            filters: [
              ['status', '=', 'published'],
              ['views', '>', 100],
            ],
          },
        ],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE ("status" = $1 AND "views" > $2)');
      expect(result.params).toEqual(['published', 100]);
    });

    it('should handle nested filter groups', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          {
            mod: 'and',
            filters: [
              ['status', '=', 'published'],
              {
                mod: 'or',
                filters: [
                  ['views', '>', 1000],
                  ['featured', '=', true],
                ],
              },
            ],
          },
        ],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain(
        'WHERE ("status" = $1 AND ("views" > $2 OR "featured" = $3))'
      );
      expect(result.params).toEqual(['published', 1000, true]);
    });
  });

  describe('WHERE clause - subquery filters', () => {
    it('should handle EXISTS subquery', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          {
            exists: {
              collectionName: 'users',
              where: [
                ['id', '=', '$1.authorId'],
                ['role', '=', 'admin'],
              ],
            },
          },
        ],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('EXISTS (SELECT 1 FROM "users"');
      expect(result.sql).toContain('WHERE "id" = $1 AND "role" = $2');
      expect(result.params).toEqual(['$1.authorId', 'admin']);
    });
  });

  describe('ORDER BY clause', () => {
    it('should handle single ORDER BY ascending', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        order: [['createdAt', 'ASC']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('ORDER BY "createdAt" ASC');
    });

    it('should handle single ORDER BY descending', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        order: [['views', 'DESC']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('ORDER BY "views" DESC');
    });

    it('should handle multiple ORDER BY fields', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        order: [
          ['status', 'ASC'],
          ['createdAt', 'DESC'],
        ],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('ORDER BY "status" ASC, "createdAt" DESC');
    });
  });

  describe('LIMIT clause', () => {
    it('should handle LIMIT', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        limit: 10,
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('LIMIT 10');
    });
  });

  describe('Complex queries', () => {
    it('should handle query with WHERE, ORDER BY, and LIMIT', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          ['status', '=', 'published'],
          ['views', '>', 100],
        ],
        order: [['createdAt', 'DESC']],
        limit: 20,
      };

      const result = planner.planSelect(query);

      expect(result.sql).toBe(
        'SELECT *\n' +
          'FROM "posts"\n' +
          'WHERE "status" = $1 AND "views" > $2\n' +
          'ORDER BY "createdAt" DESC\n' +
          'LIMIT 20'
      );
      expect(result.params).toEqual(['published', 100]);
    });

    it('should handle query with SELECT, WHERE, ORDER BY, and LIMIT', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        select: ['id', 'title', 'views'],
        where: [['status', '=', 'published']],
        order: [
          ['views', 'DESC'],
          ['createdAt', 'DESC'],
        ],
        limit: 5,
      };

      const result = planner.planSelect(query);

      expect(result.sql).toBe(
        'SELECT "id", "title", "views"\n' +
          'FROM "posts"\n' +
          'WHERE "status" = $1\n' +
          'ORDER BY "views" DESC, "createdAt" DESC\n' +
          'LIMIT 5'
      );
      expect(result.params).toEqual(['published']);
    });

    it('should handle search query with LIKE and complex filters', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          {
            mod: 'and',
            filters: [
              {
                mod: 'or',
                filters: [
                  ['title', 'like', '%search%'],
                  ['content', 'like', '%search%'],
                ],
              },
              ['status', 'in', new Set(['published', 'featured'])],
            ],
          },
        ],
        order: [['relevance', 'DESC']],
        limit: 50,
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('(("title" LIKE $1 OR "content" LIKE $2)');
      expect(result.sql).toContain('AND "status" IN ($3, $4))');
      expect(result.params).toEqual([
        '%search%',
        '%search%',
        'published',
        'featured',
      ]);
    });
  });

  describe('Nested paths (JSONB)', () => {
    it('should handle nested JSONB path access', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['metadata.author.name', '=', 'John']],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('"metadata"->\'author\'->>\'name\' = $1');
      expect(result.params).toEqual(['John']);
    });
  });

  describe('Parameter indexing', () => {
    it('should correctly index parameters across multiple filters', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          ['status', '=', 'published'],
          ['views', '>', 100],
          ['author', '=', 'Alice'],
          ['category', 'in', new Set(['tech', 'science'])],
        ],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('$1');
      expect(result.sql).toContain('$2');
      expect(result.sql).toContain('$3');
      expect(result.sql).toContain('$4');
      expect(result.sql).toContain('$5');
      expect(result.params).toEqual([
        'published',
        100,
        'Alice',
        'tech',
        'science',
      ]);
    });

    it('should reset parameter counter for each query', () => {
      const planner = new SQLQueryPlanner();

      const query1: PreparedQuery = {
        collectionName: 'posts',
        where: [['status', '=', 'published']],
      };

      const result1 = planner.planSelect(query1);
      expect(result1.sql).toContain('$1');
      expect(result1.params).toEqual(['published']);

      const query2: PreparedQuery = {
        collectionName: 'users',
        where: [['role', '=', 'admin']],
      };

      const result2 = planner.planSelect(query2);
      expect(result2.sql).toContain('$1'); // Should start from $1 again
      expect(result2.params).toEqual(['admin']);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty where array', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [],
      };

      const result = planner.planSelect(query);

      expect(result.sql).not.toContain('WHERE');
      expect(result.params).toEqual([]);
    });

    it('should handle query with only LIMIT', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        limit: 10,
      };

      const result = planner.planSelect(query);

      expect(result.sql).toBe('SELECT *\nFROM "posts"\nLIMIT 10');
      expect(result.params).toEqual([]);
    });

    it('should handle special characters in string values', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['title', '=', "It's a test with 'quotes'"]],
      };

      const result = planner.planSelect(query);

      // Parameters are passed separately, so no escaping needed in SQL
      expect(result.sql).toContain('WHERE "title" = $1');
      expect(result.params).toEqual(["It's a test with 'quotes'"]);
    });

    it('should handle null values', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['deletedAt', '=', null]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "deletedAt" = $1');
      expect(result.params).toEqual([null]);
    });

    it('should handle numeric values', () => {
      const planner = new SQLQueryPlanner();
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [
          ['views', '=', 0],
          ['rating', '=', 4.5],
        ],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "views" = $1 AND "rating" = $2');
      expect(result.params).toEqual([0, 4.5]);
    });

    it('should handle Date values', () => {
      const planner = new SQLQueryPlanner();
      const date = new Date('2024-01-01T00:00:00Z');
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['createdAt', '>', date]],
      };

      const result = planner.planSelect(query);

      expect(result.sql).toContain('WHERE "createdAt" > $1');
      expect(result.params).toEqual([date]);
    });
  });

  describe('Debug mode', () => {
    it('should log queries when debug is enabled', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const planner = new SQLQueryPlanner({ debug: true });
      const query: PreparedQuery = {
        collectionName: 'posts',
        where: [['status', '=', 'published']],
      };

      planner.planSelect(query);

      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });
});
