#!/usr/bin/env node

/**
 * FlowMind MCP Server
 * 让 Claude/Codex 可以直接调用 FlowMind 内部流程
 */

const FlowMind = require('../core');

// MCP Server 实现
class FlowMindMCPServer {
  constructor() {
    this.flowmind = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    this.flowmind = new FlowMind();
    await this.flowmind.init();
    this.initialized = true;
  }

  /**
   * 获取所有可用工具
   */
  getTools() {
    const skills = this.flowmind.skills.list();
    const tools = [];

    // 添加核心工具
    tools.push({
      name: 'flowmind_process',
      description: 'Process a request using FlowMind AI agent. This is the main entry point for using FlowMind.',
      inputSchema: {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            description: 'The request to process'
          },
          context: {
            type: 'object',
            description: 'Optional context for the request'
          }
        },
        required: ['input']
      }
    });

    tools.push({
      name: 'flowmind_list_skills',
      description: 'List all available FlowMind skills',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    tools.push({
      name: 'flowmind_get_skill',
      description: 'Get detailed information about a specific skill',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Skill name'
          }
        },
        required: ['name']
      }
    });

    tools.push({
      name: 'flowmind_ai_status',
      description: 'Get AI model status and configuration',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    tools.push({
      name: 'flowmind_learning_stats',
      description: 'Get learning statistics',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    });

    // 添加每个技能作为独立工具
    for (const skill of skills) {
      tools.push({
        name: `flowmind_skill_${skill.name}`,
        description: skill.description || `Execute ${skill.name} skill`,
        inputSchema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input for the skill'
            },
            context: {
              type: 'object',
              description: 'Optional context'
            }
          },
          required: ['input']
        }
      });
    }

    return tools;
  }

  /**
   * 调用工具
   */
  async callTool(name, args) {
    await this.init();

    try {
      // 核心工具
      if (name === 'flowmind_process') {
        const result = await this.flowmind.process(args.input, args.context || {});
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      if (name === 'flowmind_list_skills') {
        const skills = this.flowmind.skills.list();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ skills }, null, 2)
          }]
        };
      }

      if (name === 'flowmind_get_skill') {
        const skill = this.flowmind.skills.get(args.name);
        if (!skill) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: `Skill not found: ${args.name}` })
            }],
            isError: true
          };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              name: skill.name,
              description: skill.definition?.description,
              category: skill.definition?.category,
              triggers: skill.definition?.triggers,
              componentDependencies: skill.definition?.componentDependencies
            }, null, 2)
          }]
        };
      }

      if (name === 'flowmind_ai_status') {
        const status = this.flowmind.getAIStatus();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(status, null, 2)
          }]
        };
      }

      if (name === 'flowmind_learning_stats') {
        const stats = await this.flowmind.getStats();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }]
        };
      }

      // 技能工具
      if (name.startsWith('flowmind_skill_')) {
        const skillName = name.replace('flowmind_skill_', '');
        const skill = this.flowmind.skills.get(skillName);

        if (!skill) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: `Skill not found: ${skillName}` })
            }],
            isError: true
          };
        }

        const result = await this.flowmind.executeWithLearning(skill, args.input, args.context || {});
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Unknown tool: ${name}` })
        }],
        isError: true
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: error.message })
        }],
        isError: true
      };
    }
  }
}

// 启动 MCP Server
async function main() {
  const server = new FlowMindMCPServer();

  // 读取 stdin，写入 stdout
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    try {
      const request = JSON.parse(line);
      let response;

      if (request.method === 'initialize') {
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'flowmind',
              version: '1.0.1'
            }
          }
        };
      } else if (request.method === 'tools/list') {
        await server.init();
        const tools = server.getTools();
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result: { tools }
        };
      } else if (request.method === 'tools/call') {
        const result = await server.callTool(request.params.name, request.params.arguments || {});
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
      } else {
        response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        };
      }

      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (error) {
      const response = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  });

  // 初始化
  await server.init();
  console.error('FlowMind MCP Server started');
}

main().catch(console.error);
