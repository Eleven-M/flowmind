/**
 * FlowMind Entity Memory
 * Lightweight cross-skill entity memory: services, traces, and business
 * objects observed in skill results are merged into a small on-disk store
 * so unrelated skills can reuse them (e.g. auto-flow pipeline mappings
 * feeding log-audit SLS resolution).
 */

const fs = require('fs-extra');
const path = require('path');
const { expandPath } = require('./utils');
const { bigramDice, PersistThrottler } = require('./learning-engine');
const { writeJsonAtomic } = require('./atomic-file');

const ENTITY_TYPES = new Set(['service', 'trace', 'business']);
const DEFAULT_MAX_ENTITIES = 500;

function defaultStore() {
  return { version: '1.0', entities: [], lastUpdated: null };
}

function normalizeEnvToken(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === '测试') return 'test';
  if (normalized === '预发') return 'uat';
  if (normalized === '灰度') return 'gray';
  if (/^(生产|线上|正式)$/.test(normalized)) return 'prod';
  return normalized;
}

function entityId(type, name, env) {
  return `${type}|${String(name).toLowerCase()}|${env || ''}`;
}

class EntityMemory {
  /**
   * @param {object} config ConfigManager instance
   * @param {object|null} writeQueue shared learning WriteQueue for serialization
   * @param {object} options { maxEntities, persistThrottleMs }
   */
  constructor(config, writeQueue = null, options = {}) {
    this.config = config;
    this.writeQueue = writeQueue;
    this.maxEntities = Math.max(1, Number(options.maxEntities) || DEFAULT_MAX_ENTITIES);
    this.entityTtlMs = Math.max(
      0,
      Number(options.entityTtlMs ?? config?.get?.('learning.entityTtlMs', 30 * 86400000)) || 0
    );
    this.persistThrottleMs = Math.max(
      0,
      Number(
        options.persistThrottleMs !== undefined
          ? options.persistThrottleMs
          : config?.get?.(
              'learning.persistThrottleMs',
              process.env.FLOWMIND_LEARNING_DIRECT_WRITE === '1' ? 0 : 5000
            )
      ) || 0
    );
    this.persistThrottler = new PersistThrottler(() => this.writeEntitiesFile(), this.persistThrottleMs);
    this.entitiesPath = null;
    this.store = defaultStore();
    this.initialized = false;
  }

  async init() {
    const learningPath = this.config.get(
      'learning.storagePath',
      path.join(
        process.env.FLOWMIND_HOME || process.env.HOME || process.env.USERPROFILE || '',
        '.flowmind',
        'learning'
      )
    );
    this.entitiesPath = path.join(expandPath(learningPath), 'entities.json');

    await fs.ensureDir(path.dirname(this.entitiesPath));

    if (await fs.pathExists(this.entitiesPath)) {
      try {
        const loaded = await fs.readJson(this.entitiesPath);
        this.store = {
          version: loaded.version || '1.0',
          entities: Array.isArray(loaded.entities) ? loaded.entities : [],
          lastUpdated: loaded.lastUpdated || null
        };
        this.pruneExpired();
      } catch (error) {
        this.store = defaultStore();
      }
    }

    this.initialized = true;
    return this;
  }

  /**
   * Merge entities keyed by `type|name|env`. Attributes shallow-merge,
   * seenCount accumulates, sources union. FIFO cap at maxEntities with
   * trace entities evicted first.
   */
  async recordEntities(entities, sourceSkill = null) {
    const list = Array.isArray(entities) ? entities.filter(Boolean) : [];
    if (list.length === 0) {
      return [];
    }

    const run = async () => {
      const now = new Date().toISOString();
      const recorded = [];

      for (const raw of list) {
        const type = ENTITY_TYPES.has(raw.type) ? raw.type : 'business';
        const name = String(raw.name || '').trim();
        if (!name) continue;
        const env = normalizeEnvToken(raw.env);
        const id = entityId(type, name, env);

        let entity = this.store.entities.find((item) => item.id === id);
        if (!entity) {
          entity = {
            id,
            type,
            name,
            env: env || null,
            attributes: {},
            attributeConfidence: {},
            observations: [],
            stats: { seenCount: 0, firstSeen: now, lastSeen: now },
            sources: []
          };
          this.store.entities.push(entity);
        }

        entity.attributeConfidence = entity.attributeConfidence || {};
        entity.observations = Array.isArray(entity.observations) ? entity.observations : [];
        const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0.5));
        for (const [key, value] of Object.entries(raw.attributes || {})) {
          if (confidence >= (Number(entity.attributeConfidence[key]) || 0)) {
            entity.attributes[key] = value;
            entity.attributeConfidence[key] = confidence;
          }
        }
        entity.observations.push({
          source: sourceSkill || raw.source || 'unknown',
          confidence,
          observedAt: now
        });
        entity.observations = entity.observations.slice(-10);
        entity.stats.seenCount = (Number(entity.stats.seenCount) || 0) + 1;
        entity.stats.lastSeen = now;
        entity.expiresAt = this.entityTtlMs > 0
          ? new Date(Date.now() + this.entityTtlMs).toISOString()
          : null;
        if (sourceSkill && !entity.sources.includes(sourceSkill)) {
          entity.sources.push(sourceSkill);
        }
        recorded.push(entity);
      }

