import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createIgnoreMatcher } from '../src/config/loader.js';

describe('Parent .gitignore Detection for Subprojects', () => {
  let rootDir: string;
  let subDir: string;

  beforeEach(() => {
    // Structure:
    // rootDir/
    //   .git/
    //   .gitignore (contains: /sub/subproject/dist-cap, **/obj, secret.txt)
    //   sub/
    //     subproject/ (.codesearchrc.json target)
    //       src/
    rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'parent-gitignore-test-')));
    fs.mkdirSync(path.join(rootDir, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, '.gitignore'),
      `
**/obj
secret.txt
/sub/subproject/dist-cap
/sub/subproject/www
`
    );

    subDir = path.join(rootDir, 'sub', 'subproject');
    fs.mkdirSync(path.join(subDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(subDir, 'dist-cap'), { recursive: true });
    fs.mkdirSync(path.join(subDir, 'obj'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('should traverse up to Git root and enforce parent .gitignore rules in subproject', () => {
    const matcher = createIgnoreMatcher(subDir, [], true);

    // Should ignore files/folders defined in root .gitignore
    expect(matcher.ignores('dist-cap/bundle.js')).toBe(true);
    expect(matcher.ignores('dist-cap', true)).toBe(true);
    expect(matcher.ignores('www/index.html')).toBe(true);
    expect(matcher.ignores('obj/Debug/app.dll')).toBe(true);
    expect(matcher.ignores('secret.txt')).toBe(true);

    // Should NOT ignore normal source files
    expect(matcher.ignores('src/main.ts')).toBe(false);
    expect(matcher.ignores('src/components/button.vue')).toBe(false);
  });

  it('should ignore standard build directories from DEFAULT_EXCLUDES', () => {
    const matcher = createIgnoreMatcher(subDir, [], true);

    expect(matcher.ignores('bin/Release/app.dll')).toBe(true);
    expect(matcher.ignores('target/debug/build')).toBe(true);
    expect(matcher.ignores('coverage/lcov.info')).toBe(true);
    expect(matcher.ignores('ios/App/Podfile')).toBe(true);
    expect(matcher.ignores('android/build.gradle')).toBe(true);
  });
});
