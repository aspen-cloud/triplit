import {expect, test} from '@oclif/test'

describe('migrate:status', () => {
  test
  .stdout()
  .command(['migrate:status'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['migrate:status', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
