#!/usr/bin/env node

/**
 * FlowMind CLI
 * The AI Agent That Learns How You Work
 */

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const FlowMind = require('../core');

// Package info
const packageJson = require('../package.json');

// Create FlowMind instance
let flowmind;

/**
 * Initialize FlowMind
 */
async function initFlowMind(options = {}) {
  flowmind = new FlowMind(options);
  await flowmind.init();
  return flowmind;
}

/**
 * Display banner
 */
function showBanner() {
  console.log(chalk.cyan(`
  ╔══════════════════════════════════════════════════╗
  ║                                                ║
  ║   🧠 FlowMind                                  ║
  ║   The AI Agent That Learns How You Work        ║
  ║                                                ║
  ╚══════════════════════════════════════════════════╝
  `));
}

// CLI Commands
program
  .name('flowmind')
  .description('The AI Agent That Learns How You Work')
  .version(packageJson.version);

// Init command
program
  .command('init')
  .description('Initialize FlowMind in current directory')
  .action(async () => {
    showBanner();

    const spinner = ora('Initializing FlowMind...').start();

    try {
      // Create config directory
      const configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.flowmind');
      await fs.ensureDir(configDir);
      await fs.ensureDir(path.join(configDir, 'learning'));
      await fs.ensureDir(path.join(configDir, 'learning', 'records'));

      // Create default config
      const configPath = path.join(configDir, 'config.json');
      if (!await fs.pathExists(configPath)) {
        const defaultConfig = {
          version: '1.0.0',
          learning: {
            enabled: true,
            autoApply: true,
            confidenceThreshold: 0.7,
            storagePath: path.join(configDir, 'learning')
          },
          sceneMapping: {
            enabled: true,
            weights: {
              keywordMatch: 0.4,
              patternMatch: 0.3,
              historyScore: 0.2,
              confidence: 0.1
            }
          }
        };

        await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
      }

      spinner.succeed('FlowMind initialized successfully!');

      console.log(chalk.green('\n✓ Configuration created at:'), configDir);
      console.log(chalk.green('✓ Learning system ready'));
      console.log(chalk.green('✓ Scene mapping ready'));

      console.log(chalk.cyan('\nNext steps:'));
      console.log('  1. Run', chalk.yellow('flowmind'), 'to start interactive mode');
      console.log('  2. Or use', chalk.yellow('flowmind "your request"'), 'for single commands');
      console.log('  3. FlowMind will learn from your corrections automatically');

    } catch (error) {
      spinner.fail('Failed to initialize FlowMind');
      console.error(chalk.red(error.message));
    }
  });

