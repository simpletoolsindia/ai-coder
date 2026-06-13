export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [k: string]: Json };

export type ToolCategory =
  | 'filesystem'
  | 'search'
  | 'terminal'
  | 'git'
  | 'web'
  | 'memory'
  | 'context'
  | 'todo'
  | 'mcp'
  | 'subagent'
  | 'misc';

export type PermissionAction = 'allow' | 'deny' | 'ask' | 'prompt';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export type ProviderKind = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openai-compatible' | 'custom';

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, ToolParameter>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  additionalProperties?: boolean | ToolParameter;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameterSchema;
  /** Used by the resolver to match this tool to a user request */
  keywords?: string[];
  /** Plugin that owns the tool */
  pluginId: string;
  /** Whether this tool can do destructive actions */
  dangerous?: boolean;
  /** Whether this tool requires network */
  network?: boolean;
  /** Whether this tool requires filesystem write */
  writesFiles?: boolean;
}

export interface ToolExecutionContext {
  /** Working directory */
  cwd: string;
  /** Caller id (plugin or user) */
  caller: string;
  /** Session id */
  sessionId: string;
  /** Abort signal */
  signal?: AbortSignal;
  /** Permissions engine */
  permissions: PermissionDecision;
  /** Logger */
  logger: Logger;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  durationMs?: number;
  /** When the tool is partially streamed */
  partial?: boolean;
}

export interface Tool {
  definition: ToolDefinition;
  execute: (args: Json, ctx: ToolExecutionContext) => Promise<ToolResult>;
}

export interface PluginContext {
  /** Service container */
  container: Container;
  /** Event bus */
  events: EventBus;
  /** Logger */
  logger: Logger;
  /** Settings */
  settings: SettingsManager;
  /** Configured providers */
  providers: ProviderManager;
  /** Tool registry (for the plugin to register tools) */
  tools: ToolRegistry;
  /** Commands registry */
  commands: CommandRegistry;
  /** Permissions */
  permissions: PermissionEngine;
}

export interface PluginManifest {
  id: string;
  version: string;
  description: string;
  author?: string;
  homepage?: string;
  commands?: string[];
  tools?: string[];
  dependencies?: string[];
  /** Whether the plugin should be lazy loaded. Defaults to true. */
  lazy: boolean;
  /** Whether the plugin is enabled */
  enabled: boolean;
  /** When lazy, the import specifier to load */
  entry?: string;
  /** Tags used by the resolver to decide if the plugin is needed */
  tags?: string[];
  /** Triggers are keywords that, when found in a user request, will lazily load this plugin */
  triggers?: string[];
  /** Plugin-specific settings schema (JSON Schema-like) */
  settingsSchema?: Record<string, unknown>;
}

export interface PluginInitResult {
  tools?: Tool[];
  commands?: CommandDefinition[];
  /** Lifecycle hook names registered */
  hooks?: PluginHookName[];
  /** Plugin-defined routes or UI panels (extension points) */
  extensions?: string[];
}

export type PluginHookName =
  | 'beforeRequest'
  | 'afterRequest'
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'onError'
  | 'onShutdown';

export interface PluginHookPayload {
  beforeRequest?: { prompt: string; context: Json };
  afterRequest?: { prompt: string; response: string; context: Json };
  beforeToolCall?: { tool: string; args: Json };
  afterToolCall?: { tool: string; result: ToolResult };
  onError?: { error: Error; phase: string };
  onShutdown?: Record<string, never>;
}

export type PluginHookHandler<K extends PluginHookName> = (
  payload: PluginHookPayload[K],
  ctx: PluginContext,
) => Promise<Json | void> | Json | void;

export interface Plugin {
  manifest: PluginManifest;
  /** Resolved module export. Optional - core can read manifest only. */
  setup?: (ctx: PluginContext) => Promise<PluginInitResult> | PluginInitResult;
  shutdown?: (ctx: PluginContext) => Promise<void> | void;
}

export interface LoadedPlugin extends Plugin {
  /** True after setup() has been called */
  initialized: boolean;
  /** Health status */
  status: 'idle' | 'loading' | 'ready' | 'error' | 'disabled';
  /** Loaded at timestamp */
  loadedAt?: number;
  /** Last error if any */
  error?: string;
}

export interface CommandDefinition {
  id: string;
  /** Slash-prefixed command name, e.g. "/login" */
  name: string;
  description: string;
  /** Plugin that owns the command */
  pluginId: string;
  /** Argument signature */
  args?: string;
  /** Hidden from help */
  hidden?: boolean;
  execute: (args: string, ctx: CommandContext) => Promise<void> | void;
}

export interface CommandContext {
  container?: Container;
  events: EventBus;
  logger: Logger;
  settings: SettingsManager;
  providers: ProviderManager;
  tools: ToolRegistry;
  plugins?: PluginManager;
  commands?: CommandRegistry;
  print: (line: string) => void;
  mode?: import('./mode-controller.js').ModeController;
  status?: import('./status-display.js').StatusDisplay;
}

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  organization?: string;
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  retry?: number;
  enabled?: boolean;
  /** Extra provider-specific options */
  extra?: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
  signal?: AbortSignal;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error' | 'content_filter' | null;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: ChatChoice[];
  usage?: Usage;
}

export interface Provider {
  id: string;
  kind: ProviderKind;
  name: string;
  chat: (req: ChatRequest) => Promise<ChatResponse>;
  listModels?: () => Promise<string[]>;
}

export interface PermissionRule {
  pattern: string;
  action: PermissionAction;
  /** Plugin or tool this rule applies to. '*' for all. */
  target?: string;
  description?: string;
}

export interface PermissionDecision {
  action: PermissionAction;
  reason?: string;
  rule?: PermissionRule;
}

export interface SettingsFileShape {
  general?: {
    defaultProvider?: string;
    theme?: 'auto' | 'dark' | 'light';
    verbose?: boolean;
    maxIterations?: number;
  };
  appearance?: Record<string, Json>;
  advanced?: Record<string, Json>;
}

export interface AgentContext {
  cwd: string;
  sessionId: string;
  systemPrompt: string;
  /** Conversation history */
  messages: ChatMessage[];
  /** Tools available for the current request */
  tools: Tool[];
  /** Resolved user request */
  request: string;
  /** Budgets */
  budget: AgentBudget;
  /** Free-form key/value bag */
  meta: Record<string, Json>;
}

export interface AgentBudget {
  maxSteps: number;
  maxTokens: number;
  deadlineMs: number;
}

export interface AgentStep {
  index: number;
  choice: ChatChoice;
  toolResults: ToolResult[];
  startedAt: number;
  durationMs: number;
}

export interface AgentResult {
  ok: boolean;
  text: string;
  steps: AgentStep[];
  usage: Usage;
  error?: string;
}

// Forward declaration helpers - concrete types live in their own modules.
import type { EventBus } from './event-bus.js';
import type { Container } from './container.js';
import type { Logger } from './logger.js';
import type { SettingsManager } from './settings-manager.js';
import type { ProviderManager } from './provider-manager.js';
import type { ToolRegistry } from './tool-resolver.js';
import type { PermissionEngine } from './permission-engine.js';
import type { PluginManager } from './plugin-manager.js';
import type { CommandRegistry } from './command-registry.js';
