/**
 * FlowMind Honor Engine
 * Tracks honor points earned through usage and manages dragon totem levels
 */

const fs = require('fs-extra');
const path = require('path');
const eventBus = require('./event-bus');

const HONOR_POINTS = {
  init: 1,
  skill_use: 1,
  new_skill: 2,
  learning: 3
};

const DRAGON_LEVELS = [
  { level: 0, minPoints: 0,  name: 'Egg',       state: 'dormant' },
  { level: 1, minPoints: 1,  name: 'Hatchling',  state: 'awakening' },
  { level: 2, minPoints: 10, name: 'Juvenile',   state: 'growing' },
  { level: 3, minPoints: 30, name: 'Adult',       state: 'soaring' },
  { level: 4, minPoints: 60, name: 'Elder',       state: 'wise' },
  { level: 5, minPoints: 100, name: 'Ascended',   state: 'transcendent' }
];

class HonorEngine {
  constructor(config) {
    this.config = config;
    this.honorPath = path.join(
      config.get('storagePath') || path.join(process.env.HOME || process.env.USERPROFILE, '.flowmind'),
      'honor.json'
    );
    this.skillsPath = config.get('skills.path', path.join(__dirname, '..', 'skills'));
    this.data = null;
    this.initialized = false;
  }

  /**
   * Initialize honor engine
   */
  async init() {
    try {
      if (await fs.pathExists(this.honorPath)) {
        this.data = await fs.readJson(this.honorPath);
      } else {
        this.data = this.createDefaultData();
        // Seed knownSkills by scanning skills/ directory
        await this.seedKnownSkills();
        await this.save();
      }
      this.initialized = true;
    } catch (error) {
      console.warn('HonorEngine init failed, using defaults:', error.message);
      this.data = this.createDefaultData();
      this.initialized = true;
    }
  }

  /**
   * Create default honor data structure
   */
  createDefaultData() {
    return {
      version: '1.0',
      points: 0,
      level: 0,
      history: [],
      knownSkills: [],
      stats: {
        initCount: 0,
        skillUseCount: 0,
        newSkillCount: 0,
        learningCount: 0
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Seed knownSkills by scanning skills/ directory
   */
  async seedKnownSkills() {
    try {
      if (await fs.pathExists(this.skillsPath)) {
        const entries = await fs.readdir(this.skillsPath);
        for (const entry of entries) {
          const fullPath = path.join(this.skillsPath, entry);
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            this.data.knownSkills.push(entry);
          }
        }
      }
    } catch (error) {
      console.warn('HonorEngine seedKnownSkills failed:', error.message);
    }
  }

  /**
   * Award honor points for an action
   */
  async award(action, description) {
    if (!this.initialized) await this.init();

    try {
      const points = HONOR_POINTS[action] || 0;
      if (points === 0) return;

      // Check init action: only award once
      if (action === 'init' && this.data.stats.initCount > 0) {
        return;
      }

      // Award points
      this.data.points += points;
      this.data.level = this.getLevel(this.data.points);

      // Update stats
      const statKey = `${action}Count`;
      if (this.data.stats[statKey] !== undefined) {
        this.data.stats[statKey]++;
      }

      // Add to history
      this.data.history.push({
        action,
        points,
        description,
        timestamp: new Date().toISOString()
      });

      // Keep history to last 100 entries
      if (this.data.history.length > 100) {
        this.data.history = this.data.history.slice(-100);
      }

      this.data.lastUpdated = new Date().toISOString();
      await this.save();

      // Emit honor event for TUI/dashboard monitoring
      eventBus.emit('honor:awarded', {
        action,
        points,
        description,
        level: this.data.level,
        levelName: this.getLevelName(this.data.level),
        total: this.data.points,
        timestamp: this.data.lastUpdated
      });
    } catch (error) {
      console.warn('HonorEngine award failed:', error.message);
    }
  }

  /**
   * Check if a skill name is already known
   */
  isKnownSkill(name) {
    return this.data && this.data.knownSkills.includes(name);
  }

  /**
   * Add a skill to the known list
   */
  async addKnownSkill(name) {
    if (!this.initialized) await this.init();
    try {
      if (!this.data.knownSkills.includes(name)) {
        this.data.knownSkills.push(name);
        await this.save();
      }
    } catch (error) {
      console.warn('HonorEngine addKnownSkill failed:', error.message);
    }
  }

  /**
   * Get the honor data
   */
  getData() {
    return this.data || this.createDefaultData();
  }

  /**
   * Get level for a given point total
   */
  getLevel(points) {
    let level = 0;
    for (const tier of DRAGON_LEVELS) {
      if (points >= tier.minPoints) {
        level = tier.level;
      }
    }
    return level;
  }

  /**
   * Get level name for a given level number
   */
  getLevelName(level) {
    const tier = DRAGON_LEVELS.find(t => t.level === level);
    return tier ? tier.name : 'Unknown';
  }

  /**
   * Get level info including next level hint
   */
  getLevelInfo(points) {
    const level = this.getLevel(points);
    const currentTier = DRAGON_LEVELS.find(t => t.level === level);
    const nextTier = DRAGON_LEVELS.find(t => t.level === level + 1);

    return {
      level,
      name: currentTier.name,
      state: currentTier.state,
      points,
      nextLevel: nextTier ? nextTier.level : null,
      nextLevelName: nextTier ? nextTier.name : null,
      pointsToNext: nextTier ? nextTier.minPoints - points : 0
    };
  }

  /**
   * Export honor data for publishing
   */
  exportForPublish() {
    const info = this.getLevelInfo(this.data.points);
    return {
      version: this.data.version,
      points: this.data.points,
      level: info.level,
      levelName: info.name,
      state: info.state,
      stats: this.data.stats,
      knownSkillsCount: this.data.knownSkills.length,
      recentHistory: this.data.history.slice(-20),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Save honor data to disk
   */
  async save() {
    try {
      await fs.ensureDir(path.dirname(this.honorPath));
      await fs.writeJson(this.honorPath, this.data, { spaces: 2 });
    } catch (error) {
      console.warn('HonorEngine save failed:', error.message);
    }
  }
}

module.exports = HonorEngine;
