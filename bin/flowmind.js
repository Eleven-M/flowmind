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
const { execSync } = require('child_process');
const FlowMind = require('../core');
const HonorEngine = require('../core/honor-engine');

// Global error handlers to prevent silent CLI crashes
process.on('uncaughtException', (err) => {
  console.error(chalk.red('\nUncaught Exception:'), err.message);
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('\nUnhandled Rejection:'), reason?.message || reason);
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  process.exit(1);
});

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

/**
 * Dragon Totem ASCII Art by level - Chinese Dragon (中国龙)
 */
function getDragonArt(level) {
  const arts = {
    0: [
      '        ╭─────╮        ',
      '       ╱  ╭─╮  ╲       ',
      '      │  │   │  │      ',
      '      │  │ ◎ │  │      ',
      '      │   ╰─╯   │      ',
      '       ╲       ╱       ',
      '        ╰─────╯        ',
      '      龙 蛋 (Egg)      '
    ],
    1: [
      '           ╭──╮            ',
      '      ╭────╯  ╰───╮        ',
      '     ╱  ◎    ╰─╯   ╲      ',
      '    ╱    ▽           ╲     ',
      '    ╲    ╱╲   ╱╲     ╱     ',
      '     ╲╱╱  ╲╱╱  ╲╱╲╱       ',
      '       幼 龙 (Hatchling)   '
    ],
    2: [
      '        ╭─╮  ╭─╮             ',
      '   ╭────╯ ╰──╯ ╰───╮         ',
      '  ╱  ◎      ╰──╯     ╲       ',
      ' ╱      ╭────────╮     ╲     ',
      ' ╲     ╱ ╱╱╱╱╱╱╱╱ ╲    ╱     ',
      '  ╲───╯ ╱╱╱╱╱╱╱╱╱╱ ╰──╱      ',
      '   ╲   ╱╱╱╱╱╱╱╱╱╱╱╱  ╱       ',
      '    ╰─╯            ╰─╯       ',
      '    少 年 龙 (Juvenile)       '
    ],
    3: [
      '      ╭───╮  ╭───╮               ',
      '  ╭───╯   ╰──╯   ╰───╮           ',
      ' ╱  ◎        ╰───╯     ╲         ',
      '│     ╭──────────╮      │        ',
      '│    ╱ ╱╱╱╱╱╱╱╱╱╱ ╲     │        ',
      ' ╲──╯ ╱╱╱╱╱╱╱╱╱╱╱╱ ╰───╯        ',
      '  ╲  ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ╱         ',
      '   ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱          ',
      '    ╰───╯       ╰───╯            ',
      '    成 年 龙 (Adult)              '
    ],
    4: [
      '    ╭───╮      ╭───╮                 ',
      '╭───╯   ╰──────╯   ╰───╮             ',
      '│  ◎           ╰───╯     │           ',
      '│      ╭────────────╮    │           ',
      '│     ╱ ╱╱╱╱╱╱╱╱╱╱╱╱ ╲   │           ',
      ' ╲───╯ ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ ╰──╯          ',
      '  ╲   ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ╲          ',
      '   ╲─╯╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╰─╲         ',
      '    ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱         ',
      '     ╰───╯         ╰───╯             ',
      '     长 老 龙 (Elder)                 '
    ],
    5: [
      '  ★  ╭───╮          ╭───╮  ★           ',
      '╭─╯   ╰──╯          ╰──╯   ╰─╮         ',
      '│  ◎            ╰───╯         │         ',
      '│       ╭──────────────╮      │         ',
      '│      ╱ ★╱╱╱╱╱╱╱╱╱╱★╱╱ ╲     │         ',
      ' ╲────╯ ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱ ╰───╯         ',
      '  ╲    ╱╱╱╱★╱╱╱╱╱╱╱╱★╱╱╱╱╱  ╲          ',
      '   ╲──╯╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╰──╲         ',
      '    ╲─╯╱╱╱★╱╱╱╱╱╱╱╱★╱╱╱╱╱╰──╲         ',
      '  ★  ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ★       ',
      '       ╰───╯           ╰───╯            ',
      '       升 龙 (Ascended)                 '
    ]
  };
  return arts[level] || arts[0];
}

/**
 * Get dragon color function for a level
 */
