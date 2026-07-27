# Provider scope

| Provider | Typical scope | Backing service |
| --- | --- | --- |
| `aliyun-mse` | region, namespace, service, environment | Alibaba Cloud MSE MCP or OpenAPI bridge |
| `huawei-cse` | projectId, engineId, service, environment | Huawei Cloud CSE OpenAPI bridge |
| `baidu-mse` | region, projectId, namespace, service | Baidu Cloud MSE/CSM OpenAPI bridge |

Override provider tool names with `components.serviceGovernance.providers.<provider>.tools` when the MCP bridge uses different names.
