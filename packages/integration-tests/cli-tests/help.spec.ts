import { $ } from 'execa';
import { it, expect, beforeEach, describe } from 'vitest';
import path from 'path';

const projectPath = path.join(__dirname, 'project');

const $shell = $({ cwd: projectPath, reject: true });

it('should print help', async () => {
  expect((await $shell`yarn triplit --help`).exitCode).toBe(0);
});
