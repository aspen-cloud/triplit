import { LRUCacheWithDelete } from 'mnemonist';
import { Entity } from '../../entity.js';

export type EntityCache = LRUCacheWithDelete<string, Entity>;
export type EntityCacheOptions = { capacity: number };
