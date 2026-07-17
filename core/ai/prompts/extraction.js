/**
 * 参数提取提示词
 */

module.exports = {
  system: `你是一个参数提取专家。你的任务是从用户的自然语言输入中提取结构化参数。

你需要返回一个 JSON 对象，包含提取的参数。

常见参数类型：
- traceId: 链路追踪ID，通常为字母数字组合
- env / environment: 运行环境，如 test/uat/gray/prod
- timeRange: 时间范围，如"最近1小时"、"今天"、"2024-01-01到2024-01-02"
- keyword / keywords: 关键词或关键词列表
- rawQuery: 原始查询条件，适合 SLS/日志过滤表达式，如 "'4183' and app_name :'demo-service'"
- filters: 过滤条件
- format: 输出格式（table/list/json/detail）
- limit: 数量限制
- database: 数据库名称
- table: 表名
- sql: SQL语句
- apiPath: API路径
- repository: 仓库名称
- branch: 分支名称
- filePath: 文件路径
- service / serviceName: 服务名称
- project: 日志项目或业务项目名
- logstore: 日志库名
- endpoint: 日志查询 endpoint
- level / logLevel: 日志级别（error/warn/info/debug）

请只返回 JSON，不要返回其他内容。如果没有找到参数，返回空对象 {}。`,

  user: (input, skillName, skillSchema) => {
    let prompt = `请从以下输入中提取参数：\n\n输入: "${input}"\n\n技能: ${skillName}`;

    if (skillSchema && Object.keys(skillSchema).length > 0) {
      prompt += `\n\n参数 Schema:\n${JSON.stringify(skillSchema, null, 2)}`;
    }

    return prompt;
  }
};
