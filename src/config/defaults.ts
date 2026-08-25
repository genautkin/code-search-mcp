export const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte', '.astro',
  '.cs', '.java', '.kt', '.scala',
  '.py', '.go', '.rs', '.cpp', '.c', '.h', '.hpp',
  '.rb', '.php', '.swift',
  '.sql', '.graphql', '.proto',
  '.json', '.yaml', '.yml', '.toml', '.md', '.mdx',
  '.sh', '.bash', '.zsh'
];

export const DEFAULT_EXCLUDES = [
  // Minimal internal safety guards (never index VCS internal metadata, dependencies, build or database folders)
  '.git', '.git/**',
  '.code-search', '.code-search/**',
  'node_modules', 'node_modules/**',
  '**/node_modules/**',
  '.cache', '.cache/**',
  'dist', 'dist/**',
  'build', 'build/**'
];

export const DEFAULT_CONFIG = {
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  batchSize: 50,
  maxFileSizeKb: 500,
  respectGitignore: true,
  queryMultiplier: 10,
  searchEf: 200
};

export const RECOMMENDED_CODESEARCHIGNORE = `# code-search-mcp ignore patterns
# Syntax matches standard .gitignore glob rules

# 1. Dependency directories & package caches
node_modules/**
vendor/**
bower_components/**
.pnpm-store/**

# 2. Build & distribution artifacts
dist/**
dist-*/**
build/**
out/**
bin/**
obj/**
www/**
wwwroot/**
.cache/**
coverage/**
.nyc_output/**

# 3. AI Agent skills, workflows & system prompts
.github/skills/**
.github/instructions/**
.github/prompts/**
.gemini/skills/**
.claude/skills/**
**/skills/**
**/.agents/**

# 4. Test fixtures, snapshots and mocks
**/fixtures/**
**/__snapshots__/**
**/mocks/**
*.snap

# 5. Generated code and type declarations
*.generated.*
*.d.ts.map

# 6. Lock files
package-lock.json
yarn.lock
pnpm-lock.yaml
composer.lock
Gemfile.lock
Cargo.lock
packages.lock.json

# 7. Minified code and source maps
*.min.js
*.min.css
*.map

# 8. Binary assets, archives and OS metadata
*.png
*.jpg
*.jpeg
*.gif
*.ico
*.cur
*.svg
*.woff
*.woff2
*.ttf
*.eot
*.otf
*.mp3
*.mp4
*.wav
*.zip
*.tar
*.gz
*.7z
*.rar
*.pdf
*.exe
*.dll
*.so
*.dylib
*.bin
*.DS_Store
Thumbs.db

# 9. IDE & tooling metadata
.idea/**
.vscode/**
.gemini/**
.claude/**
.codegraph/**
.vectorcode/**
`;

