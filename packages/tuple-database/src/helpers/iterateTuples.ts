import { WriteOps } from "../storage/types"

export function* iterateWrittenTuples(write: WriteOps) {
	for (const { key } of write.set || []) {
		yield key
	}
	for (const tuple of write.remove || []) {
		yield tuple
	}
}

export function getWrittenTuples(write: WriteOps) {
	return Array.from(iterateWrittenTuples(write))
}
