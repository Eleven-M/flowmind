#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs-extra');
const path = require('path');
const FlowMind = require('../core');
const { ensurePrivateDir, writePrivateJson } = require('../core/secure-files');
const { getFlowMindHome } = require('../core/runtime-home');
const { version } = require('../package.json');

function printJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function fail(message, extra = {}) {
  printJson({
    ok: false,
    error: {
      message,
      ...extra
    }
  });
  process.exitCode = 1;
}

async function createFlowMind() {
  // FLOWMIND_CODEX_HOME remains an explicit isolated-store override. Without
  // it, Codex shares the same user store as MCP and the regular CLI.
  const legacyCodexHome = process.env.FLOWMIND_CODEX_HOME;
  const sharedRoot = getFlowMindHome();
  const codexHome = legacyCodexHome || path.join(sharedRoot, '.flowmind');
  if (legacyCodexHome) {
    process.env.FLOWMIND_HOME = process.env.FLOWMIND_HOME || legacyCodexHome;
  }

  const configPath = path.join(codexHome, 'config.json');
  await ensurePrivateDir(codexHome);

  if (!await fs.pathExists(configPath)) {
    await writePrivateJson(configPath, {
      version: '1.0.0',
      name: 'FlowMind Codex Workspace',
      storagePath: path.join(codexHome, 'learning'),
      learning: {
        storagePath: path.join(codexHome, 'learning')
      }
    });
  }

  const flowmind = new FlowMind({ configPath });
  await flowmind.init();
  return flowmind;
}

program
  .name('flowmind-codex')
  .description('Codex-friendly JSON wrapper for FlowMind')
  .version(version);

program
  .argument('[input...]', 'Process a FlowMind request directly')
  .option('-s, --skill <skill>', 'Use a specific skill')
  .action(async (inputParts, options) => {
    if (!inputParts.length) {
      return;
    }

    try {
      const flowmind = await createFlowMind();
      const input = inputParts.join(' ');
      const result = await flowmind.process(input, {
        skill: options.skill
      });

      printJson({
        ok: result.type !== 'error',
        command: 'ask',
        input,
        result
      });

      if (result.type === 'error') {
        process.exitCode = 1;
      }
    } catch (error) {
      fail(error.message, { command: 'ask' });
    }
  });

program
  .command('ask')
  .description('Process a request and emit JSON')
  .argument('<input...>', 'Input to process')
  .option('-s, --skill <skill>', 'Use a specific skill')
  .action(async (inputParts, options) => {
    try {
      const flowmind = await createFlowMind();
      const input = inputParts.join(' ');
      const result = await flowmind.process(input, {
        skill: options.skill
      });

      printJson({
        ok: result.type !== 'error',
        command: 'ask',
        input,
        result
      });

      if (result.type === 'error') {
        process.exitCode = 1;
      }
    } catch (error) {
      fail(error.message, { command: 'ask' });
    }
  });

program
  .command('skills')
  .description('List skills as JSON')
  .action(async () => {
    try {
      const flowmind = await createFlowMind();
      printJson({
        ok: true,
        command: 'skills',
        skills: flowmind.skills.list()
      });
    } catch (error) {
      fail(error.message, { command: 'skills' });
    }
  });

program
  .command('skill')
  .description('Get one skill as JSON')
  .argument('<name>', 'Skill name')
  .action(async (name) => {
    try {
      const flowmind = await createFlowMind();
      const skill = flowmind.skills.get(name);

      if (!skill) {
        fail(`Skill not found: ${name}`, { command: 'skill', skill: name });
        return;
      }

      printJson({
        ok: true,
        command: 'skill',
        skill: {
          name: skill.name,
          description: skill.definition?.description,
          category: skill.definition?.category || skill.definition?.metadata?.category,
          version: skill.definition?.version || skill.definition?.metadata?.version,
          author: skill.definition?.author || skill.definition?.metadata?.author,
          triggers: skill.definition?.triggers || [],
          componentDependencies: skill.definition?.componentDependencies || []
        }
      });
    } catch (error) {
      fail(error.message, { command: 'skill', skill: name });
    }
  });

program
  .command('doctor')
  .description('Run health checks as JSON')
  .action(async () => {
    try {
      const flowmind = await createFlowMind();
      const result = await flowmind.doctor();
      printJson({
        ok: result.summary?.errors === 0,
        command: 'doctor',
        result
      });

      if (result.summary?.errors > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      fail(error.message, { command: 'doctor' });
    }
  });

program
  .command('ai-status')
  .description('Show AI status as JSON')
  .action(async () => {
    try {
      const flowmind = await createFlowMind();
      printJson({
        ok: true,
        command: 'ai-status',
        result: flowmind.getAIStatus()
      });
    } catch (error) {
      fail(error.message, { command: 'ai-status' });
    }
  });

program.parseAsync(process.argv).catch((error) => {
  fail(error.message);
});
