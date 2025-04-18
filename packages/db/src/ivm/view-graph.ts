import { filterStatementIteratorFlat, isFilterStatement } from '../filters.js';
import { ViewEntity } from '../index.js';
import {
  hasSubqueryFilterAtAnyLevel,
  hasSubqueryOrderAtAnyLevel,
  getReferencedRelationalVariables,
  getCollectionsReferencedInSubqueries,
} from './utils.js';
import {
  statementHasViewReference,
  extractInvertedViews,
} from '../query-planner/query-compiler.js';
import { hashPreparedQuery } from '../query/hash-query.js';
import { PreparedQuery } from '../types.js';

export interface ViewNode {
  id: number;
  usedBy: Set<ViewNode>;
  dependsOn: Map<string, ViewNode>;
  cachedBoundQuery: PreparedQuery | undefined;
  results?: ViewEntity[];
  query: PreparedQuery;
  shouldRefetch: boolean;
  hasChanged: boolean;
  collectionsReferencedInSubqueries: Map<number, Set<string>>;
  referencedRelationalVariables: Map<number, Set<string>>;
}

function createQueryNode(query: PreparedQuery): ViewNode {
  const hashId = hashPreparedQuery(query);
  return {
    id: hashId,
    usedBy: new Set(),
    dependsOn: new Map(),
    results: undefined,
    query,
    shouldRefetch:
      hasSubqueryFilterAtAnyLevel(query) || hasSubqueryOrderAtAnyLevel(query),
    hasChanged: false,
    cachedBoundQuery: undefined,
    referencedRelationalVariables: getReferencedRelationalVariables(query),
    collectionsReferencedInSubqueries:
      getCollectionsReferencedInSubqueries(query),
  };
}

function linkNodes(
  parentNode: ViewNode,
  query: PreparedQuery,
  lookup: Record<string, ViewNode>
) {
  if (query.where) {
    for (const filter of filterStatementIteratorFlat(query.where)) {
      if (isFilterStatement(filter) && statementHasViewReference(filter)) {
        const viewId = (filter[2] as string).split('.')[0].split('_')[1];
        if (lookup[viewId]) {
          parentNode.dependsOn.set(filter[2] as string, lookup[viewId]);
          lookup[viewId].usedBy.add(parentNode);
        }
      }
    }
  }
  if (query.include) {
    for (const key in query.include) {
      const subquery = query.include[key].subquery;
      linkNodes(parentNode, subquery, lookup);
    }
  }
}

function unlinkNodesAndMarkForRemoval(node: ViewNode): Set<number> {
  const nodesToRemove = new Set<number>();
  if (node.usedBy.size > 0) {
    return nodesToRemove;
  }
  nodesToRemove.add(node.id);
  for (const [key, dependency] of node.dependsOn.entries()) {
    dependency.usedBy.delete(node);
    const subNodesToRemove = unlinkNodesAndMarkForRemoval(dependency);
    for (const subNodeId of subNodesToRemove) {
      nodesToRemove.add(subNodeId);
    }
  }
  return nodesToRemove;
}

// it's "potentially" because the node may have dependents
export function potentiallyRemoveNodeSubtreeFromViewGraph(
  node: ViewNode,
  viewGraph: Map<number, ViewNode>
): Set<number> {
  const nodesToRemove = unlinkNodesAndMarkForRemoval(node);
  for (const nodeId of nodesToRemove) {
    viewGraph.delete(nodeId);
  }
  return nodesToRemove;
}

export function addQueryToViewGraph(
  query: PreparedQuery,
  viewGraph: Map<number, ViewNode>
): ViewNode {
  let rootNode = null;
  // try and setup multiple view nodes iff we have a subquery filter
  // that can be inverted
  const { views, rewrittenQuery } = extractInvertedViews(
    structuredClone(query)
  );
  if (
    !hasSubqueryFilterAtAnyLevel(rewrittenQuery) &&
    !hasSubqueryOrderAtAnyLevel(rewrittenQuery)
  ) {
    const viewIdMappings = new Map<string, number>();
    rootNode = createQueryNode(rewrittenQuery);
    // TODO: cleanup iding
    // we should only be hashing the query after we've hashed
    // any of its dependents and then replaced the `view_n`
    // references with the hash
    const viewNodes: Record<string, ViewNode> = {};

    for (const viewId in views) {
      const viewHash = hashPreparedQuery(views[viewId]);
      viewIdMappings.set(viewId, viewHash);
      // we may be able to use the same view node for multiple queries
      if (viewGraph.has(viewHash)) {
        viewNodes[viewId] = viewGraph.get(viewHash)!;
        continue;
      }
      viewNodes[viewId] = createQueryNode(views[viewId]);
      viewGraph.set(viewHash, viewNodes[viewId]);
    }

    linkNodes(rootNode, rewrittenQuery, viewNodes);
    for (const viewId in viewNodes) {
      const viewNode = viewNodes[viewId];
      linkNodes(viewNode, viewNode.query, viewNodes);
    }
  } else {
    rootNode = createQueryNode(query);
  }
  viewGraph.set(rootNode.id, rootNode);

  return rootNode;
}

export function prettyPrintViewGraph(viewGraph: Map<number, ViewNode>): string {
  const result: string[] = [];

  for (const [id, node] of viewGraph.entries()) {
    result.push(`Node ID (Hash): ${id}`);
    result.push(`  Query: ${JSON.stringify(node.query, null, 2)}`);
    result.push(`  Depends On:`);
    if (node.dependsOn.size > 0) {
      for (const [key, dependency] of node.dependsOn.entries()) {
        result.push(`    - ${key} (Hash: ${dependency.id})`);
      }
    } else {
      result.push(`    - None`);
    }
    result.push(`  Used By:`);
    if (node.usedBy.size > 0) {
      for (const dependent of node.usedBy) {
        result.push(`    - Node ID (Hash): ${dependent.id}`);
      }
    } else {
      result.push(`    - None`);
    }
    result.push(``);
  }

  return result.join('\n');
}
