/**
 * FlowMind Event Bus
 * Shared singleton EventEmitter for cross-module event communication.
 * Enables real-time monitoring (dashboard) and event-driven TUI updates.
 */

const EventEmitter = require('events');

class FlowMindEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}

// Singleton — shared across all modules
module.exports = new FlowMindEventBus();
