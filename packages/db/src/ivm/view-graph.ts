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
  HashedViewMap,
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

type ViewGraph = Map<number, ViewNode>;

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
  graph: ViewGraph
) {
  if (query.where) {
    for (const filter of filterStatementIteratorFlat(query.where)) {
      if (isFilterStatement(filter) && statementHasViewReference(filter)) {
        const viewId = Number(filter[2].split('.')[0].split('_')[1]);
        if (graph.has(viewId)) {
          parentNode.dependsOn.set(filter[2] as string, graph.get(viewId)!);
          graph.get(viewId)!.usedBy.add(parentNode);
        }
      }
    }
  }
  if (query.include) {
    for (const key in query.include) {
      const subquery = query.include[key].subquery;
      linkNodes(parentNode, subquery, graph);
    }
  }
  // TODO: add order clause linking?
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
  viewGraph: ViewGraph
): Set<number> {
  const nodesToRemove = unlinkNodesAndMarkForRemoval(node);
  for (const nodeId of nodesToRemove) {
    viewGraph.delete(nodeId);
  }
  return nodesToRemove;
}

export function addQueryToViewGraph(
  query: PreparedQuery,
  viewGraph: ViewGraph
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
    rootNode = createQueryNode(rewrittenQuery);
    viewGraph.set(rootNode.id, rootNode);
    addViewsToViewGraph(views, viewGraph);
    linkNodes(rootNode, rewrittenQuery, viewGraph);
  } else {
    rootNode = createQueryNode(query);
    viewGraph.set(rootNode.id, rootNode);
  }

  return rootNode;
}

export function addViewsToViewGraph(
  views: HashedViewMap,
  viewGraph: ViewGraph
) {
  const newNodes: ViewNode[] = [];
  for (const [viewHash, viewQuery] of views.entries()) {
    if (viewGraph.has(viewHash)) {
      continue;
    }
    const viewNode = createQueryNode(viewQuery);
    viewGraph.set(viewHash, viewNode);
    newNodes.push(viewNode);
  }
  for (const node of newNodes) {
    linkNodes(node, node.query, viewGraph);
  }
  return viewGraph;
}

export function prettyPrintViewGraph(viewGraph: ViewGraph): string {
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
