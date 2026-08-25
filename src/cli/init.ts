import * as fs from 'fs';
import * as path from 'path';
import { select, confirm, input } from '@inquirer/prompts';
import { InitOptions } from '../types.js';
import { findProjectRoot, isProjectInitialized, loadConfig } from '../config/loader.js';
import { RECOMMENDED_CODESEARCHIGNORE, DEFAULT_EXTENSIONS, DEFAULT_CONFIG } from '../config/defaults.js';
import { detectProjectExtensions } from './detector.js';
import { IndexerWorker } from '../indexer/worker.js';

export async function runInit(options: InitOptions = {}): Promise<void> {
  const targetDir = options.projectRoot ? path.resolve(options.projectRoot) : findProjectRoot(process.cwd());
  let canonicalRoot = targetDir;
  try {
    canonicalRoot = fs.realpathSync(targetDir);
  } catch {}

  const isInteractive = !options.yes;
  const alreadyInitialized = isProjectInitialized(canonicalRoot);

  if (isInteractive) {
    console.log('\n🔍 code-search-mcp Project Initialization\n');
  }

  let cleanExisting = options.clean ?? false;
  if (alreadyInitialized && isInteractive && !options.clean) {
    cleanExisting = await confirm({
      message: 'Existing configuration or index detected. Clean and rebuild from scratch?',
      default: false
    });
  }

  // 1. Determine index storage path
  const hasNodeModules = fs.existsSync(path.join(canonicalRoot, 'node_modules'));
  let chosenIndexPath = options.indexPath;

  if (!chosenIndexPath) {
    if (isInteractive) {
      const choices = [];
      if (hasNodeModules) {
        choices.push({
          name: 'node_modules/.cache/code-search/lancedb (Recommended: zero git noise)',
          value: 'node_modules/.cache/code-search/lancedb'
        });
      }
      choices.push({
        name: '.code-search/lancedb (Standard root directory)',
        value: '.code-search/lancedb'
      });
      choices.push({
        name: 'Custom directory path...',
        value: '__CUSTOM__'
      });

      const selected = await select({
        message: 'Where should the vector database index be stored?',
        choices
      });

      if (selected === '__CUSTOM__') {
        chosenIndexPath = await input({
          message: 'Enter custom index path (relative to project root or absolute):',
          default: '.code-search/lancedb'
        });
      } else {
        chosenIndexPath = selected;
      }
    } else {
      chosenIndexPath = hasNodeModules
        ? 'node_modules/.cache/code-search/lancedb'
        : '.code-search/lancedb';
    }
  }

  // 2. Respect .gitignore
  let respectGitignore = options.respectGitignore ?? true;
  if (isInteractive && options.respectGitignore === undefined) {
    respectGitignore = await confirm({
      message: "Skip indexing files listed in your project's .gitignore?",
      default: true
    });
  }

  // 3. Search Ignore File (.codesearchignore)
  const ignoreFilePath = path.join(canonicalRoot, '.codesearchignore');
  const ignoreFileExists = fs.existsSync(ignoreFilePath);
  let createIgnoreFile = options.createIgnoreFile ?? !ignoreFileExists;
  if (isInteractive && options.createIgnoreFile === undefined) {
    if (!ignoreFileExists) {
      createIgnoreFile = await confirm({
        message: 'Create a .codesearchignore file with recommended excludes (fixtures, mocks, minified code)?',
        default: true
      });
    } else {
      createIgnoreFile = false;
    }
  }

  // 4. Extension Detection & Customization
  let supportedExtensions = options.supportedExtensions;
  if (!supportedExtensions) {
    const detected = detectProjectExtensions(canonicalRoot, { respectGitignore });
    if (isInteractive) {
      const detectedSummary = Object.entries(detected.counts)
        .slice(0, 8)
        .map(([ext, count]) => `${ext} (${count} files)`)
        .join(', ');

      if (detectedSummary) {
        console.log(`\n📁 Detected file types in project: ${detectedSummary}\n`);
      }

      const action = await select({
        message: 'Which file extensions should code-search index?',
        choices: [
          {
            name: `Use detected extensions (${detected.extensions.slice(0, 10).join(', ')}${detected.extensions.length > 10 ? '...' : ''})`,
            value: 'detected'
          },
          {
            name: 'Customize extension list manually',
            value: 'custom'
          }
        ]
      });

      if (action === 'custom') {
        const rawInput = await input({
          message: 'Enter comma-separated file extensions to index (e.g. .ts, .tsx, .py, .md):',
          default: detected.extensions.join(', ')
        });
        supportedExtensions = rawInput
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
          .map((e) => (e.startsWith('.') ? e : `.${e}`));
      } else {
        supportedExtensions = detected.extensions;
      }
    } else {
      supportedExtensions = detected.extensions.length > 0 ? detected.extensions : DEFAULT_EXTENSIONS;
    }
  }

  // Clean existing index if requested
  if (cleanExisting) {
    const fullDbPath = path.isAbsolute(chosenIndexPath)
      ? chosenIndexPath
      : path.join(canonicalRoot, chosenIndexPath);
    if (fs.existsSync(fullDbPath)) {
      try {
        fs.rmSync(fullDbPath, { recursive: true, force: true });
      } catch {}
    }
  }

  // 5. Gitignore Protection
  const gitignorePath = path.join(canonicalRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      const relIndexPath = chosenIndexPath.replace(/\\/g, '/');

      // Check if index path is inside repo (and not inside node_modules which is usually already ignored)
      if (!relIndexPath.startsWith('node_modules') && !gitignoreContent.includes('.code-search')) {
        const toAppend = '\n# code-search vector database index\n.code-search/\n';
        fs.appendFileSync(gitignorePath, toAppend, 'utf8');
        if (isInteractive) {
          console.log('🛡 Added .code-search/ to .gitignore');
        }
      }
    } catch {}
  }

  // 6. Write .codesearchrc.json
  const rcPath = path.join(canonicalRoot, '.codesearchrc.json');
  const rcContent = {
    $schema: 'https://raw.githubusercontent.com/genautkin/code-search-mcp/main/schema.json',
    version: 1,
    indexPath: chosenIndexPath,
    respectGitignore,
    supportedExtensions,
    customExcludes: [],
    maxFileSizeKb: DEFAULT_CONFIG.maxFileSizeKb,
    embeddingModel: DEFAULT_CONFIG.embeddingModel
  };
  fs.writeFileSync(rcPath, JSON.stringify(rcContent, null, 2) + '\n', 'utf8');
  if (isInteractive) {
    console.log(`✅ Saved configuration to ${rcPath}`);
  }

  // 7. Write .codesearchignore
  if (createIgnoreFile && !fs.existsSync(ignoreFilePath)) {
    fs.writeFileSync(ignoreFilePath, RECOMMENDED_CODESEARCHIGNORE, 'utf8');
    if (isInteractive) {
      console.log(`✅ Created ${ignoreFilePath}`);
    }
  }

  // 8. Initial Indexing
  let shouldIndex = !options.skipIndex;
  if (isInteractive && options.skipIndex === undefined) {
    shouldIndex = await confirm({
      message: 'Start building search index now?',
      default: true
    });
  }

  if (shouldIndex) {
    if (isInteractive) {
      console.log('\n🚀 Starting initial indexing...');
    }
    const config = loadConfig(canonicalRoot);
    const worker = new IndexerWorker(config);
    await worker.init();

    await worker.startIndexing(cleanExisting);

    if (isInteractive) {
      const status = worker.getStatus();
      console.log(`✨ Initial indexing completed! (${status.indexedFiles} files, ${status.indexedChunks} chunks indexed)`);
      console.log(`💡 Tip: You can change your configuration anytime by editing .codesearchrc.json or .codesearchignore.\n`);
    }
  } else if (isInteractive) {
    console.log('\n🎉 Setup complete! Run `code-search-mcp index` whenever you are ready to index.');
    console.log(`💡 Tip: You can change your configuration anytime by editing .codesearchrc.json or .codesearchignore.\n`);
  }
}
