const {
  executeWorkflow,
  resumeWorkflow,
  DEFAULT_MAX_CONCURRENT
} = require('../core/workflow-executor');
const {
  canonicalSteps,
  createApprovalToken,
  previewWorkflow
} = require('../core/dry-run');

function buildChain(steps) {
  return { mode: 'manual-review', steps };
}

function tokenFor(chain) {
  return createApprovalToken(canonicalSteps(chain));
}

function buildFlowmind(handler) {
  const skills = new Map(
    ['knowledge-ops', 'archive-change', 'yapi-sync-interface', 'yuque-sync-design', 'service-governance-change'].map(
      (name) => [name, { name }]
    )
  );
  return {
    skills: { get: (name) => skills.get(name) || null },
    executeWithLearning: handler
  };
}

describe('workflow executor DAG scheduling', () => {
  test('serial chain without explicit deps keeps legacy order and scopes previousResults', async () => {
    const calls = [];
    const flowmind = buildFlowmind(async (skill, input) => {
      calls.push(input);
      return { ok: true, input };
    });
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a' },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b' },
      { id: 'c', skill: 'knowledge-ops', suggestedInput: 'do-c' }
    ]);

    const execution = await executeWorkflow(chain, {
      flowmind,
      dryRun: false,
      approvalToken: tokenFor(chain)
    });

    expect(calls).toEqual(['do-a', 'do-b', 'do-c']);
    expect(execution.status).toBe('succeeded');
    expect(execution.results.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  test('previousResults only contains direct dependency results', async () => {
    const contexts = [];
    const flowmind = {
      skills: { get: (name) => ({ name }) },
      executeWithLearning: async (skill, input, context) => {
        contexts.push({ input, previous: context.previousResults });
        return { ok: true, input };
      }
    };
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: [] },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b', dependsOn: [] },
      { id: 'c', skill: 'knowledge-ops', suggestedInput: 'do-c', dependsOn: ['a', 'b'] }
    ]);

    await executeWorkflow(chain, { flowmind, dryRun: false, approvalToken: tokenFor(chain) });

    const stepC = contexts.find((entry) => entry.input === 'do-c');
    expect(stepC.previous).toHaveLength(2);
    expect(stepC.previous.map((result) => result.input).sort()).toEqual(['do-a', 'do-b']);
    const stepB = contexts.find((entry) => entry.input === 'do-b');
    expect(stepB.previous).toHaveLength(0);
  });

  test('maxConcurrent bounds the size of the running pool', async () => {
    let active = 0;
    let peak = 0;
    const flowmind = buildFlowmind(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { ok: true };
    });
    const chain = buildChain(
      ['a', 'b', 'c', 'd'].map((id) => ({
        id,
        skill: 'knowledge-ops',
        suggestedInput: `do-${id}`,
        dependsOn: []
      }))
    );

    const execution = await executeWorkflow(chain, {
      flowmind,
      dryRun: false,
      approvalToken: tokenFor(chain),
      maxConcurrent: 2
    });

    expect(execution.status).toBe('succeeded');
    expect(execution.maxConcurrent).toBe(2);
    expect(peak).toBe(2);
  });

  test('default concurrency is 4', async () => {
    let active = 0;
    let peak = 0;
    const flowmind = buildFlowmind(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { ok: true };
    });
    const chain = buildChain(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
        id,
        skill: 'knowledge-ops',
        suggestedInput: `do-${id}`,
        dependsOn: []
      }))
    );

    expect(DEFAULT_MAX_CONCURRENT).toBe(4);
    await executeWorkflow(chain, {
      flowmind,
      dryRun: false,
      approvalToken: tokenFor(chain)
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  test('failed step blocks dependents but independent branches keep running', async () => {
    const flowmind = buildFlowmind(async (skill, input) => {
      if (input === 'do-a') {
        throw new Error('boom');
      }
      return { ok: true, input };
    });
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: [] },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b', dependsOn: [] },
      { id: 'c', skill: 'knowledge-ops', suggestedInput: 'do-c', dependsOn: ['a'] }
    ]);

    const execution = await executeWorkflow(chain, {
      flowmind,
      dryRun: false,
      approvalToken: tokenFor(chain)
    });

    expect(execution.status).toBe('partial');
    expect(execution.resumable).toBe(true);
    expect(execution.summary).toEqual(
      expect.objectContaining({ total: 3, succeeded: 1, failed: 1, blocked: 1 })
    );
    expect(execution.stepStatus).toEqual({ a: 'failed', b: 'succeeded', c: 'blocked' });
  });

  test('continueOnError lets dependents run after an upstream failure', async () => {
    const flowmind = buildFlowmind(async (skill, input) => {
      if (input === 'do-a') {
        throw new Error('boom');
      }
      return { ok: true, input };
    });
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: [] },
      { id: 'c', skill: 'knowledge-ops', suggestedInput: 'do-c', dependsOn: ['a'] }
    ]);

    const execution = await executeWorkflow(chain, {
      flowmind,
      dryRun: false,
      approvalToken: tokenFor(chain),
      continueOnError: true
    });

    expect(execution.stepStatus).toEqual({ a: 'failed', c: 'succeeded' });
    expect(execution.status).toBe('failed');
  });

  test('rejects dependency cycles with CYCLE_DETECTED', async () => {
    const flowmind = buildFlowmind(async () => ({ ok: true }));
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: ['b'] },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b', dependsOn: ['a'] }
    ]);

    await expect(
      executeWorkflow(chain, { flowmind, dryRun: false, approvalToken: tokenFor(chain) })
    ).rejects.toMatchObject({ code: 'CYCLE_DETECTED' });
  });

  test('rejects unknown dependencies with UNKNOWN_DEPENDENCY', async () => {
    const flowmind = buildFlowmind(async () => ({ ok: true }));
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: ['ghost'] }
    ]);

    await expect(
      executeWorkflow(chain, { flowmind, dryRun: false, approvalToken: tokenFor(chain) })
    ).rejects.toMatchObject({ code: 'UNKNOWN_DEPENDENCY' });
  });

  test('approval token covers the dependency shape', async () => {
    const flowmind = buildFlowmind(async () => ({ ok: true }));
    const serialChain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a' },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b' }
    ]);
    const parallelChain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: [] },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b', dependsOn: [] }
    ]);

    const serialToken = tokenFor(serialChain);
    expect(serialToken).not.toBe(tokenFor(parallelChain));

    await expect(
      executeWorkflow(parallelChain, {
        flowmind,
        dryRun: false,
        approvalToken: serialToken
      })
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
  });

  test('node-level resume skips succeeded steps and keeps their results', async () => {
    const calls = [];
    const flowmind = buildFlowmind(async (skill, input) => {
      calls.push(input);
      return { ok: true, input };
    });
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: [] },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b', dependsOn: ['a'] }
    ]);
    const record = {
      executionId: 'workflow-resume-node',
      chain,
      nextStepIndex: 0,
      results: [{ id: 'a', order: 1, skill: 'knowledge-ops', status: 'succeeded', result: { ok: true, input: 'seeded-a' } }]
    };

    const resumed = await resumeWorkflow(record, {
      flowmind,
      approvalToken: tokenFor(chain)
    });

    expect(calls).toEqual(['do-b']);
    expect(resumed.status).toBe('succeeded');
    expect(resumed.results).toHaveLength(2);
    expect(resumed.results.find((entry) => entry.id === 'a').result.input).toBe('seeded-a');
  });

  test('legacy records without step ids resume via startIndex seeding', async () => {
    const calls = [];
    const flowmind = buildFlowmind(async (skill, input) => {
      calls.push(input);
      return { ok: true, input };
    });
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a' },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b' }
    ]);
    const record = {
      executionId: 'workflow-resume-legacy',
      chain,
      nextStepIndex: 1,
      results: [
        { order: 1, skill: 'knowledge-ops', status: 'succeeded', result: { ok: true, input: 'legacy-a' } }
      ]
    };

    const resumed = await resumeWorkflow(record, {
      flowmind,
      approvalToken: tokenFor(chain)
    });

    expect(calls).toEqual(['do-b']);
    expect(resumed.status).toBe('succeeded');
    expect(resumed.results.find((entry) => entry.order === 1).result.input).toBe('legacy-a');
  });

  test('preview exposes DAG parallel groups and concurrency', () => {
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: [] },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b', dependsOn: [] },
      { id: 'c', skill: 'knowledge-ops', suggestedInput: 'do-c', dependsOn: ['a', 'b'] }
    ]);

    const preview = previewWorkflow(chain);

    expect(preview.dag.valid).toBe(true);
    expect(preview.dag.levels).toEqual([['a', 'b'], ['c']]);
    expect(preview.dag.parallelGroups).toBe(1);
    expect(preview.dag.maxConcurrency).toBe(2);
    expect(preview.steps.map((step) => step.dependsOn)).toEqual([[], [], ['a', 'b']]);
  });

  test('preview reports invalid DAG instead of throwing', () => {
    const chain = buildChain([
      { id: 'a', skill: 'knowledge-ops', suggestedInput: 'do-a', dependsOn: ['b'] },
      { id: 'b', skill: 'knowledge-ops', suggestedInput: 'do-b', dependsOn: ['a'] }
    ]);

    const preview = previewWorkflow(chain);

    expect(preview.dag.valid).toBe(false);
    expect(preview.dag.code).toBe('CYCLE_DETECTED');
  });
});
