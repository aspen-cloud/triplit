import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';
import prompts from 'prompts';
import { yellow, blue, cyan, red } from 'ansis/colors';
import degit from 'degit';

const DEFAULT_TARGET_DIRECTORY = 'triplit-app';

type CreateTriplitAppArgs = {
  template?: string;
  t?: string;
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
      '@triplit/react': '^0.3.1',
      react: '^17.0.2',
      'react-dom': '^17.0.2',
    },
  },
];

const TEMPLATES = ['chat'];

async function createTriplitApp() {
  console.log('Creating Triplit app...');
  const argTargetDir = formatTargetDir(argv._[0]);
  const argTemplate = argv.template || argv.t;
  let targetDir = argTargetDir || DEFAULT_TARGET_DIRECTORY;
  const getProjectName = () =>
    targetDir === '.' ? path.basename(path.resolve()) : targetDir;

  let projectInfo: prompts.Answers<'projectName' | 'packageName' | 'overwrite'>;
  try {
    projectInfo = await prompts(
      [
        {
          type: argTargetDir ? null : 'text',
          name: 'projectName',
          message: 'Project name:',
          initial: DEFAULT_TARGET_DIRECTORY,
          onState: (state) => {
            targetDir =
              formatTargetDir(state.value) || DEFAULT_TARGET_DIRECTORY;
          },
        },
        {
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'select',
          name: 'overwrite',
          message: () =>
            (targetDir === '.'
              ? 'Current directory'
              : `Target directory "${targetDir}"`) +
            ` is not empty. Please choose how to proceed:`,
          initial: 0,
          choices: [
            {
              title: 'Attempt to edit content of existing files and continue',
              value: 'yes',
            },
            {
              title: 'Cancel operation',
              value: 'no',
            },
          ],
        },
        {
          type: (_, { overwrite }: { overwrite?: string }) => {
            if (overwrite === 'no') {
              throw new Error(red('✖') + ' Operation cancelled');
            }
            return null;
          },
          name: 'overwriteChecker',
        },
        {
          type: () => (isValidPackageName(getProjectName()) ? null : 'text'),
          name: 'packageName',
          message: 'Package name:',
          initial: () => toValidPackageName(getProjectName()),
          validate: (dir) =>
            isValidPackageName(dir) || 'Invalid package.json name',
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled');
        },
      }
    );
  } catch (cancelled: any) {
    console.log(cancelled.message);
    return;
  }

  let template = argTemplate;
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

  // no template specified, ask for framework

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
  } catch (cancelled: any) {
    console.log(cancelled.message);
    return;
  }

  const root = path.join(process.cwd(), targetDir);
  createDirIfNotExists(root);

  const write = (file: string, content: string) => {
    const targetPath = path.join(root, file);
    fs.writeFileSync(targetPath, content);
    console.log(blue('Wrote to file: ') + file);
  };

  const copyFile = (src: string, dest: string) => {
    const targetPath = path.join(root, dest);
    copy(src, targetPath);
    console.log(blue('Wrote to file: ') + dest);
  };

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm';
  //   const isYarn1 = pkgManager === 'yarn' && pkgInfo?.version.startsWith('1.');

  // create directories and files
  console.log('Creating directories and files...');
  const triplitDir = path.join(root, 'triplit');
  createDirIfNotExists(triplitDir);
  copyFile(
    path.resolve(fileURLToPath(import.meta.url), '../../files/schema.ts'),
    'triplit/schema.ts'
  );

  const hasPackageJson = fs.existsSync(path.join(root, 'package.json'));
  let pkgJson: any;
  if (!hasPackageJson) {
    pkgJson = JSON.parse(
      fs.readFileSync(
        path.resolve(
          fileURLToPath(import.meta.url),
          '../../files/package.json'
        ),
        'utf8'
      )
    );
    pkgJson.name = projectInfo.packageName || pkgJson.name;
  } else {
    pkgJson = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    );
    pkgJson = addToPackageJson(
      pkgJson,
      {
        '@triplit/client': '^0.3.1',
      },
      {
        '@triplit/cli': '^0.3.1',
      }
    );
  }
  if (
    frameworkChoice.framework.dependencies ||
    frameworkChoice.framework.devDependencies
  ) {
    pkgJson = addToPackageJson(
      pkgJson,
      frameworkChoice.framework.dependencies,
      frameworkChoice.framework.devDependencies
    );
  }
  pkgJson.name = projectInfo.packageName || pkgJson.name;
  write('package.json', JSON.stringify(pkgJson, null, 2) + '\n');

  const cdProjectName = path.relative(process.cwd(), root);
  console.log(`\nDone. Now run:\n`);
  if (root !== process.cwd()) {
    console.log(
      `  cd ${
        cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName
      }`
    );
  }
  switch (pkgManager) {
    case 'yarn':
      console.log('  yarn');
      console.log('  yarn dev');
      break;
    default:
      console.log(`  ${pkgManager} install`);
      console.log(`  ${pkgManager} run dev`);
      break;
  }
  console.log();
}

async function loadTemplate(template: string, targetDir: string | undefined) {
  // TODO: put templates info into a json obj
  // TOOD: handle renaming based on package name
  if (template === 'chat') {
    await degit('aspen-cloud/triplit/templates/chat-template').clone(
      targetDir || 'chat-template'
    );
    console.log('Created project with chat template');
    return;
  } else {
    console.log('Invalid template specified. Available templates: chat');
    return;
  }
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

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName
  );
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-');
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

createTriplitApp().catch((e) => {
  console.error(e);
  process.exit(1);
});
