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
  // Build and distribution artifacts
  'dist/**', 'dist-*/**', 'build/**', 'out/**', 'bin/**', 'obj/**', 'www/**', 'wwwroot/**',
  'coverage/**', '.nyc_output/**',
  
  // Dependency directories
  'node_modules/**', 'vendor/**', 'bower_components/**', '.pnpm-store/**',
  
  // IDEs and tools
  '.git/**', '.svn/**', '.hg/**',
  '.idea/**', '.vscode/**', '.gemini/**', '.claude/**',
  '.codegraph/**', '.vectorcode/**', '.code-search/**',
  
  // Mobile / native wrapper builds
  'android/**', 'ios/**', 'windows_build/**',
  
  // Lock files
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', 'Gemfile.lock', 'Cargo.lock', 'packages.lock.json',
  
  // Minified & source maps
  '*.min.js', '*.min.css', '*.map',
  
  // Binary / media assets
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.ico', '*.cur', '*.svg',
  '*.woff', '*.woff2', '*.ttf', '*.eot', '*.otf',
  '*.mp3', '*.mp4', '*.wav', '*.mov', '*.avi',
  '*.zip', '*.tar', '*.gz', '*.7z', '*.rar',
  '*.pdf', '*.doc', '*.docx', '*.xls', '*.xlsx',
  '*.exe', '*.dll', '*.so', '*.dylib', '*.bin',
  '*.DS_Store', 'Thumbs.db',
  
  // Styling files (if noisy text-only embeddings)
  '*.css', '*.scss', '*.sass', '*.less'
];

export const DEFAULT_CONFIG = {
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  batchSize: 50,
  maxFileSizeKb: 500,
  queryMultiplier: 10,
  searchEf: 200
};
