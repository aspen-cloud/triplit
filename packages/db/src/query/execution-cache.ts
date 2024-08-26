import { TriplitError } from '../errors.js';
import { Entity } from '../entity.js';

export type DataCacheEntry = {
  entity: Entity;
};

export type QueryComponentCacheEntry = {
  entityId: string;
  relationships: {
    [alias: string]: string | string[];
  };
};

/**
 * Store for caching entities and components while executing a query
 *
 * `data` is a map of entity ID to the data for that entity
 * `components` is a map of component ID to the data for that component
 *
 * A component is any subquery that is executed as part of a query. A component has an entityId and relationships to other components, which are like nodes and .
 */
export class QueryExecutionCache {
  /**
   * While executing a query, we will cache the entities we have loaded
   */
  private data: Map<string, DataCacheEntry> = new Map();

  /**
   * While executing a query, we will store "components" of a query, which are usually subqueries
   */
  private components: Map<string, QueryComponentCacheEntry> = new Map();

  getData(entityId: string) {
    const data = this.data.get(entityId);
    if (!data)
      throw new TriplitError(
        `An entity with id '${entityId}' has not been loaded into execuction cache`
      );
    return data;
  }

  setData(entityId: string, entry: DataCacheEntry) {
    this.data.set(entityId, entry);
  }

  hasData(entityId: string) {
    return this.data.has(entityId);
  }

  getComponent(componentId: string) {
    const component = this.components.get(componentId);
    if (!component)
      throw new TriplitError(
        `A component with id '${componentId}' has not been loaded into execuction cache`
      );
    return component;
  }

  setComponent(componentId: string, entry: QueryComponentCacheEntry) {
    this.components.set(componentId, entry);
  }

  hasComponent(componentId: string) {
    return this.components.has(componentId);
  }

  getComponentData(componentId: string) {
    const component = this.getComponent(componentId);
    return this.getData(component.entityId);
  }

  /**
   * Given a component ID and a path, return the value at that path starting from that component
   */
  getComponentValueAtPath(
    componentId: string,
    path: string[]
  ): any | undefined {
    let entity = undefined;
    for (const key of path) {
      //   if (!this.hasComponent(componentId)) {
      //     throw new TriplitError("Could not resolve path, component doesn't exist");
      //   }
      if (!entity) {
        const componentData = this.getComponentData(componentId)?.entity;
        // if (!componentData) {
        //   throw new Error("Could not resolve path, entity doesn't exist");
        // }
        if (key in componentData.data) {
          entity = componentData.data[key];
        } else {
          const component = this.getComponent(componentId)!;
          if (key in component.relationships) {
            const relationshipKey = component.relationships[key];
            if (Array.isArray(relationshipKey)) {
              throw new TriplitError(
                `Unselectable path: cannot select into an 'many' relationship`
              );
            }
            componentId = relationshipKey;
          }
        }
      } else {
        // If we've resolved to an entity, just use that
        entity = entity[key];
      }
    }
    return entity;
  }

  /**
   * Given a component ID, build the data for that component and all of its relationships
   *
   * Return the entity ID and the resolved data
   */
  buildComponentData(componentId: string) {
    const component = this.getComponent(componentId);
    const entityData = this.getData(component.entityId);
    const resolved: Record<string, any> = {
      ...(entityData?.entity.data ?? {}),
    };
    for (const [key, value] of Object.entries(component.relationships)) {
      if (Array.isArray(value)) {
        resolved[key] = new Map(
          value.map((componentId) => this.buildComponentData(componentId))
        );
      } else {
        resolved[key] = this.buildComponentData(value)[1];
      }
    }
    return [component.entityId, resolved] as const;
  }

  static ComponentId(prefix: string[], entityId: string) {
    return [...prefix, entityId].join(QueryExecutionCache.KeySeparator);
  }

  static KeySeparator = '>';
}

export function entityIdFromComponentId(componentId: string) {
  return componentId.split(QueryExecutionCache.KeySeparator).at(-1)!;
}
