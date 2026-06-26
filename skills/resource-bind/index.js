/**
 * Resource Bind Skill
 * Manage database, Redis, API, and other external resource connections
 */

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /资源绑定|resource.*bind|数据库.*连接|redis.*连接|连接.*管理|connection.*manage/i.test(input);
  },

  async execute(input, context) {
    const registry = context.componentRegistry;
    const params = parseResourceParams(input);

    if (params.action === 'list') {
      const components = registry ? registry.getAll() : [];
      return {
        type: 'result',
        skill: 'resource-bind',
        message: `Found ${components.length} configured component(s)`,
        data: { components: components.map(c => ({ name: c.name, type: c.type, active: c.active })) },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'status') {
      const status = registry ? registry.getStatus() : {};
      return {
        type: 'result',
        skill: 'resource-bind',
        message: 'Resource connection status',
        data: { status },
        input,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'result',
      skill: 'resource-bind',
      message: 'Resource binding. Available actions: list, status',
      data: {
        actions: ['list - List all resources', 'status - Show connection status'],
        supportedTypes: ['MySQL', 'PostgreSQL', 'Redis', 'REST API']
      },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function parseResourceParams(input) {
  const params = {};
  if (/列表|list|查看|show/i.test(input)) params.action = 'list';
  if (/状态|status|连接/i.test(input)) params.action = 'status';
  if (/绑定|bind|添加|add/i.test(input)) params.action = 'bind';
  return params;
}
