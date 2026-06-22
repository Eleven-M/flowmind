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

// Skills command
program
  .command('skills')
  .description('List available skills')
  .action(async () => {
    try {
      const fm = await initFlowMind();
      const skills = fm.skills.list();
      displaySkills(skills);
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

function displaySkills(skills) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ Available Skills                                    │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  for (const skill of skills) {
    console.log(chalk.cyan(`│ ${skill.name}`));
    if (skill.description) {
      console.log(chalk.cyan(`│   ${skill.description.substring(0, 50)}...`));
    }
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
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
