#!/usr/bin/env node

const { runReleaseCheck } = require('../core/release-check');

async function main() {
  const result = await runReleaseCheck();
  const failed = result.checks.filter((check) => check.status !== 'ok');

  for (const check of result.checks) {
    const marker = check.status === 'ok' ? 'OK' : 'FAIL';
    console.log(`${marker} ${check.key}: ${check.message}`);
  }

  if (result.publintMessages?.length > 0) {
    console.log('\npublint messages:');
    for (const message of result.publintMessages) {
      console.log(`- ${message.type || 'message'}: ${message.message || message.code || JSON.stringify(message)}`);
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
