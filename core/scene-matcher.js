/**
 * FlowMind Scene Matcher
 * Matches user input to scene workflows
 */

const fs = require('fs-extra');
const path = require('path');
const { expandPath } = require('./utils');

class SceneMatcher {
  constructor(config, learning) {
    this.config = config;
    this.learning = learning;
    this.scenes = [];
    this.initialized = false;
  }

  /**
   * Load scenes from storage
   */
  async loadScenes() {
    const learningPath = this.config.get('learning.storagePath', '~/.flowmind/learning');
    const scenesPath = path.join(this.expandPath(learningPath), 'scenes.json');

    if (await fs.pathExists(scenesPath)) {
      const data = await fs.readJson(scenesPath);
      this.scenes = data.mappings || [];
    }

    // Add built-in scenes
    this.scenes.push(...this.getBuiltInScenes());

    this.initialized = true;
    return this.scenes;
  }

  /**
   * Get built-in scene mappings
   */
  getBuiltInScenes() {
    return [
      {
        id: 'builtin-log-trace',
        name: 'Trace Log Query',
        keywords: ['traceId', '链路', 'trace', '调用链', '日志'],
        patterns: [
          /查询.*traceId/i,
          /查看.*链路/i,
          /traceId.*分析/i,
          /查询.*日志/i
        ],
        workflow: {
          skills: [
            { skill: 'log-audit', params: { action: 'query-trace' } }
          ]
        },
        preferences: {
          outputFormat: 'sequential-list'
        },
        stats: { useCount: 0, successRate: 1.0 }
      },
      {
        id: 'builtin-log-error',
        name: 'Error Log Query',
        keywords: ['错误日志', '异常日志', 'error', 'exception'],
        patterns: [
          /查看.*错误日志/i,
          /查询.*异常/i,
          /error.*log/i
        ],
        workflow: {
          skills: [
            { skill: 'log-audit', params: { action: 'query-errors' } }
          ]
        },
        preferences: {},
        stats: { useCount: 0, successRate: 1.0 }
      },
      {
        id: 'builtin-code-review',
        name: 'Code Review',
        keywords: ['代码审查', 'review', 'PR', '代码质量'],
        patterns: [
          /审查.*代码/i,
          /review.*PR/i,
          /代码.*检查/i
        ],
        workflow: {
          skills: [
            { skill: 'code-review', params: {} }
          ]
        },
        preferences: {},
        stats: { useCount: 0, successRate: 1.0 }
      },
      {
        id: 'builtin-data-validation',
        name: 'Data Validation',
        keywords: ['数据验证', '数据检查', '验证', '逻辑验证'],
        patterns: [
          /验证.*数据/i,
          /检查.*逻辑/i,
          /数据.*正确/i
        ],
        workflow: {
          skills: [
            { skill: 'data-validation', params: {} }
          ]
        },
        preferences: {},
        stats: { useCount: 0, successRate: 1.0 }
      }
    ];
  }

  /**
   * Match input to scenes
   */
  async match(input) {
    if (!this.initialized) {
      await this.loadScenes();
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const scene of this.scenes) {
      const score = this.calculateScore(input, scene);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = scene;
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      return {
        scene: bestMatch,
        confidence: bestScore,
        params: this.extractParams(input, bestMatch)
      };
    }

    return null;
  }

  /**
   * Calculate match score
   */
  calculateScore(input, scene) {
    const weights = this.config.get('sceneMapping.weights', {
      keywordMatch: 0.4,
      patternMatch: 0.3,
      historyScore: 0.2,
      confidence: 0.1
    });

    // Keyword matching
    const keywordScore = this.matchKeywords(input, scene.keywords) * weights.keywordMatch;

    // Pattern matching
    const patternScore = this.matchPatterns(input, scene.patterns) * weights.patternMatch;

    // History score (based on usage)
    const historyScore = Math.min((scene.stats?.useCount || 0) / 10, 1) * weights.historyScore;

    // Confidence score (based on success rate)
    const confidenceScore = (scene.stats?.successRate || 0.5) * weights.confidence;

    return keywordScore + patternScore + historyScore + confidenceScore;
  }

  /**
   * Match keywords
   */
  matchKeywords(input, keywords) {
    if (!keywords || keywords.length === 0) return 0;

    const inputLower = input.toLowerCase();
    let matchCount = 0;

    for (const keyword of keywords) {
      if (inputLower.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    return matchCount / keywords.length;
  }

  /**
   * Match patterns
   */
  matchPatterns(input, patterns) {
    if (!patterns || patterns.length === 0) return 0;

    let matchCount = 0;

    for (const pattern of patterns) {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
      if (regex.test(input)) {
        matchCount++;
      }
    }

    return matchCount / patterns.length;
  }

  /**
   * Extract parameters from input
   */
  extractParams(input, scene) {
    const params = {};

    // Extract trace ID
    const traceMatch = input.match(/traceId\s*[:：]\s*(\w+)|traceId\s+(\w+)/i);
    if (traceMatch) {
      params.traceId = traceMatch[1] || traceMatch[2];
    }

    // Extract service name
    const serviceMatch = input.match(/service\s*[:：]\s*(\w+)|(\w+)-service/i);
    if (serviceMatch) {
      params.service = serviceMatch[1] || serviceMatch[2];
    }

    // Extract time range
    const timeMatch = input.match(/最近(\d+)(小时|天|分钟)/);
    if (timeMatch) {
      params.timeRange = {
        value: parseInt(timeMatch[1]),
        unit: timeMatch[2]
      };
    }

    return params;
  }

  /**
   * Update scene usage stats
   */
  async updateSceneStats(sceneId, success) {
    const scene = this.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    scene.stats.useCount++;
    scene.stats.lastUsed = new Date().toISOString();

    if (!success) {
      const total = scene.stats.useCount;
      const successes = total * scene.stats.successRate;
      scene.stats.successRate = (successes) / total;
    }

    // Save updated scenes
    await this.saveScenes();
  }

  /**
   * Save scenes to storage
   */
  async saveScenes() {
    const learningPath = this.config.get('learning.storagePath', '~/.flowmind/learning');
    const scenesPath = path.join(this.expandPath(learningPath), 'scenes.json');

    const data = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      mappings: this.scenes.filter(s => !s.id.startsWith('builtin-'))
    };

    await fs.writeJson(scenesPath, data, { spaces: 2 });
  }

  /**
   * Add custom scene
   */
  async addScene(scene) {
    const newScene = {
      id: `scene-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...scene,
      stats: {
        useCount: 0,
        lastUsed: null,
        successRate: 1.0
      }
    };

    this.scenes.push(newScene);
    await this.saveScenes();

    return newScene;
  }

  /**
   * Remove scene
   */
  async removeScene(sceneId) {
    this.scenes = this.scenes.filter(s => s.id !== sceneId);
    await this.saveScenes();
  }

  /**
   * List all scenes
   */
  listScenes() {
    return this.scenes.map(s => ({
      id: s.id,
      name: s.name,
      keywords: s.keywords,
      useCount: s.stats?.useCount || 0
    }));
  }

  /**
   * Helper to expand path
   */
  expandPath(filePath) {
    return expandPath(filePath);
  }
}

module.exports = SceneMatcher;
