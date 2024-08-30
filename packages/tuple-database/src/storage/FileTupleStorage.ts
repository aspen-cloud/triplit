import * as fs from "fs-extra"
import * as path from "path"
import { InMemoryTupleStorage } from "./InMemoryTupleStorage.js"
import { KeyValuePair, WriteOps } from "./types.js"

export function parseFile(str: string): KeyValuePair[] {
	if (str === "") {
		return []
	}
	return str.split("\n").map((line) => {
		const pair = JSON.parse(line)
		// Backward compatibility with [key, value].
		if (Array.isArray(pair)) {
			const [key, value] = pair
			return { key, value }
		}
		return pair
	})
}

function serializeFile(data: KeyValuePair[]) {
	return data.map((pair) => JSON.stringify(pair)).join("\n")
}

export class FileTupleStorage extends InMemoryTupleStorage {
	cache: FileCache

	// This is pretty bonkers: https://github.com/Microsoft/TypeScript/issues/8277
	// @ts-ignore
	constructor(public dbPath: string) {
		const cache = new FileCache(dbPath)
		super(cache.get())
		this.cache = cache
	}

	commit(writes: WriteOps) {
		super.commit(writes)
		this.cache.set(this.data)
	}
}

class FileCache {
	constructor(private dbPath: string) {}

	private getFilePath() {
		return this.dbPath + ".txt"
	}

	get() {
		// Check that the file exists.
		const filePath = this.getFilePath()
		try {
			const stat = fs.statSync(filePath)
			if (!stat.isFile()) {
				throw new Error("Database is not a file.")
			}
		} catch (error) {
			if (
				//@ts-expect-error
				error.code === "ENOENT"
			) {
				// File does not exist.
				return []
			}
			throw error
		}

		const fileContents = fs.readFileSync(filePath, "utf8")
		const data = parseFile(fileContents)
		return data
	}

	// TODO: throttle this call if it makes sense.
	set(data: KeyValuePair[]) {
		const filePath = this.getFilePath()
		const fileContents = serializeFile(data)
		fs.mkdirpSync(path.dirname(this.dbPath))
		fs.writeFileSync(filePath, fileContents, "utf8")
	}
}
