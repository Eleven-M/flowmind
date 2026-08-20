jest.mock('child_process', () => ({
  execFile: jest.fn(),
  execSync: jest.fn()
}));

const { execFile, execSync } = require('child_process');
const {
  buildInstallCommand,
  compareVersions,
  getUpdateStatus,
  getUpdateStatusAsync
} = require('../core/update-notifier');

describe('update notifier', () => {
  beforeEach(() => {
    execFile.mockReset();
    execSync.mockReset();
  });

  test('compareVersions detects older, equal, and newer releases', () => {
    expect(compareVersions('1.5.5', '1.5.6')).toBe(-1);
    expect(compareVersions('1.5.5', '1.5.5')).toBe(0);
    expect(compareVersions('1.5.6', '1.5.5')).toBe(1);
  });

  test('buildInstallCommand generates global and local install commands', () => {
    expect(buildInstallCommand({
      packageName: 'flowmind',
      version: '1.5.6',
      globalInstall: true
    })).toBe('npm install -g flowmind@1.5.6');

    expect(buildInstallCommand({
      packageName: 'flowmind',
      version: '1.5.6',
      globalInstall: false
    })).toBe('npm install flowmind@1.5.6');
  });

  test('getUpdateStatus marks a global install and suggests the global upgrade command', () => {
    execSync.mockImplementation((command) => {
      if (command === 'npm view flowmind version') {
        return '1.5.6\n';
      }
      if (command === 'npm root -g') {
        return '/usr/local/lib/node_modules\n';
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const status = getUpdateStatus({
      packageName: 'flowmind',
      currentVersion: '1.5.5',
      packageJsonPath: '/usr/local/lib/node_modules/flowmind/package.json'
    });

    expect(status).toEqual(expect.objectContaining({
      currentVersion: '1.5.5',
      latestVersion: '1.5.6',
      comparison: -1,
      globalInstall: true,
      installCommand: 'npm install -g flowmind@1.5.6'
    }));
  });

  test('getUpdateStatusAsync resolves update status for TUI usage', async () => {
    execFile.mockImplementation((command, args, options, callback) => {
      const output = args[0] === 'view' ? '1.5.6\n' : '/usr/local/lib/node_modules\n';
      return callback(null, output, '');
    });

    const status = await getUpdateStatusAsync({
      packageName: 'flowmind',
      currentVersion: '1.5.5',
      packageJsonPath: '/usr/local/lib/node_modules/flowmind/package.json'
    });

    expect(status).toEqual(expect.objectContaining({
      latestVersion: '1.5.6',
      comparison: -1,
      installCommand: 'npm install -g flowmind@1.5.6'
    }));
  });
});
