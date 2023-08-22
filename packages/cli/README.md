oclif-hello-world
=================

oclif example Hello World CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![CircleCI](https://circleci.com/gh/oclif/hello-world/tree/main.svg?style=shield)](https://circleci.com/gh/oclif/hello-world/tree/main)
[![GitHub license](https://img.shields.io/github/license/oclif/hello-world)](https://github.com/oclif/hello-world/blob/main/LICENSE)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g @triplit/cli
$ triplit COMMAND
running command...
$ triplit (--version)
@triplit/cli/0.0.0 darwin-arm64 node-v16.13.0
$ triplit --help [COMMAND]
USAGE
  $ triplit COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`triplit hello PERSON`](#triplit-hello-person)
* [`triplit hello world`](#triplit-hello-world)
* [`triplit help [COMMANDS]`](#triplit-help-commands)
* [`triplit plugins`](#triplit-plugins)
* [`triplit plugins:install PLUGIN...`](#triplit-pluginsinstall-plugin)
* [`triplit plugins:inspect PLUGIN...`](#triplit-pluginsinspect-plugin)
* [`triplit plugins:install PLUGIN...`](#triplit-pluginsinstall-plugin-1)
* [`triplit plugins:link PLUGIN`](#triplit-pluginslink-plugin)
* [`triplit plugins:uninstall PLUGIN...`](#triplit-pluginsuninstall-plugin)
* [`triplit plugins:uninstall PLUGIN...`](#triplit-pluginsuninstall-plugin-1)
* [`triplit plugins:uninstall PLUGIN...`](#triplit-pluginsuninstall-plugin-2)
* [`triplit plugins update`](#triplit-plugins-update)

## `triplit hello PERSON`

Say hello

```
USAGE
  $ triplit hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ oex hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [dist/commands/hello/index.ts](https://github.com/aspen-cloud/triplit/blob/v0.0.0/dist/commands/hello/index.ts)_

## `triplit hello world`

Say hello world

```
USAGE
  $ triplit hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ triplit hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [dist/commands/hello/world.ts](https://github.com/aspen-cloud/triplit/blob/v0.0.0/dist/commands/hello/world.ts)_

## `triplit help [COMMANDS]`

Display help for triplit.

```
USAGE
  $ triplit help [COMMANDS] [-n]

ARGUMENTS
  COMMANDS  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for triplit.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.2.17/src/commands/help.ts)_

## `triplit plugins`

List installed plugins.

```
USAGE
  $ triplit plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ triplit plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.2.6/src/commands/plugins/index.ts)_

## `triplit plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ triplit plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.


ALIASES
  $ triplit plugins add

EXAMPLES
  $ triplit plugins:install myplugin 

  $ triplit plugins:install https://github.com/someuser/someplugin

  $ triplit plugins:install someuser/someplugin
```

## `triplit plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ triplit plugins:inspect PLUGIN...

ARGUMENTS
  PLUGIN  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ triplit plugins:inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.2.6/src/commands/plugins/inspect.ts)_

## `triplit plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ triplit plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.
  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.


ALIASES
  $ triplit plugins add

EXAMPLES
  $ triplit plugins:install myplugin 

  $ triplit plugins:install https://github.com/someuser/someplugin

  $ triplit plugins:install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.2.6/src/commands/plugins/install.ts)_

## `triplit plugins:link PLUGIN`

Links a plugin into the CLI for development.

```
USAGE
  $ triplit plugins:link PLUGIN

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ triplit plugins:link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.2.6/src/commands/plugins/link.ts)_

## `triplit plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ triplit plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ triplit plugins unlink
  $ triplit plugins remove
```

## `triplit plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ triplit plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ triplit plugins unlink
  $ triplit plugins remove
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.2.6/src/commands/plugins/uninstall.ts)_

## `triplit plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ triplit plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ triplit plugins unlink
  $ triplit plugins remove
```

## `triplit plugins update`

Update installed plugins.

```
USAGE
  $ triplit plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v3.2.6/src/commands/plugins/update.ts)_
<!-- commandsstop -->