// Process command (default)
program
  .command('process')
  .alias('p')
  .description('Process a request')
  .argument('[input]', 'Input to process')
  .option('-s, --skill <skill>', 'Use specific skill')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    try {
      const fm = await initFlowMind();

      if (!input) {
        // Interactive mode
        await runInteractiveMode(fm);
      } else {
        // Single command mode
        const spinner = ora('Processing...').start();

        const result = await fm.process(input, {
          skill: options.skill,
          verbose: options.verbose
        });

        spinner.stop();
        displayResult(result);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Learn command
program
  .command('learn')
  .description('Manage learning records')
  .option('-l, --list', 'List learning records')
  .option('-s, --skill <skill>', 'Filter by skill')
  .option('-t, --type <type>', 'Filter by type')
  .option('-e, --export [file]', 'Export learnings')
  .option('-i, --import <file>', 'Import learnings')
  .option('-r, --reset <skill>', 'Reset skill learnings')
  .option('-d, --delete <id>', 'Delete learning record')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();

      if (options.list) {
        const stats = await fm.getStats();
        displayStats(stats);
      } else if (options.export) {
        const exportPath = options.export || 'flowmind-learnings.json';
        await fm.exportLearnings({ output: exportPath });
        console.log(chalk.green('✓ Learnings exported to:'), exportPath);
      } else if (options.import) {
        const data = await fs.readJson(options.import);
        await fm.importLearnings(data);
        console.log(chalk.green('✓ Learnings imported successfully'));
      } else if (options.reset) {
        console.log(chalk.yellow('Resetting learnings for:'), options.reset);
        // Implementation would go here
      } else if (options.delete) {
        console.log(chalk.yellow('Deleting learning:'), options.delete);
        // Implementation would go here
      } else {
        // Default to list
        const stats = await fm.getStats();
        displayStats(stats);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Scenes command
program
  .command('scenes')
  .description('Manage scene mappings')
  .option('-l, --list', 'List scenes')
  .option('-a, --add', 'Add new scene')
  .option('-r, --remove <id>', 'Remove scene')
  .option('-e, --export [file]', 'Export scenes')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();

      if (options.list) {
        const scenes = fm.matcher.listScenes();
        displayScenes(scenes);
      } else if (options.add) {
        await addSceneInteractive(fm);
      } else if (options.remove) {
        await fm.matcher.removeScene(options.remove);
        console.log(chalk.green('✓ Scene removed'));
      } else if (options.export) {
        const exportPath = options.export || 'flowmind-scenes.json';
        const scenes = fm.matcher.listScenes();
        await fs.writeJson(exportPath, scenes, { spaces: 2 });
        console.log(chalk.green('✓ Scenes exported to:'), exportPath);
      } else {
        // Default to list
        const scenes = fm.matcher.listScenes();
        displayScenes(scenes);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Skills command (enhanced)
program
  .command('skills')
  .description('List available skills')
  .option('-j, --json', 'Output as JSON (for tool integration)')
  .option('-v, --verbose', 'Show detailed information')
  .option('-c, --category <category>', 'Filter by category')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();
      const skills = fm.skills.list();

      // Filter by category if specified
      const filtered = options.category
        ? skills.filter(s => s.category === options.category)
        : skills;

      if (options.json) {
        // JSON output for codex/claude integration
        console.log(JSON.stringify({ skills: filtered }, null, 2));
      } else {
        displaySkills(filtered, options.verbose);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Skill command (view/modify single skill)
program
  .command('skill <name>')
  .description('View or modify skill configuration')
  .option('-i, --info', 'Show skill info (default)')
  .option('-c, --config', 'Show/edit skill configuration')
  .option('-s, --set <key> <value>', 'Set config value')
  .option('-r, --read', 'Read SKILL.md content')
  .option('-e, --edit', 'Open SKILL.md in editor')
  .option('-j, --json', 'Output as JSON (for tool integration)')
  .action(async (name, options) => {
    try {
      const fm = await initFlowMind();
      const skill = fm.skills.get(name);

      if (!skill) {
        console.error(chalk.red(`Skill not found: ${name}`));
        console.log(chalk.cyan('\nAvailable skills:'));
        fm.skills.list().forEach(s => console.log(`  - ${s.name}`));
        return;
      }

      // Default to info if no option specified
      if (!options.config && !options.read && !options.edit && !options.set) {
        options.info = true;
      }

      if (options.info) {
        await showSkillInfo(skill, options.json);
      } else if (options.read) {
        await readSkillMd(skill);
      } else if (options.edit) {
        await editSkillMd(skill);
      } else if (options.config) {
        await showSkillConfig(skill, fm, options.json);
      } else if (options.set) {
        // options.set is the key, need value from next arg
        const value = options.set;
        const key = options.set;
        // Get key and value from command line
        const args = process.argv.slice(3);
        if (args.length >= 2) {
          await setSkillConfig(skill, fm, args[0], args[1]);
        } else {
          console.error(chalk.red('Usage: flowmind skill <name> --set <key> <value>'));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Resource command (local resource files)
program
  .command('resource')
  .alias('res')
  .description('Manage local resource files')
  .option('-l, --list [dir]', 'List resource directory')
  .option('-s, --show <file>', 'Show file content')
  .option('-e, --edit <file>', 'Edit file')
  .option('-c, --config', 'Show resource configuration')
  .option('-j, --json', 'Output as JSON (for tool integration)')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();
      const resourceConfig = fm.config.get('resources', {});
      const configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.flowmind');

      if (options.config) {
        // Show resource configuration
        if (options.json) {
          console.log(JSON.stringify({ resources: resourceConfig }, null, 2));
        } else {
          displayResourceConfig(resourceConfig);
        }
      } else if (options.show) {
        // Show file content
        const filePath = resolveResourcePath(options.show, configDir);
        if (await fs.pathExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf-8');
          if (options.json) {
            console.log(JSON.stringify({ file: options.show, content }, null, 2));
          } else {
            console.log(chalk.cyan(`\n📄 ${options.show}`));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(content);
          }
        } else {
          console.error(chalk.red(`File not found: ${options.show}`));
        }
      } else if (options.edit) {
        // Edit file
        const filePath = resolveResourcePath(options.edit, configDir);
        await openInEditor(filePath);
      } else {
        // List directory (default)
        const targetDir = options.list && typeof options.list === 'string'
          ? resolveResourcePath(options.list, configDir)
          : configDir;

        if (await fs.pathExists(targetDir)) {
          const files = await listResourceFiles(targetDir, configDir);
          if (options.json) {
            console.log(JSON.stringify({ directory: targetDir, files }, null, 2));
          } else {
            displayResourceFiles(files, targetDir);
          }
        } else {
          console.error(chalk.red(`Directory not found: ${targetDir}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Stats command
program
  .command('stats')
  .description('Show FlowMind statistics')
  .action(async () => {
    try {
      const fm = await initFlowMind();
      const stats = await fm.getStats();
      displayStats(stats);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Config command
program
  .command('config')
  .description('Manage configuration')
  .option('-l, --list', 'List configuration')
  .option('-s, --set <key> <value>', 'Set configuration value')
  .option('-g, --get <key>', 'Get configuration value')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();

      if (options.list) {
        const config = fm.config.getAll();
        console.log(chalk.cyan('\nFlowMind Configuration:'));
        console.log(JSON.stringify(config, null, 2));
      } else if (options.set && options.value) {
        fm.config.set(options.set, options.value);
        await fm.config.save();
        console.log(chalk.green('✓ Configuration updated'));
      } else if (options.get) {
        const value = fm.config.get(options.get);
        console.log(value);
      } else {
        const config = fm.config.getAll();
        console.log(JSON.stringify(config, null, 2));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Interactive mode
async function runInteractiveMode(fm) {
  showBanner();
  console.log(chalk.cyan('Interactive mode started. Type "exit" to quit.\n'));

  while (true) {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: chalk.green('You:'),
        prefix: ''
      }
    ]);

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log(chalk.cyan('\nGoodbye! FlowMind will remember your preferences. 👋\n'));
      break;
    }

    if (!input.trim()) continue;

    const spinner = ora('Thinking...').start();

    try {
      const result = await fm.process(input);
      spinner.stop();
      displayResult(result);
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error:'), error.message);
    }

    console.log(''); // Empty line for spacing
  }
}

// Add scene interactive
async function addSceneInteractive(fm) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Scene name:',
    },
    {
      type: 'input',
      name: 'keywords',
      message: 'Keywords (comma separated):',
    },
    {
      type: 'input',
      name: 'patterns',
      message: 'Trigger patterns (comma separated):',
    },
    {
      type: 'input',
      name: 'skills',
      message: 'Skills to execute (comma separated):',
    }
  ]);

  const scene = {
    name: answers.name,
    keywords: answers.keywords.split(',').map(k => k.trim()),
    patterns: answers.patterns.split(',').map(p => p.trim()),
    workflow: {
      skills: answers.skills.split(',').map(s => ({
        skill: s.trim(),
        params: {}
      }))
    }
  };

  await fm.matcher.addScene(scene);
  console.log(chalk.green('✓ Scene added successfully'));
}

// Display functions
function displayResult(result) {
  if (result.type === 'learning') {
    console.log(chalk.cyan(result.message));
  } else if (result.type === 'result') {
    console.log(chalk.white('\n┌─────────────────────────────────────────────────────┐'));
    console.log(chalk.white('│ Result                                              │'));
    console.log(chalk.white('├─────────────────────────────────────────────────────┤'));

    if (result.metadata?.skill) {
      console.log(chalk.white(`│ Skill: ${result.metadata.skill}`));
    }
    if (result.metadata?.duration) {
      console.log(chalk.white(`│ Duration: ${result.metadata.duration}ms`));
    }
    if (result.metadata?.sceneMatch) {
      console.log(chalk.white(`│ Scene: ${result.metadata.sceneMatch.scene.name}`));
    }

    console.log(chalk.white('├─────────────────────────────────────────────────────┤'));
    console.log(chalk.white('│'));

    if (typeof result.data === 'string') {
      console.log(chalk.white(result.data));
    } else {
      console.log(chalk.white(JSON.stringify(result.data, null, 2)));
    }

    console.log(chalk.white('│'));
    console.log(chalk.white('└─────────────────────────────────────────────────────┘'));
  } else if (result.type === 'error') {
    console.log(chalk.red('\n✗ Error:'), result.message);
  }
}

function displayStats(stats) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ FlowMind Statistics                                 │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan(`│ Total Learning Records: ${stats.totalRecords || 0}`));
  console.log(chalk.cyan(`│ Last Learning: ${stats.lastLearning || 'Never'}`));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  if (stats.byType && Object.keys(stats.byType).length > 0) {
    console.log(chalk.cyan('│ By Type:'));
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(chalk.cyan(`│   ${type}: ${count}`));
    }
  }

  if (stats.bySkill && Object.keys(stats.bySkill).length > 0) {
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
    console.log(chalk.cyan('│ By Skill:'));
    for (const [skill, count] of Object.entries(stats.bySkill)) {
      console.log(chalk.cyan(`│   ${skill}: ${count}`));
    }
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

function displayScenes(scenes) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ Scene Mappings                                      │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  if (scenes.length === 0) {
    console.log(chalk.cyan('│ No scenes defined yet.                              │'));
  } else {
    for (const scene of scenes) {
      console.log(chalk.cyan(`│ ${scene.name}`));
      console.log(chalk.cyan(`│   Keywords: ${scene.keywords?.join(', ') || 'N/A'}`));
      console.log(chalk.cyan(`│   Used: ${scene.useCount || 0} times`));
      console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
    }
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

function displaySkills(skills, verbose = false) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ Available Skills                                    │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  for (const skill of skills) {
    console.log(chalk.cyan(`│ ${chalk.bold(skill.name)}`));
    if (skill.description) {
      const desc = verbose ? skill.description : skill.description.substring(0, 50) + '...';
      console.log(chalk.cyan(`│   ${desc}`));
    }
    if (verbose && skill.category) {
      console.log(chalk.cyan(`│   Category: ${skill.category}`));
    }
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

// Skill info display
async function showSkillInfo(skill, asJson = false) {
  const info = {
    name: skill.name,
    path: skill.path,
    description: skill.definition?.description || 'No description',
    version: skill.definition?.version || skill.definition?.metadata?.version || '1.0.0',
    author: skill.definition?.author || skill.definition?.metadata?.author || 'unknown',
    category: skill.definition?.category || skill.definition?.metadata?.category || 'general',
    componentDependencies: skill.definition?.componentDependencies || [],
    triggers: skill.definition?.triggers || []
  };

  if (asJson) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
    console.log(chalk.cyan(`│ ${chalk.bold(info.name)}`));
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
    console.log(chalk.cyan(`│ Description: ${info.description}`));
    console.log(chalk.cyan(`│ Version:     ${info.version}`));
    console.log(chalk.cyan(`│ Author:      ${info.author}`));
    console.log(chalk.cyan(`│ Category:    ${info.category}`));
    console.log(chalk.cyan(`│ Path:        ${info.path}`));

    if (info.componentDependencies.length > 0) {
      console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
      console.log(chalk.cyan('│ Component Dependencies:'));
      for (const dep of info.componentDependencies) {
        console.log(chalk.cyan(`│   - ${dep}`));
      }
    }

    if (info.triggers.length > 0) {
      console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
      console.log(chalk.cyan('│ Trigger Patterns:'));
      for (const trigger of info.triggers.slice(0, 10)) {
        console.log(chalk.cyan(`│   - ${trigger}`));
      }
      if (info.triggers.length > 10) {
        console.log(chalk.cyan(`│   ... and ${info.triggers.length - 10} more`));
      }
    }

    console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
  }
}

// Read SKILL.md content
async function readSkillMd(skill) {
  const skillMdPath = path.join(skill.path, 'SKILL.md');
  if (await fs.pathExists(skillMdPath)) {
    const content = await fs.readFile(skillMdPath, 'utf-8');
    console.log(chalk.cyan(`\n📄 ${skill.name}/SKILL.md`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(content);
  } else {
    console.error(chalk.red('SKILL.md not found'));
  }
}

// Edit SKILL.md
async function editSkillMd(skill) {
  const skillMdPath = path.join(skill.path, 'SKILL.md');
  await openInEditor(skillMdPath);
}

// Show skill configuration
async function showSkillConfig(skill, fm, asJson = false) {
  const configKey = skill.name;
  const config = fm.config.get(configKey, {});

  if (asJson) {
    console.log(JSON.stringify({ skill: skill.name, config }, null, 2));
  } else {
    console.log(chalk.cyan(`\n┌─────────────────────────────────────────────────────┐`));
    console.log(chalk.cyan(`│ ${skill.name} Configuration`));
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

    if (Object.keys(config).length === 0) {
      console.log(chalk.cyan('│ No configuration set'));
      console.log(chalk.cyan('│'));
      console.log(chalk.cyan('│ Default configuration from SKILL.md:'));

      // Extract default config from SKILL.md
      const skillMdPath = path.join(skill.path, 'SKILL.md');
      if (await fs.pathExists(skillMdPath)) {
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const configMatch = content.match(/## Configuration\n([\s\S]*?)(?=\n##|$)/);
        if (configMatch) {
          const configSection = configMatch[1].trim();
          const lines = configSection.split('\n').slice(0, 15);
          for (const line of lines) {
            console.log(chalk.cyan(`│ ${line}`));
          }
        }
      }
    } else {
      const configJson = JSON.stringify(config, null, 2);
      configJson.split('\n').forEach(line => {
        console.log(chalk.cyan(`│ ${line}`));
      });
    }

    console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
  }
}

// Set skill configuration
async function setSkillConfig(skill, fm, key, value) {
  const configKey = skill.name;
  const config = fm.config.get(configKey, {});

  // Support nested keys like "security.enabled"
  const keys = key.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }

  // Try to parse value as JSON, fallback to string
  let parsedValue;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    parsedValue = value;
  }

  current[keys[keys.length - 1]] = parsedValue;
  fm.config.set(configKey, config);
  await fm.config.save();

  console.log(chalk.green(`✓ Set ${skill.name}.${key} = ${value}`));
}

// Resource file helpers
function resolveResourcePath(filePath, configDir) {
  // If absolute path, use as-is
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  // Otherwise resolve relative to config dir
  return path.join(configDir, filePath);
}

async function listResourceFiles(dir, configDir) {
  const files = [];
  const entries = await fs.readdir(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = await fs.stat(fullPath);
    const relativePath = path.relative(configDir, fullPath);

    if (stat.isDirectory()) {
      files.push({
        name: entry,
        path: relativePath,
        type: 'directory',
        size: 0
      });
    } else {
      files.push({
        name: entry,
        path: relativePath,
        type: 'file',
        size: stat.size,
        modified: stat.mtime
      });
    }
  }

  return files.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
}

function displayResourceFiles(files, dir) {
  console.log(chalk.cyan(`\n📁 ${dir}`));
  console.log(chalk.gray('─'.repeat(50)));

  if (files.length === 0) {
    console.log(chalk.cyan('  (empty)'));
    return;
  }

  for (const file of files) {
    if (file.type === 'directory') {
      console.log(chalk.blue(`  📁 ${file.name}/`));
    } else {
      const size = formatFileSize(file.size);
      console.log(chalk.white(`  📄 ${file.name}`) + chalk.gray(` (${size})`));
    }
  }
}

function displayResourceConfig(config) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ Resource Configuration                              │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  const entries = Object.entries(config);
  if (entries.length === 0) {
    console.log(chalk.cyan('│ No resources configured'));
  } else {
    for (const [key, value] of entries) {
      const enabled = value.enabled !== false;
      const status = enabled ? chalk.green('✓') : chalk.red('✗');
      console.log(chalk.cyan(`│ ${status} ${key}`));
      if (value.path) {
        console.log(chalk.cyan(`│   Path: ${value.path}`));
      }
    }
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function openInEditor(filePath) {
  const { spawn } = require('child_process');
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

  console.log(chalk.cyan(`Opening ${filePath} in ${editor}...`));

  return new Promise((resolve, reject) => {
    const child = spawn(editor, [filePath], {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
  });
}

// Parse arguments
program.parse(process.argv);

// Default to interactive mode if no command specified
if (!process.argv.slice(2).length) {
  (async () => {
    try {
      const fm = await initFlowMind();
      await runInteractiveMode(fm);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  })();
}
