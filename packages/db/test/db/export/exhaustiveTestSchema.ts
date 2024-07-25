import type { ClientSchema } from '../../../../client/src/client/types/query.ts';
import { Schema as S } from '../../../src/schema/builder.ts';

export const schema = {
  plain: {
    schema: S.Schema({
      id: S.Id(),
      boolean: S.Boolean(),
      string: S.String(),
      number: S.Number(),
      date: S.Date(),
      set_string: S.Set(S.String()),
      set_number: S.Set(S.Number()),
      set_boolean: S.Set(S.Boolean()),
      set_date: S.Set(S.Date()),

      object: S.Record({
        id: S.Id(),
        boolean: S.Boolean(),
        string: S.String(),
        number: S.Number(),
        date: S.Date(),
        set_string: S.Set(S.String()),
        set_number: S.Set(S.Number()),
        set_boolean: S.Set(S.Boolean()),
        set_date: S.Set(S.Date()),
      }),
    }),
  },

  nullalbe: {
    schema: S.Schema({
      id: S.Id(),
      boolean: S.Boolean({ nullable: true }),
      string: S.String({ nullable: true }),
      number: S.Number({ nullable: true }),
      date: S.Date({ nullable: true }),
      set_string: S.Set(S.String(), { nullable: true }),
      set_number: S.Set(S.Number(), { nullable: true }),
      set_boolean: S.Set(S.Boolean(), { nullable: true }),
      set_date: S.Set(S.Date(), { nullable: true }),

      object: S.Record({
        id: S.Id(),
        boolean: S.Boolean({ nullable: true }),
        string: S.String({ nullable: true }),
        number: S.Number({ nullable: true }),
        date: S.Date({ nullable: true }),
        set_string: S.Set(S.String(), { nullable: true }),
        set_number: S.Set(S.Number(), { nullable: true }),
        set_boolean: S.Set(S.Boolean(), { nullable: true }),
        set_date: S.Set(S.Date(), { nullable: true }),
      }),
    }),
  },

  defaults: {
    schema: S.Schema({
      id: S.Id(),
      boolean: S.Boolean({ default: false }),
      string: S.String({ default: 'a string' }),

      stringEnum: S.String({ default: 'a', enum: ['a', 'b', 'c'] as const }),
      stringEnumOptional: S.Optional(
        S.String({ enum: ['a', 'b', 'c'] as const })
      ),

      number: S.Number({ default: 1 }),
      date: S.Date({ default: S.Default.now() }),

      set_string: S.Set(S.String({ default: '1' })),
      set_number: S.Set(S.Number({ default: 1 })),
      set_boolean: S.Set(S.Boolean({ default: false })),
      set_date: S.Set(S.Date({ default: S.Default.now() })),
      set_stringEnum: S.Set(
        S.String({ default: 'a', enum: ['a', 'b', 'c'] as const })
      ),

      object: S.Record({
        id: S.Id(),
        boolean: S.Boolean({ default: false }),
        string: S.String({ default: 'a string' }),
        number: S.Number({ default: 1 }),
        date: S.Date({ default: S.Default.now() }),

        set_number: S.Set(S.Number({ default: 1 })),
        set_boolean: S.Set(S.Boolean({ default: false })),
        set_date: S.Set(S.Date({ default: S.Default.now() })),
        set_string: S.Set(S.String({ default: '1' })),
        set_stringEnum: S.Set(
          S.String({ default: 'a', enum: ['a', 'b', 'c'] as const })
        ),
      }),
    }),
  },

  optional: {
    schema: S.Schema({
      id: S.Optional(S.Id()),
      boolean: S.Optional(S.Boolean()),
      string: S.Optional(S.String()),
      number: S.Optional(S.Number()),
      date: S.Optional(S.Date()),
      set_string: S.Optional(S.Set(S.String())),
      set_number: S.Optional(S.Set(S.Number())),
      set_boolean: S.Optional(S.Set(S.Boolean())),
      set_date: S.Optional(S.Set(S.Date())),

      object: S.Record({
        id: S.Optional(S.Id()),
        boolean: S.Optional(S.Boolean()),
        string: S.Optional(S.String()),
        number: S.Optional(S.Number()),
        date: S.Optional(S.Date()),
        set_string: S.Optional(S.Set(S.String())),
        set_number: S.Optional(S.Set(S.Number())),
        set_boolean: S.Optional(S.Set(S.Boolean())),
        set_date: S.Optional(S.Set(S.Date())),
      }),
    }),
  },

  objectWrappedWithOptional: {
    schema: S.Schema({
      id: S.Id(),

      object: S.Record({
        id: S.Optional(S.Id()),
        boolean: S.Optional(S.Boolean()),
        string: S.Optional(S.String()),
        number: S.Optional(S.Number()),
        date: S.Optional(S.Date()),
        set_string: S.Optional(S.Set(S.String())),
        set_number: S.Optional(S.Set(S.Number())),
        set_boolean: S.Optional(S.Set(S.Boolean())),
        set_date: S.Optional(S.Set(S.Date())),

        sub_object: S.Record({
          id: S.Optional(S.Id()),
          boolean: S.Optional(S.Boolean()),
          string: S.Optional(S.String()),
          number: S.Optional(S.Number()),
          date: S.Optional(S.Date()),
          set_string: S.Optional(S.Set(S.String())),
          set_number: S.Optional(S.Set(S.Number())),
          set_boolean: S.Optional(S.Set(S.Boolean())),
          set_date: S.Optional(S.Set(S.Date())),
        }),
      }),
    }),
  },

  plainWithEnum: {
    schema: S.Schema({
      id: S.Id(),
      boolean: S.Boolean(),
      string: S.String(),

      stringEnum: S.String({ enum: ['a', 'b', 'c'] as const }),
      stringEnumOptional: S.Optional(
        S.String({ enum: ['a', 'b', 'c'] as const })
      ),

      number: S.Number(),
      date: S.Date(),
      set_string: S.Set(S.String()),
      set_stringEnum: S.Set(S.String({ enum: ['a', 'b', 'c'] as const })),
      set_number: S.Set(S.Number()),
      set_boolean: S.Set(S.Boolean()),
      set_date: S.Set(S.Date()),
    }),
  },

  objectWrappedWithOptionalAndEnums: {
    schema: S.Schema({
      id: S.Id(),

      object: S.Record({
        id: S.Optional(S.Id()),
        boolean: S.Optional(S.Boolean()),

        string: S.Optional(S.String()),
        stringEnum: S.String({ enum: ['a', 'b', 'c'] as const }),
        stringEnumOptional: S.Optional(
          S.String({ enum: ['a', 'b', 'c'] as const })
        ),

        number: S.Optional(S.Number()),
        date: S.Optional(S.Date()),
        set_string: S.Optional(S.Set(S.String())),
        set_number: S.Optional(S.Set(S.Number())),
        set_boolean: S.Optional(S.Set(S.Boolean())),
        set_date: S.Optional(S.Set(S.Date())),
        set_stringEnum: S.Set(
          S.String({ default: 'a', enum: ['a', 'b', 'c'] as const })
        ),

        sub_object: S.Record({
          id: S.Optional(S.Id()),
          boolean: S.Optional(S.Boolean()),

          string: S.Optional(S.String()),
          stringEnum: S.String({ enum: ['a', 'b', 'c'] as const }),
          stringEnumOptional: S.Optional(
            S.String({ enum: ['a', 'b', 'c'] as const })
          ),

          number: S.Optional(S.Number()),
          date: S.Optional(S.Date()),
          set_string: S.Optional(S.Set(S.String())),
          set_stringEnum: S.Set(
            S.String({ default: 'a', enum: ['a', 'b', 'c'] as const })
          ),
          set_number: S.Optional(S.Set(S.Number())),
          set_boolean: S.Optional(S.Set(S.Boolean())),
          set_date: S.Optional(S.Set(S.Date())),
        }),
      }),
    }),
  },

  relations: {
    schema: S.Schema({
      id: S.Id(),
      boolean: S.Boolean(),
      string: S.String(),
      number: S.Number(),
      date: S.Date(),
      set_string: S.Set(S.String()),
      set_number: S.Set(S.Number()),
      set_boolean: S.Set(S.Boolean()),
      set_date: S.Set(S.Date()),

      relationById: S.RelationById('relationTarget', '$id'),
      relationMany: S.RelationMany('relationTarget', {
        where: [['id', '=', '$id']],
      }),
      relationOne: S.RelationOne('relationTarget', {
        where: [['id', '=', '$id']],
      }),

      object: S.Record({
        id: S.Id(),
        boolean: S.Boolean(),
        string: S.String(),
        number: S.Number(),
        date: S.Date(),
        set_string: S.Set(S.String()),
        set_number: S.Set(S.Number()),
        set_boolean: S.Set(S.Boolean()),
        set_date: S.Set(S.Date()),

        relationById: S.RelationById('relationTarget', '$id'),
        relationMany: S.RelationMany('relationTarget', {
          where: [['id', '=', '$id']],
        }),
        relationOne: S.RelationOne('relationTarget', {
          where: [['id', '=', '$id']],
        }),
      }),
    }),
  },

  relationTarget: {
    schema: S.Schema({
      id: S.Id(),
    }),
  },
} satisfies ClientSchema;
