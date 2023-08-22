import {expect, test} from '@oclif/test'

describe('migrate:up', () => {
  test
  .stdout()
  .command(['migrate:up'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['migrate:up', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
