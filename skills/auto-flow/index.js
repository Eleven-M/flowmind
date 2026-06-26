/**
 * Auto Flow Skill
 * Define, execute, and manage complex multi-step workflows
 */

const fs = require('fs-extra');
const path = require('path');

const BUILTIN_WORKFLOWS = {
  'dev-workflow': {
    name: 'Development Workflow',
    steps: [
      { id: 'review', skill: 'code-review', name: 'Code Review' },
      { id: 'test', action: 'run-command', command: 'npm test', depends_on: ['review'] },
      { id: 'docs', action: 'run-command', command: 'npm run docs', depends_on: ['test'] },
      { id: 'archive', skill: 'archive-change', name: 'Archive', depends_on: ['docs'] }
    ]
  },
  'deploy-workflow': {
    name: 'Deploy Workflow',
    steps: [
      { id: 'validate', action: 'run-command', command: 'npm run validate' },
      { id: 'build', action: 'run-command', command: 'npm run build', depends_on: ['validate'] },
      { id: 'deploy', action: 'deploy', depends_on: ['build'] },
      { id: 'verify', action: 'run-command', command: 'npm run verify', depends_on: ['deploy'] },
      { id: 'notify', action: 'notify', depends_on: ['verify'] }
    ]
  }
};

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /自动流程|auto.*flow|工作流|workflow|执行流程|run.*flow/i.test(input);
  },

  async execute(input, context) {
    const params = parseFlowParams(input);

    if (params.action === 'list') {
      return {
        type: 'result',
        skill: 'auto-flow',
        message: `Available workflows: ${Object.keys(BUILTIN_WORKFLOWS).join(', ')}`,
        data: { workflows: Object.entries(BUILTIN_WORKFLOWS).map(([k, v]) => ({ id: k, name: v.name, steps: v.steps.length })) },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'run') {
      const workflow = BUILTIN_WORKFLOWS[params.workflow];
      if (!workflow) {
        return {
          type: 'error', skill: 'auto-flow',
          message: `Workflow not found: ${params.workflow}. Available: ${Object.keys(BUILTIN_WORKFLOWS).join(', ')}`,
          input, timestamp: new Date().toISOString()
        };
      }

      return {
        type: 'result',
        skill: 'auto-flow',
        message: `Starting workflow: ${workflow.name} (${workflow.steps.length} steps)`,
        data: {
          workflow: params.workflow,
          steps: workflow.steps.map(s => ({
            id: s.id,
            name: s.name || s.action || s.skill,
            depends_on: s.depends_on || [],
            status: 'pending'
          })),
          status: 'started'
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'define') {
      return {
        type: 'result',
        skill: 'auto-flow',
        message: 'Define a workflow in YAML format',
        data: {
          format: 'YAML workflow definition',
          example: {
            name: 'My Workflow',
            steps: [
              { id: 'step1', action: 'run-command', command: 'echo hello' },
              { id: 'step2', skill: 'code-review', depends_on: ['step1'] }
            ]
          }
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'result',
      skill: 'auto-flow',
      message: 'Auto Flow. Available actions: list, run, define',
      data: {
        actions: ['list - List workflows', 'run <name> - Run workflow', 'define - Define new workflow'],
        builtinWorkflows: Object.keys(BUILTIN_WORKFLOWS)
      },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function parseFlowParams(input) {
  const params = {};
  if (/列表|list/i.test(input)) params.action = 'list';
  if (/执行|run|start|运行/i.test(input)) params.action = 'run';
  if (/定义|define|创建|create/i.test(input)) params.action = 'define';

  const workflowMatch = input.match(/(?:workflow|流程|工作流)\s*[:=]?\s*(\S+)/i);
  if (workflowMatch) params.workflow = workflowMatch[1];

  return params;
}
