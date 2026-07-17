#!/usr/bin/env node

const chalk = require('chalk');
const packageJson = require('../package.json');
const {
  getUpdateStatus
} = require('../core/update-notifier');

function printStatus(status) {
  console.log(chalk.cyan(`\nCurrent version: ${status.currentVersion}`));
  console.log(chalk.cyan(`Latest version:  ${status.latestVersion}`));

  if (status.comparison === 0) {
    console.log(chalk.green('\n✓ You are already on the latest version!'));
    return;
  }

  if (status.comparison > 0) {
    console.log(chalk.green('\n✓ You are on a newer version than npm latest.'));
    return;
  }

  console.log(chalk.yellow(`\n⬆ Update available: ${status.currentVersion} → ${status.latestVersion}`));
  console.log(chalk.cyan('\nRun the following command to update:'));
  console.log(chalk.white(`  ${status.installCommand}`));
  console.log(chalk.gray('  Or run `flowmind update` for the guided upgrade flow.'));
}

async function main() {
  try {
    const status = getUpdateStatus({
      packageName: packageJson.name,
      currentVersion: packageJson.version,
      packageJsonPath: require.resolve('../package.json')
    });

    printStatus(status);
  } catch (error) {
    console.error(chalk.red('Failed to check for updates:'), error.message);
    console.log(chalk.yellow('\nYou can manually update with:'));
    console.log(chalk.white(`  npm install -g ${packageJson.name}@latest`));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
