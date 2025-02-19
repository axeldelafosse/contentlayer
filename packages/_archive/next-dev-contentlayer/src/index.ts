#!/usr/bin/env node

import { Builtins, Cli } from 'clipanion'

import { DefaultCommand } from './DefaultCommand.js'

export const run = () => {
  const [node, app, ...args] = process.argv

  const cli = new Cli({
    binaryLabel: `next dev with Contentlayer`,
    binaryName: `${node} ${app}`,
    binaryVersion: `1.0.1`,
  })

  cli.register(DefaultCommand)
  cli.register(Builtins.HelpCommand)
  cli.register(Builtins.VersionCommand)
  cli.runExit(args, Cli.defaultContext)
}

run()
