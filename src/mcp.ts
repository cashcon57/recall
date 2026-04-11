import type { Env, JsonRpcRequest, JsonRpcResponse } from './types';
import { TOOL_DEFINITIONS, executeTool } from './tools';

// ─── Server metadata ────────────────────────────────────────────────

const SERVER_INFO = {
  name: 'recall',
  version: '1.0.0',
};

const SERVER_CAPABILITIES = {
  tools: {},
};

// ─── JSON-RPC 2.0 error codes ──────────────────────────────────────

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

// ─── Response builders ──────────────────────────────────────────────

function errorResponse(
  id: string | number | null,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function successResponse(
  id: string | number | null,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

// ─── Request handling ───────────────────────────────────────────────

export async function handleMcpRequest(
  request: JsonRpcRequest,
  env: Env,
): Promise<JsonRpcResponse | null> {
  const { method, params, id } = request;

  // Notifications (no id) don't receive responses per JSON-RPC spec.
  if (id === undefined || id === null) {
    return null;
  }

  switch (method) {
    case 'initialize':
      return handleInitialize(id);
    case 'ping':
      return successResponse(id, {});
    case 'tools/list':
      return successResponse(id, { tools: TOOL_DEFINITIONS });
    case 'tools/call':
      return handleToolsCall(id, params, env);
    default:
      return errorResponse(id, METHOD_NOT_FOUND, `Unknown method: ${method}`);
  }
}

function handleInitialize(id: string | number): JsonRpcResponse {
  return successResponse(id, {
    protocolVersion: '2025-03-26',
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
  });
}

async function handleToolsCall(
  id: string | number,
  params: Record<string, unknown> | undefined,
  env: Env,
): Promise<JsonRpcResponse> {
  if (!params || typeof params.name !== 'string') {
    return errorResponse(id, INVALID_PARAMS, 'Missing tool name');
  }

  const toolName = params.name;
  const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

  if (!TOOL_DEFINITIONS.some((t) => t.name === toolName)) {
    return errorResponse(id, METHOD_NOT_FOUND, `Unknown tool: ${toolName}`);
  }

  try {
    const result = await executeTool(toolName, toolArgs, env);
    return successResponse(id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    return successResponse(id, {
      content: [{ type: 'text', text: message }],
      isError: true,
    });
  }
}

// ─── JSON-RPC parsing ───────────────────────────────────────────────

export function parseJsonRpc(body: unknown): JsonRpcRequest | JsonRpcRequest[] {
  if (Array.isArray(body)) {
    if (body.length === 0) throw new Error('Empty batch');
    return body.map(validateSingleRequest);
  }
  return validateSingleRequest(body);
}

function validateSingleRequest(obj: unknown): JsonRpcRequest {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Request must be a JSON object');
  }

  const req = obj as Record<string, unknown>;

  if (req.jsonrpc !== '2.0') {
    throw new Error('jsonrpc must be "2.0"');
  }
  if (typeof req.method !== 'string') {
    throw new Error('method must be a string');
  }

  return {
    jsonrpc: '2.0',
    id: req.id as string | number | null | undefined,
    method: req.method,
    params: req.params as Record<string, unknown> | undefined,
  };
}