function getDragonColor(level) {
  const colors = {
    0: (text) => chalk.gray(text),
    1: (text) => chalk.cyan(text),
    2: (text) => chalk.cyan.bold(text),
    3: (text) => chalk.cyanBright(text),
    4: (text) => chalk.cyanBright.bold(text),
    5: (text) => chalk.cyanBright.bold(text)
  };
  return colors[level] || colors[0];
}

/**
 * Get highlight color for Ascended level
 */
function getHighlightColor(level) {
  if (level >= 5) {
    return (text) => chalk.whiteBright(text);
  }
  return (text) => text;
}

/**
 * Render dragon totem with honor data
 */
function renderDragonTotem(honorData) {
  const info = getLevelInfo(honorData.points);
  const dragonColor = getDragonColor(info.level);
  const highlightColor = getHighlightColor(info.level);
  const art = getDragonArt(info.level);

  // Calculate max art line width for proper padding
  const maxArtWidth = Math.max(...art.map(l => l.length));
  const boxWidth = Math.max(maxArtWidth + 8, 55);

  const border = '─'.repeat(boxWidth - 2);
  const padRight = (text, width) => {
    const padding = Math.max(0, width - text.length);
    return ' '.repeat(padding);
  };

  console.log('');
  console.log(chalk.cyan('  ┌' + border + '┐'));
  console.log(chalk.cyan('  │') + '  🐉 Dragon Totem of Honor  ' + padRight('  🐉 Dragon Totem of Honor  ', boxWidth - 2) + chalk.cyan('│'));
  console.log(chalk.cyan('  ├' + border + '┤'));

  for (const line of art) {
    const padded = '  ' + line + padRight('  ' + line, boxWidth - 2);
    console.log(chalk.cyan('  │') + dragonColor(padded) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('  ├' + border + '┤'));

  const levelLine = `  Level: ${info.level} - ${info.name}`;
  const pointsLine = `  Points: ${honorData.points}`;
  const stateLine = `  State: ${info.state}`;

  console.log(chalk.cyan('  │') + highlightColor(levelLine + padRight(levelLine, boxWidth - 2)) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + highlightColor(pointsLine + padRight(pointsLine, boxWidth - 2)) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + highlightColor(stateLine + padRight(stateLine, boxWidth - 2)) + chalk.cyan('│'));

  if (info.nextLevel) {
    const nextLine = `  Next: ${info.pointsToNext} points to ${info.nextLevelName}`;
    console.log(chalk.cyan('  │') + chalk.gray(nextLine + padRight(nextLine, boxWidth - 2)) + chalk.cyan('│'));
  } else {
    const maxLine = '  Maximum level reached!';
    console.log(chalk.cyan('  │') + chalk.yellow(maxLine + padRight(maxLine, boxWidth - 2)) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('  ├' + border + '┤'));

  const statsTitle = '  Stats:';
  console.log(chalk.cyan('  │') + chalk.white(statsTitle + padRight(statsTitle, boxWidth - 2)) + chalk.cyan('│'));

  const stats1 = `    Skills Used: ${honorData.stats.skillUseCount}`;
  const stats2 = `    New Skills: ${honorData.stats.newSkillCount}`;
  const stats3 = `    Learnings: ${honorData.stats.learningCount}`;

  console.log(chalk.cyan('  │') + chalk.gray(stats1 + padRight(stats1, boxWidth - 2)) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + chalk.gray(stats2 + padRight(stats2, boxWidth - 2)) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + chalk.gray(stats3 + padRight(stats3, boxWidth - 2)) + chalk.cyan('│'));

  console.log(chalk.cyan('  └' + border + '┘'));
  console.log('');
}

/**
 * Get level info for points
 */
function getLevelInfo(points) {
  const levels = [
    { level: 0, minPoints: 0,   name: 'Egg',       state: 'dormant' },
    { level: 1, minPoints: 1,   name: 'Hatchling',  state: 'awakening' },
    { level: 2, minPoints: 10,  name: 'Juvenile',   state: 'growing' },
    { level: 3, minPoints: 30,  name: 'Adult',       state: 'soaring' },
    { level: 4, minPoints: 60,  name: 'Elder',       state: 'wise' },
    { level: 5, minPoints: 100, name: 'Ascended',   state: 'transcendent' }
  ];

  let current = levels[0];
  let next = levels[1];

  for (const tier of levels) {
    if (points >= tier.minPoints) {
      current = tier;
      next = levels[tier.level + 1] || null;
    }
  }

  return {
    level: current.level,
    name: current.name,
    state: current.state,
    nextLevel: next ? next.level : null,
    nextLevelName: next ? next.name : null,
    pointsToNext: next ? next.minPoints - points : 0
  };
}

/**
 * Get hint for next level
 */
function getNextLevelHint(points) {
  const info = getLevelInfo(points);
  if (info.nextLevel) {
    return `Earn ${info.pointsToNext} more points to reach ${info.nextLevelName} (Level ${info.nextLevel})`;
  }
  return 'You have reached the maximum dragon level!';
}

/**
 * Publish honor data
 */
async function publishHonor(options) {
  const configDir = path.join(process.env.HOME || process.env.USERPROFILE, '.flowmind');
  const honorPath = path.join(configDir, 'honor.json');

  if (!await fs.pathExists(honorPath)) {
    console.error(chalk.red('No honor data found. Run flowmind init first.'));
    return;
  }

  const honorData = await fs.readJson(honorPath);
  const info = getLevelInfo(honorData.points);

  const exportData = {
    version: honorData.version,
    points: honorData.points,
    level: info.level,
    levelName: info.name,
    state: info.state,
    stats: honorData.stats,
    knownSkillsCount: honorData.knownSkills ? honorData.knownSkills.length : 0,
    recentHistory: (honorData.history || []).slice(-20),
    exportedAt: new Date().toISOString()
  };

  // Export to local JSON file
  const outputPath = options.output || 'flowmind-honor.json';
  await fs.writeJson(outputPath, exportData, { spaces: 2 });
  console.log(chalk.green(`✓ Honor data exported to: ${outputPath}`));

  // Create GitHub Gist if requested
  if (options.gist) {
    try {
      // Check if gh CLI is available
      try {
        execSync('gh --version', { stdio: 'ignore' });
      } catch {
        console.error(chalk.red('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/'));
        return;
      }

      const gistContent = JSON.stringify(exportData, null, 2);
      const gistDescription = `FlowMind Honor: Level ${info.level} (${info.name}) - ${honorData.points} points`;

      // Create gist using gh CLI
      const gistCommand = `gh gist create --public --desc "${gistDescription}" --filename "flowmind-honor.json" - <<< '${gistContent.replace(/'/g, "'\\''")}'`;

      const gistUrl = execSync(gistCommand, { encoding: 'utf-8' }).trim();
      console.log(chalk.green(`✓ GitHub Gist created: ${gistUrl}`));
    } catch (error) {
      console.error(chalk.red(`Failed to create Gist: ${error.message}`));
    }
  }
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
  .option('--ai <provider>', 'Initialize with AI provider (openai/anthropic/glm/mimo/qwen/ernie/deepseek/ollama)')
  .action(async (options) => {
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
          version: '1.1.0',
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

      // Initialize AI if requested
      if (options.ai) {
        spinner.text = 'Configuring AI provider...';
        const aiConfigPath = path.join(configDir, 'ai-config.json');

        let aiConfig = {};
        if (await fs.pathExists(aiConfigPath)) {
          aiConfig = await fs.readJson(aiConfigPath);
        }

        // Set default provider
        aiConfig.ai = aiConfig.ai || {};
        aiConfig.ai.defaultProvider = options.ai;
        aiConfig.ai.enabled = true;

        // Prompt for API key based on provider
        const apiKeyProviders = {
          'openai': { key: 'apiKey', message: 'Enter OpenAI API key:', env: 'OPENAI_API_KEY' },
          'anthropic': { key: 'apiKey', message: 'Enter Anthropic API key:', env: 'ANTHROPIC_API_KEY' },
          'glm': { key: 'apiKey', message: 'Enter Zhipu AI API key:', env: 'ZHIPU_API_KEY' },
          'mimo': { key: 'apiKey', message: 'Enter MiMo API key:', env: 'MIMO_API_KEY' },
          'qwen': { key: 'apiKey', message: 'Enter DashScope API key:', env: 'DASHSCOPE_API_KEY' },
          'ernie': { key: 'apiKey', message: 'Enter Baidu API key:', env: 'BAIDU_API_KEY' },
          'deepseek': { key: 'apiKey', message: 'Enter DeepSeek API key:', env: 'DEEPSEEK_API_KEY' }
        };

        const providerConfig = apiKeyProviders[options.ai];
        if (providerConfig) {
          const { apiKey } = await inquirer.prompt([
            {
              type: 'password',
              name: 'apiKey',
              message: providerConfig.message,
              mask: '*'
            }
          ]);

          aiConfig.ai.providers = aiConfig.ai.providers || {};
          aiConfig.ai.providers[options.ai] = {
            ...aiConfig.ai.providers[options.ai],
            apiKey: apiKey,
            enabled: true
          };

          // For ERNIE, also prompt for secret key
          if (options.ai === 'ernie') {
            const { secretKey } = await inquirer.prompt([
              {
                type: 'password',
                name: 'secretKey',
                message: 'Enter Baidu Secret key:',
                mask: '*'
              }
            ]);
            aiConfig.ai.providers[options.ai].secretKey = secretKey;
          }
        }

        await fs.writeJson(aiConfigPath, aiConfig, { spaces: 2 });
        console.log(chalk.green(`\n✓ AI provider configured: ${options.ai}`));
      }

      spinner.succeed('FlowMind initialized successfully!');

      console.log(chalk.green('\n✓ Configuration created at:'), configDir);
      console.log(chalk.green('✓ Learning system ready'));
      console.log(chalk.green('✓ Scene mapping ready'));

      if (options.ai) {
        console.log(chalk.green(`✓ AI provider configured: ${options.ai}`));
      }

      console.log(chalk.cyan('\nNext steps:'));
      console.log('  1. Run', chalk.yellow('flowmind'), 'to start interactive mode');
      console.log('  2. Or use', chalk.yellow('flowmind "your request"'), 'for single commands');
      console.log('  3. FlowMind will learn from your corrections automatically');

      if (!options.ai) {
        console.log(chalk.cyan('\nTo enable AI features:'));
        console.log('  Run', chalk.yellow('flowmind init --ai openai'), 'or', chalk.yellow('flowmind init --ai anthropic'));
        console.log('  Or configure manually:', chalk.yellow('~/.flowmind/ai-config.json'));
      }

      // Award honor point for init
      try {
        const honorEngine = new HonorEngine({ get: (key, def) => def });
        honorEngine.honorPath = path.join(configDir, 'honor.json');
        await honorEngine.init();
        await honorEngine.award('init', 'FlowMind initialized');
        console.log(chalk.green('\n✓ Honor system activated (+1 point)'));
      } catch (honorError) {
        // Non-blocking
      }

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

// Honor command
program
  .command('honor')
  .description('Show honor points and dragon totem')
  .option('-j, --json', 'Output as JSON')
  .option('-p, --publish', 'Export honor data to JSON file')
  .option('-g, --gist', 'Create GitHub Gist (with --publish)')
  .option('-o, --output <file>', 'Output file path (default: flowmind-honor.json)')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();
      const honorData = fm.getHonorData();

      if (options.json) {
        console.log(JSON.stringify(honorData, null, 2));
      } else if (options.publish) {
        await publishHonor({ output: options.output, gist: options.gist });
      } else {
        renderDragonTotem(honorData);
        console.log(chalk.gray(`  ${getNextLevelHint(honorData.points)}`));
      }
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

// AI command
program
  .command('ai')
  .description('Manage AI model configuration')
  .option('-s, --status', 'Show AI model status')
  .option('-l, --list', 'List available providers')
  .option('-c, --config', 'Show AI configuration')
  .option('-t, --test [provider]', 'Test AI provider connection')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();

      if (options.status) {
        const status = fm.getAIStatus();
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          displayAIStatus(status);
        }
      } else if (options.list) {
        const status = fm.getAIStatus();
        const providers = Object.entries(status.providers).map(([name, info]) => ({
          name,
          ...info
        }));
        if (options.json) {
          console.log(JSON.stringify({ providers }, null, 2));
        } else {
          console.log(chalk.cyan('\nAI Providers:'));
          for (const provider of providers) {
            const status = provider.initialized ? chalk.green('✓') : chalk.red('✗');
            console.log(`  ${status} ${provider.name}`);
            if (provider.info?.model) {
              console.log(`    Model: ${provider.info.model}`);
            }
          }
        }
      } else if (options.config) {
        const config = fm.config.get('ai', {});
        if (options.json) {
          console.log(JSON.stringify({ ai: config }, null, 2));
        } else {
          console.log(chalk.cyan('\nAI Configuration:'));
          console.log(JSON.stringify(config, null, 2));
        }
      } else if (options.test !== undefined) {
        const providerName = options.test || fm.ai.defaultProvider;
        const provider = fm.ai.getProvider(providerName);
        if (!provider) {
          console.error(chalk.red(`Provider not found: ${providerName}`));
          return;
        }
        console.log(chalk.cyan(`\nTesting ${providerName}...`));
        try {
          const result = await provider.complete('Hello, this is a test.', { maxTokens: 50 });
          console.log(chalk.green('✓ Connection successful'));
          console.log(chalk.white('Response:'), result.substring(0, 100) + '...');
        } catch (error) {
          console.log(chalk.red('✗ Connection failed'));
          console.error(chalk.red(error.message));
        }
      } else {
        // Default to status
        const status = fm.getAIStatus();
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          displayAIStatus(status);
        }
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

function displayAIStatus(status) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ AI Model Status                                     │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  const initialized = status.initialized ? chalk.green('✓') : chalk.red('✗');
  console.log(chalk.cyan(`│ Initialized: ${initialized}`));
  console.log(chalk.cyan(`│ Default Provider: ${status.defaultProvider || 'None'}`));

  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ Features:'));

  const features = status.features || {};
  for (const [feature, enabled] of Object.entries(features)) {
    const statusIcon = enabled ? chalk.green('✓') : chalk.red('✗');
    console.log(chalk.cyan(`│   ${statusIcon} ${feature}`));
  }

  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ Providers:'));

  const providers = status.providers || {};
  for (const [name, info] of Object.entries(providers)) {
    const statusIcon = info.initialized ? chalk.green('✓') : chalk.red('✗');
    console.log(chalk.cyan(`│   ${statusIcon} ${name}`));
    if (info.info?.model) {
      console.log(chalk.cyan(`│     Model: ${info.info.model}`));
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

// TUI command - Rich terminal interface using Ink
program
  .command('tui')
  .description('Launch enhanced TUI with split panels, skill browser, and dragon display')
  .action(async () => {
    let stdinWrapper = null;
    try {
      // Register .jsx extension for CJS
      require('module')._extensions['.jsx'] = require('module')._extensions['.js'];

      const React = require('react');
      const { render } = require('ink');
      const { PassThrough } = require('stream');
      const App = require('../tui/app.jsx');

      const fm = await initFlowMind();

      // Create a stdin wrapper to handle non-TTY environments (e.g., piped stdin).
      // Ink v3's useInput hook calls setRawMode(true) which throws if stdin is not a TTY.
      const realStdin = process.stdin;
      stdinWrapper = new PassThrough();
      stdinWrapper.isTTY = true;
      stdinWrapper.isRaw = false;
      stdinWrapper.setRawMode = (mode) => {
        try {
          if (realStdin.setRawMode) {
            realStdin.setRawMode(mode);
          }
        } catch (e) {
          // Suppress raw mode errors in non-TTY environments
        }
        return stdinWrapper;
      };
      // Forward real stdin data to the wrapper
      if (realStdin.readable) {
        realStdin.on('data', (chunk) => {
          if (!stdinWrapper.destroyed) stdinWrapper.write(chunk);
        });
      }

      const { unmount, waitUntilExit } = render(
        React.createElement(App, { flowmind: fm }),
        { stdin: stdinWrapper }
      );
      await waitUntilExit();
      unmount();
    } catch (error) {
      console.error(chalk.red('TUI Error:'), error.message);
      if (error.message.includes('Cannot find module')) {
        console.log(chalk.yellow('Try running: npm install ink@3 react ink-text-input ink-spinner'));
      }
    } finally {
      if (stdinWrapper && !stdinWrapper.destroyed) {
        stdinWrapper.destroy();
      }
    }
  });

// Dashboard command - Hybrid monitoring dashboard
program
  .command('dashboard')
  .description('Launch real-time monitoring dashboard for MCP activity and events')
  .action(async () => {
    let stdinWrapper = null;
    try {
      // Register .jsx extension for CJS
      require('module')._extensions['.jsx'] = require('module')._extensions['.js'];

      const React = require('react');
      const { render } = require('ink');
      const { PassThrough } = require('stream');
      const DashboardApp = require('../dashboard/app.jsx');
      const eventBus = require('../core/event-bus');

      const fm = await initFlowMind();

      // Create a stdin wrapper to handle non-TTY environments
      const realStdin = process.stdin;
      stdinWrapper = new PassThrough();
      stdinWrapper.isTTY = true;
      stdinWrapper.isRaw = false;
      stdinWrapper.setRawMode = (mode) => {
        try {
          if (realStdin.setRawMode) {
            realStdin.setRawMode(mode);
          }
        } catch (e) {
          // Suppress raw mode errors in non-TTY environments
        }
        return stdinWrapper;
      };
      if (realStdin.readable) {
        realStdin.on('data', (chunk) => {
          if (!stdinWrapper.destroyed) stdinWrapper.write(chunk);
        });
      }

      const { unmount, waitUntilExit } = render(
        React.createElement(DashboardApp, { flowmind: fm, eventBus }),
        { stdin: stdinWrapper }
      );
      await waitUntilExit();
      unmount();
    } catch (error) {
      console.error(chalk.red('Dashboard Error:'), error.message);
      if (error.message.includes('Cannot find module')) {
        console.log(chalk.yellow('Try running: npm install ink@3 react'));
      }
    } finally {
      if (stdinWrapper && !stdinWrapper.destroyed) {
        stdinWrapper.destroy();
      }
    }
  });

// Update command - Auto-update flowmind
program
  .command('update')
  .description('Update FlowMind to the latest version')
  .option('--check', 'Only check for updates, do not install')
  .action(async (options) => {
    const { execSync } = require('child_process');
    const currentVersion = packageJson.version;

    console.log(chalk.cyan(`\nCurrent version: ${currentVersion}`));

    try {
      // Check latest version on npm
      const latestVersion = execSync('npm view flowmind version', { encoding: 'utf-8' }).trim();
      console.log(chalk.cyan(`Latest version:  ${latestVersion}`));

      if (currentVersion === latestVersion) {
        console.log(chalk.green('\n✓ You are already on the latest version!'));
        return;
      }

      // Compare versions
      const parse = (v) => v.split('.').map(Number);
      const curr = parse(currentVersion);
      const latest = parse(latestVersion);
      const isNewer = latest[0] > curr[0] || (latest[0] === curr[0] && latest[1] > curr[1]) || (latest[0] === curr[0] && latest[1] === curr[1] && latest[2] > curr[2]);

      if (!isNewer) {
        console.log(chalk.green('\n✓ You are on a newer version than npm latest.'));
        return;
      }

      console.log(chalk.yellow(`\n⬆ Update available: ${currentVersion} → ${latestVersion}`));

      if (options.check) {
        console.log(chalk.cyan('\nRun `flowmind update` to install.'));
        return;
      }

      // Detect install method
      const isGlobal = (() => {
        try {
          const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
          const localPath = require.resolve('../package.json');
          return localPath.startsWith(globalRoot);
        } catch { return false; }
      })();

      const installCmd = isGlobal
        ? `npm install -g flowmind@${latestVersion}`
        : `npm install flowmind@${latestVersion}`;

      console.log(chalk.cyan(`\nInstalling: ${installCmd}`));
      const spinner = ora('Updating FlowMind...').start();

      try {
        execSync(installCmd, { encoding: 'utf-8', stdio: 'pipe' });
        spinner.succeed(`FlowMind updated to ${latestVersion}!`);

        console.log(chalk.green('\n✓ Update complete!'));
        console.log(chalk.gray('  Run `flowmind --version` to verify.'));
      } catch (installError) {
        spinner.fail('Update failed');
        console.error(chalk.red('\nInstall error:'), installError.message);
        console.log(chalk.yellow('\nTry manually:'));
        console.log(chalk.white(`  ${installCmd}`));
      }

    } catch (error) {
      console.error(chalk.red('Failed to check for updates:'), error.message);
      console.log(chalk.yellow('\nYou can manually update with:'));
      console.log(chalk.white('  npm install -g flowmind@latest'));
    }
  });

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