      this.evictOverflow();
      this.store.lastUpdated = now;
      await this.schedulePersist();
      return recorded;
    };

    if (this.writeQueue && typeof this.writeQueue.run === 'function') {
      return this.writeQueue.run('entities', run);
    }
    return run();
  }

  /**
   * Synchronous pure-read search: name includes (+3) / bigram similarity
   * >= 0.5 (+2) / pipelineName includes (+1).
   */
  searchEntities(query, topK = 5) {
    this.pruneExpired();
    const normalized = String(query || '').toLowerCase().trim();
    if (!normalized) return [];

    const scored = [];
    for (const entity of this.store.entities) {
      let score = 0;
      const name = String(entity.name || '').toLowerCase();
      if (name && normalized.includes(name)) {
        score += 3;
      } else if (name && bigramDice(name, normalized) >= 0.5) {
        score += 2;
      }

      const pipelineName = String(entity.attributes?.pipelineName || '').toLowerCase();
      if (pipelineName && normalized.includes(pipelineName)) {
        score += 1;
      }

      if (score > 0) {
        scored.push({ entity, score });
      }
    }

    return scored
      .sort(
        (left, right) =>
          right.score - left.score ||
          (Number(right.entity.stats?.seenCount) || 0) - (Number(left.entity.stats?.seenCount) || 0)
      )
      .slice(0, Math.max(1, Number(topK) || 5))
      .map(({ entity, score }) => ({
        id: entity.id,
        type: entity.type,
        name: entity.name,
        env: entity.env || null,
        attributes: { ...(entity.attributes || {}) },
        stats: { ...(entity.stats || {}) },
        sources: [...(entity.sources || [])],
        score
      }));
  }

  /**
   * Flush any pending throttled persistence immediately.
   */
  async flush() {
    await this.persistThrottler.flush();
  }

  async schedulePersist() {
    if (this.persistThrottleMs <= 0) {
      await this.writeEntitiesFile();
      return;
    }
    this.persistThrottler.markDirty();
  }

  async writeEntitiesFile() {
    if (!this.entitiesPath) return;
    await writeJsonAtomic(this.entitiesPath, this.store);
  }

  pruneExpired(now = Date.now()) {
    if (!Array.isArray(this.store.entities)) return;
    this.store.entities = this.store.entities.filter((entity) => {
      const expiresAt = Date.parse(entity.expiresAt || 0);
      return !expiresAt || expiresAt > now;
    });
  }

  evictOverflow() {
    const excess = this.store.entities.length - this.maxEntities;
    if (excess <= 0) return;

    const ordered = this.store.entities
      .map((entity, index) => ({
        id: entity.id,
        index,
        traceFirst: entity.type === 'trace' ? 0 : 1,
        lastSeen: Date.parse(entity.stats?.lastSeen || 0) || 0
      }))
      .sort((left, right) => left.traceFirst - right.traceFirst || left.lastSeen - right.lastSeen || left.index - right.index);

    const evict = new Set(ordered.slice(0, excess).map((item) => item.id));
    this.store.entities = this.store.entities.filter((entity) => !evict.has(entity.id));
  }
}

module.exports = EntityMemory;
module.exports.normalizeEnvToken = normalizeEnvToken;
