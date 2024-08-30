import { WriteOps } from "../storage/types.js"

export function isEmptyWrites(writes: WriteOps) {
	if (writes.remove?.length) return false
	if (writes.set?.length) return false
	return true
}
