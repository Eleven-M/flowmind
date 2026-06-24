/**
 * FlowMind Skill Loader
 * Manages skill discovery, loading, and execution
 */

const fs = require('fs-extra');
const path = require('path');

class SkillLoader {
  constructor(config, learning, componentRegistry = null) {
    this.config = config;
    this.learning = learning;
    this.componentRegistry = componentRegistry;
    this.skills = new Map();
    this.skillPath = config.get('skills.path', path.join(__dirname, '..', 'skills'));
  }

  /**
   * Load all skills
   */
  async loadAll() {
    const skillsDir = this.skillPath;

    if (!await fs.pathExists(skillsDir)) {
      console.warn(`Skills directory not found: ${skillsDir}`);
      return;
    }

    const entries = await fs.readdir(skillsDir);

    for (const entry of entries) {
      const skillDir = path.join(skillsDir, entry);
      const stat = await fs.stat(skillDir);

      if (stat.isDirectory()) {
        await this.loadSkill(entry, skillDir);
      }
    }

    return Array.from(this.skills.values());
  }

  /**
   * Load a single skill
   */
  async loadSkill(name, skillDir) {
    try {
      // Load skill definition
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      const definition = await this.loadSkillDefinition(skillMdPath);

      // Load skill implementation
      const indexPath = path.join(skillDir, 'index.js');
      let implementation = {};

      if (await fs.pathExists(indexPath)) {
        implementation = require(indexPath);
      }

      // Create skill object
      const skill = {
        name: name,
        path: skillDir,
        definition: definition,
        ...implementation,
        canHandle: implementation.canHandle || this.createDefaultCanHandle(definition),
        execute: implementation.execute || this.createDefaultExecute(definition)
      };

      this.skills.set(name, skill);
      return skill;
    } catch (error) {
      console.error(`Failed to load skill ${name}:`, error.message);
      return null;
    }
  }

  /**
   * Load skill definition from SKILL.md
   */
  async loadSkillDefinition(filePath) {
    if (!await fs.pathExists(filePath)) {
      return {};
    }

    const content = await fs.readFile(filePath, 'utf-8');

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return { raw: content };
    }

    const frontmatter = frontmatterMatch[1];
    const definition = {};

    // Parse YAML-like frontmatter
    const lines = frontmatter.split('\n');
    let currentKey = null;
    let currentObj = null;

    for (const line of lines) {
      // Top-level key: value
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const key = match[1];
        const value = match[2].replace(/^["']|["']$/g, '');
        definition[key] = value;
        currentKey = key;
        currentObj = null;
        continue;
      }

      // Nested object (e.g., metadata:)
      const nestedMatch = line.match(/^(\w+):\s*$/);
      if (nestedMatch) {
        currentKey = nestedMatch[1];
        definition[currentKey] = {};
        currentObj = definition[currentKey];
        continue;
      }

      // Nested key: value (indented)
      const nestedValueMatch = line.match(/^\s+(\w+):\s*(.+)$/);
      if (nestedValueMatch && currentObj) {
        currentObj[nestedValueMatch[1]] = nestedValueMatch[2].replace(/^["']|["']$/g, '');
        continue;
      }
    }

    // Parse YAML list fields (componentDependencies, etc.)
    const listFieldMatch = frontmatter.match(/componentDependencies:\s*\n((?:\s+-\s+.+\n?)*)/);
    if (listFieldMatch) {
      definition.componentDependencies = listFieldMatch[1]
        .split('\n')
        .map(line => line.match(/^\s+-\s+(.+)$/))
        .filter(Boolean)
        .map(m => m[1].trim());
    }

    // Extract trigger patterns
    const triggerMatch = content.match(/## Trigger Patterns\n([\s\S]*?)(?=\n##|$)/);
    if (triggerMatch) {
      definition.triggers = this.extractTriggers(triggerMatch[1]);
    }

    return definition;
  }

  /**
   * Extract trigger patterns from markdown
   */
  extractTriggers(section) {
    const triggers = [];
    const lines = section.split('\n');

    for (const line of lines) {
      // Match quoted strings
      const matches = line.match(/"([^"]+)"|'([^']+)'|`([^`]+)`/g);
      if (matches) {
        triggers.push(...matches.map(m => m.replace(/["'`]/g, '')));
      }
    }

    return triggers;
  }

  /**
   * Create default canHandle function from definition
   */
  createDefaultCanHandle(definition) {
    const triggers = definition.triggers || [];

    return (input, context) => {
      if (!input) return false;

      const inputLower = input.toLowerCase();

      for (const trigger of triggers) {
        if (inputLower.includes(trigger.toLowerCase())) {
          return true;
        }
      }

      return false;
    };
  }

  /**
   * Create default execute function from definition
   */
  createDefaultExecute(definition) {
    const registry = this.componentRegistry;
    return async (input, context) => {
      // Enrich context with component registry info
      const enrichedContext = { ...context };
      if (registry) {
        enrichedContext.componentRegistry = registry;
        // Add resolved MCP server info for skills that declare component dependencies
        const componentDeps = definition.componentDependencies || [];
        enrichedContext.resolvedComponents = {};
        for (const dep of componentDeps) {
          const adapter = registry.getAdapter(dep);
          if (adapter) {
            enrichedContext.resolvedComponents[dep] = {
              provider: registry.getActiveProvider(dep),
              mcpServer: adapter.mcpServer,
              tools: adapter.getProvidedTools()
            };
          }
        }
      }

      return {
        skill: definition.name,
        input: input,
        context: enrichedContext,
        message: `Executed skill: ${definition.name || 'unknown'}`,
        timestamp: new Date().toISOString()
      };
    };
  }

  /**
   * Select best skill for input
   */
  async select(input, context = {}) {
    const candidates = [];

    for (const [name, skill] of this.skills) {
      try {
        const canHandle = await skill.canHandle(input, context);
        if (canHandle) {
          candidates.push({
            skill: skill,
            score: this.calculateSkillScore(skill, input, context)
          });
        }
      } catch (error) {
        // Skip skills that error on canHandle
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score);

    return candidates[0].skill;
  }

  /**
   * Calculate skill score for selection
   */
  calculateSkillScore(skill, input, context) {
    let score = 0;

    // Base score for matching
    score += 10;

    // Bonus for trigger specificity
    const triggers = skill.definition?.triggers || [];
    for (const trigger of triggers) {
      if (input.toLowerCase().includes(trigger.toLowerCase())) {
        score += 5;
      }
    }

    // Bonus for recent successful use
    const bindings = this.learning?.skillBindings?.bindings?.[skill.name];
    if (bindings) {
      score += Math.min(bindings.learningCount, 10);
    }

    return score;
  }

  /**
   * Get skill by name
   */
  get(name) {
    return this.skills.get(name);
  }

  /**
   * List all loaded skills
   */
  list() {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.definition?.description,
      category: s.definition?.category || s.definition?.metadata?.category,
      version: s.definition?.version || s.definition?.metadata?.version,
      author: s.definition?.author || s.definition?.metadata?.author,
      path: s.path
    }));
  }

  /**
   * Reload a skill
   */
  async reload(name) {
    const skill = this.skills.get(name);
    if (!skill) return null;

    return await this.loadSkill(name, skill.path);
  }

  /**
   * Check if skill exists
   */
  has(name) {
    return this.skills.has(name);
  }
}

module.exports = SkillLoader;
