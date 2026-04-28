import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGE = join(ROOT, '.mcpb-stage');
const OUT = join(ROOT, 'swissgroceries-mcp.mcpb');

function run(cmd: string, cwd = ROOT) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd });
}

function clean() {
  rmSync(STAGE, { recursive: true, force: true });
  rmSync(OUT, { force: true });
}

function cleanStage() {
  rmSync(STAGE, { recursive: true, force: true });
}

function build() {
  run('npm run build');
}

function stage() {
  mkdirSync(join(STAGE, 'server'), { recursive: true });

  // Copy compiled server
  run(`cp -r dist ${join(STAGE, 'server')}/`);

  // Copy static data
  mkdirSync(join(STAGE, 'server', 'src', 'data'), { recursive: true });
  copyFileSync('src/data/swiss-zips.json', join(STAGE, 'server', 'src', 'data', 'swiss-zips.json'));

  // Strip down package.json for the bundle (production only)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const slimPkg = {
    name: pkg.name,
    version: pkg.version,
    type: pkg.type,
    main: 'dist/index.js',
    bin: pkg.bin,
    dependencies: pkg.dependencies,
    engines: pkg.engines,
  };
  writeFileSync(join(STAGE, 'server', 'package.json'), JSON.stringify(slimPkg, null, 2));

  // Install production deps inside the stage
  run('npm install --omit=dev --no-audit --no-fund', join(STAGE, 'server'));

  // Manifest
  const manifest = {
    dxt_version: '0.1',
    name: 'swissgroceries-mcp',
    display_name: 'Swiss Grocery Stores',
    version: pkg.version,
    description: pkg.description,
    author: { name: pkg.author ?? 'Unknown' },
    license: pkg.license ?? 'MIT',
    homepage: pkg.homepage,
    keywords: pkg.keywords,
    server: {
      type: 'node',
      entry_point: 'server/dist/index.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/server/dist/index.js'],
        env: {},
      },
    },
    user_config: {
      DENNER_JWT: {
        type: 'string',
        title: 'Denner JWT',
        description: 'Optional Bearer token from the Denner iOS app to enable Denner adapter.',
        sensitive: true,
        required: false,
      },
      LIDL_DEFAULT_STORE: {
        type: 'string',
        title: 'Lidl default store ID',
        description: 'Default Lidl store identifier (default: CH0149).',
        required: false,
      },
    },
  };
  writeFileSync(join(STAGE, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

function pack() {
  run(`zip -qr "${OUT}" .`, STAGE);
}

clean();
build();
stage();
pack();
cleanStage();

console.log(`\n✓ ${OUT} built. Drop on Claude Desktop to install.`);
