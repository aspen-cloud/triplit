import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import prompts from 'prompts';
import { yellow, blue, cyan, red, green } from 'ansis/colors';
import degit from 'degit';
import { spawn } from 'child_process';

const DEFAULT_TARGET_DIRECTORY = 'triplit-app';

type CreateTriplitAppArgs = {
  template?: string;
  t?: string;
  framework?: string;
  f?: string;
};
const argv = minimist<CreateTriplitAppArgs>(process.argv.slice(2));

type ColorFunc = (str: string) => string;
type Framework = {
  name: string;
  display: string;
  color: ColorFunc;
  variants: FrameworkVariant[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
type FrameworkVariant = {
  name: string;
  display: string;
  color: ColorFunc;
  customCommand?: string;
};

const FRAMEWORKS: Framework[] = [
  {
    name: 'vanilla',
    display: 'Vanilla',
    color: yellow,
    variants: [],
  },
  {
    name: 'react',
    display: 'React',
    color: cyan,
    variants: [],
    dependencies: {
      '@triplit/react': 'latest',
    },
  },
  {
    name: 'svelte',
    display: 'Svelte',
    color: red,
    variants: [],
    dependencies: {
      '@triplit/svelte': 'latest',
    },
  },
];

const TEMPLATES = ['chat'];

function getViteCreateArgs(
  pkgManager: string,
  pkgName: string,
  framework: string
) {
  const vite = pkgManager === 'npm' ? 'vite@latest' : 'vite';
  const template = getViteTemplateForFramework(framework);
  const createArgs = ['create', vite, pkgName, '--template', template];
  if (pkgManager === 'npm') createArgs.splice(3, 0, '--');
  return createArgs;
}

function getViteTemplateForFramework(framework: string) {
  switch (framework) {
    case 'react':
      return 'react-ts';
    case 'svelte':
      return 'svelte-ts';
    case 'vanilla':
      return 'vanilla-ts';
    default:
      throw new Error(`Invalid framework: ${framework}`);
  }
}

async function createTriplitAppWithVite() {
  const argTargetDir = argv._[0]
    ? formatTargetDir(argv._[0])!
    : DEFAULT_TARGET_DIRECTORY;
  let targetDir =
    argTargetDir === '.' ? path.basename(path.resolve()) : argTargetDir;
  const pkgName = targetDir;

  // Check for template
  const argTemplate = argv.template || argv.t;
  let template = argTemplate;

  // If invalid template, show choices
  if (argTemplate && !TEMPLATES.includes(argTemplate)) {
    let templateChoice: prompts.Answers<'template'>;
    try {
      templateChoice = await prompts(
        [
          {
            type: 'select',
            name: 'template',
            message:
              'Invalid template specified. Please select a template or select "None" scaffold an empty project:',
            initial: 0,
            choices: [
              {
                title: 'None',
                value: null,
              },
              {
                title: 'Chat',
                value: 'chat',
              },
            ],
          },
        ],
        {
          onCancel: () => {
            throw new Error(red('✖') + ' Operation cancelled');
          },
        }
      );
      template = templateChoice.template;
    } catch (cancelled: any) {
      console.log(cancelled.message);
      return;
    }
  }

  if (template) {
    console.log('Loading template: ' + template);
    const root = path.join(process.cwd(), targetDir);
    createDirIfNotExists(root);
    await loadTemplate(template, root);
    return;
  }

  const argFramework = argv.framework || argv.f;
  let framework: Framework;
  // If invalid framework, show choices
  if (!argFramework || !FRAMEWORKS.map((f) => f.name).includes(argFramework)) {
    let frameworkChoice: prompts.Answers<'framework'>;
    try {
      frameworkChoice = await prompts(
        [
          {
            type: () => 'select',
            name: 'framework',
            message: 'Select a framework:',
            initial: 0,
            choices: FRAMEWORKS.map((framework) => {
              const frameworkColor = framework.color;
              return {
                title: frameworkColor(framework.display || framework.name),
                value: framework,
              };
            }),
          },
        ],
        {
          onCancel: () => {
            throw new Error(red('✖') + ' Operation cancelled');
          },
        }
      );
      framework = frameworkChoice.framework;
    } catch (cancelled: any) {
      console.log(cancelled.message);
      return;
    }
  } else {
    framework = FRAMEWORKS.find((f) => f.name === argFramework)!;
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm';
  const createArgs = getViteCreateArgs(
    pkgManager,
    argTargetDir,
    framework.name
  );

  // Init vite project
  const viteScaffold = new Promise<void>((resolve, reject) => {
    const child = spawn(pkgManager, createArgs, {
      stdio: [process.stdin, process.stdout, process.stderr],
      shell: true,
    })!;
    child.on('error', (err) => {
      console.error(err);
      reject();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject();
      } else {
        resolve();
      }
    });
  });
  await viteScaffold;

  // Edit package.json to add triplit deps
  const root = path.join(process.cwd(), pkgName);
  const pkgJsonPath = path.join(root, 'package.json');
  const hasPackageJson = fs.existsSync(pkgJsonPath);
  if (!hasPackageJson) {
    console.log('Error: package.json not found');
    return;
  }
  let pkgJson: any;
  pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  pkgJson = addToPackageJson(
    pkgJson,
    {
      '@triplit/client': 'latest',
    },
    {
      '@triplit/cli': 'latest',
    }
  );
  if (framework.dependencies || framework.devDependencies) {
    pkgJson = addToPackageJson(
      pkgJson,
      framework.dependencies,
      framework.devDependencies
    );
  }
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
  createEnvFile(root, DEFAULT_VARIABLES);
  // Add Triplit specific files
  const triplitDir = path.join(root, 'triplit');
  createDirIfNotExists(triplitDir);
  copy(
    path.resolve(fileURLToPath(import.meta.url), '../../files/schema.ts'),
    path.join(triplitDir, 'schema.ts')
  );
}

async function loadTemplate(template: string, targetDir: string) {
  // TODO: put templates info into a json obj
  // TOOD: handle renaming based on package name
  if (!isEmpty(targetDir))
    throw new Error(
      `Target directory ${targetDir} must be empty to load template`
    );
  if (template === 'chat') {
    await degit('aspen-cloud/triplit/templates/chat-template').clone(targetDir);
    console.log(`Created project with chat template at ${targetDir}`);
    return;
  } else {
    console.log('Invalid template specified.');
    return;
  }
}

const DEFAULT_VARIABLES = {
  TRIPLIT_DB_URL: '',
  TRIPLIT_SERVICE_TOKEN: '',
  TRIPLIT_ANON_TOKEN: '',
  VITE_TRIPLIT_SERVER_URL: '$TRIPLIT_SERVER_URL',
  VITE_TRIPLIT_TOKEN: '$TRIPLIT_ANON_TOKEN',
};

function createEnvFile(targetDir: string, env: Record<string, string>) {
  const envPath = path.join(targetDir, '.env');
  const envContent = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(envPath, envContent);
}

function pkgFromUserAgent(userAgent: string | undefined) {
  if (!userAgent) return undefined;
  const pkgSpec = userAgent.split(' ')[0];
  const pkgSpecArr = pkgSpec.split('/');
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  };
}

function formatTargetDir(targetDir: string | undefined) {
  return targetDir?.trim().replace(/\/+$/g, '');
}

function isEmpty(path: string) {
  const files = fs.readdirSync(path);
  return files.length === 0 || (files.length === 1 && files[0] === '.git');
}

function addToPackageJson(
  pkgJson: any,
  packages: Record<string, string> | undefined,
  devPackages: Record<string, string> | undefined
) {
  if (packages) {
    if (!pkgJson.dependencies) pkgJson.dependencies = {};
    Object.keys(packages).forEach((key) => {
      pkgJson.dependencies[key] = packages[key];
    });
  }
  if (devPackages) {
    if (!pkgJson.devDependencies) pkgJson.devDependencies = {};
    Object.keys(devPackages).forEach((key) => {
      pkgJson.devDependencies[key] = devPackages[key];
    });
  }
  return pkgJson;
}

function createDirIfNotExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

createTriplitAppWithVite().catch((e) => {
  console.error(e);
  process.exit(1);
});
