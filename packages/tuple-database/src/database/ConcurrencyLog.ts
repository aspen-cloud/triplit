import { mutableFilter } from "../helpers/mutableFilter"
import { outdent } from "../helpers/outdent"
import { Bounds, isTupleWithinBounds } from "../helpers/sortedTupleArray"
import { Tuple } from "../storage/types"
import { TxId } from "./types"

type ReadItem = { type: "read"; bounds: Bounds; txId: TxId }
type WriteItem = { type: "write"; tuple: Tuple; txId: TxId | undefined }

type LogItem = ReadItem | WriteItem

export class ReadWriteConflictError extends Error {
	constructor(txId: string | undefined, writeTuple: Tuple, readBounds: Bounds) {
		const message = outdent(`
      ReadWriteConflictError: ${txId}
      Write to tuple ${writeTuple}
      conflicted with a read at the bounds ${JSON.stringify(readBounds)}
    `)

		super(message)
	}
}

export class ConcurrencyLog {
	// O(n) refers to this.log.length
	log: LogItem[] = []

	// O(1)
	/** Record a read. */
	read(txId: TxId, bounds: Bounds) {
		this.log.push({ type: "read", txId, bounds })
	}

	// O(n)
	/** Add writes to the log only if there is a conflict with a read. */
	write(txId: TxId | undefined, tuple: Tuple) {
		for (const item of this.log) {
			if (item.type === "read" && isTupleWithinBounds(tuple, item.bounds)) {
				this.log.push({ type: "write", tuple, txId })
				break
			}
		}
	}

	// O(n^2/4)
	/** Determine if any reads conflict with writes. */
	commit(txId: TxId) {
		try {
			const reads: Bounds[] = []
			for (const item of this.log) {
				if (item.type === "read") {
					if (item.txId === txId) {
						reads.push(item.bounds)
					}
				} else if (item.type === "write") {
					for (const read of reads) {
						if (isTupleWithinBounds(item.tuple, read)) {
							throw new ReadWriteConflictError(item.txId, item.tuple, read)
						}
					}
				}
			}
		} finally {
			this.cleanupReads(txId)
			this.cleanupWrites()
		}
	}

	cancel(txId: TxId) {
		this.cleanupReads(txId)
		this.cleanupWrites()
	}

	// O(n)
	/** Cleanup any reads for this transaction. */
	cleanupReads(txId: string) {
		mutableFilter(this.log, (item) => {
			const txRead = item.txId === txId && item.type === "read"
			return !txRead
		})
	}

	// O(n)
	/** Cleanup any writes that don't have conflicting reads. */
	cleanupWrites() {
		const reads: Bounds[] = []
		mutableFilter(this.log, (item) => {
			if (item.type === "read") {
				reads.push(item.bounds)
				return true
			} else {
				for (const read of reads) {
					if (isTupleWithinBounds(item.tuple, read)) {
						return true
					}
				}
				return false
			}
		})
	}
}
