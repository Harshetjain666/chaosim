/**
 * Company context: the structured model a real Company Brain would extract from
 * a company's tools (GitHub services, Slack incident channels, Jira patterns,
 * runbooks, the CEO's voice). For now it is authored by hand; later the
 * integrations populate it. The scenario generator turns it into a personalized
 * incident that the existing engine runs unchanged.
 */

export interface CeoPersona {
  name: string;
  role: string;
  /** First panicked message. {minutes} is interpolated. */
  opener: string;
  /** A follow-up nudge while it is still down. */
  nudge: string;
}

/** The failure shape to plant. Mirrors the three hand-authored incidents. */
export type ArchetypeKind = 'missing-return' | 'zeroed-limit' | 'broken-shape';

export interface ServiceSpec {
  /** Folder + service name, e.g. 'billing-service'. */
  name: string;
  /** Short human name of the service, e.g. 'billing'. */
  short: string;
  method: string; // 'POST'
  path: string; // '/charges'
  /** The module that holds the business logic (and the planted bug). */
  handlerModule: string; // 'billing'
  handlerFn: string; // 'charge'
  /** What one unit of work is called, for logs and messages. */
  noun: string; // 'charge'
  port: number;
  /** The recent commit hash blamed for the incident. */
  recentCommit: string;
  /** Which failure shape to generate. Defaults to 'missing-return'. */
  archetype?: ArchetypeKind;
  /** For 'broken-shape': the key items are looked up by, e.g. 'sku'. */
  lookupKey?: string;
  /** For 'broken-shape': the field the consumer reads, e.g. 'count'. */
  valueField?: string;
}

export interface CompanyContext {
  company: string;
  ceo: CeoPersona;
  deadlineMinutes: number;
  services: ServiceSpec[];
  glossary?: string[];
}

/**
 * A stand-in for what the Company Brain would assemble from a real tenant. Used
 * to demonstrate generation end to end without any integration wired up.
 */
export const exampleCompany: CompanyContext = {
  company: 'Northwind',
  ceo: {
    name: 'Dana Park',
    role: 'CEO',
    opener:
      'Northwind checkout is throwing 500s and customers cannot pay. Board demo in {minutes} minutes. What on earth is going on??',
    nudge: 'Are we any closer? The board just walked in and the dashboard is red.',
  },
  deadlineMinutes: 18,
  glossary: ['NW', 'checkout-edge', 'the provider'],
  services: [
    {
      name: 'billing-service',
      short: 'billing',
      method: 'POST',
      path: '/charges',
      handlerModule: 'billing',
      handlerFn: 'charge',
      noun: 'charge',
      port: 8080,
      recentCommit: 'b91a2c4',
      archetype: 'missing-return',
    },
    {
      name: 'orders-service',
      short: 'orders',
      method: 'POST',
      path: '/orders',
      handlerModule: 'limits',
      handlerFn: 'validate',
      noun: 'order',
      port: 8081,
      recentCommit: 'c47f0d2',
      archetype: 'zeroed-limit',
    },
    {
      name: 'inventory-service',
      short: 'inventory',
      method: 'GET',
      path: '/stock',
      handlerModule: 'stock',
      handlerFn: 'getStock',
      noun: 'item',
      port: 8082,
      recentCommit: 'a18e9b3',
      archetype: 'broken-shape',
      lookupKey: 'sku',
      valueField: 'count',
    },
  ],
};
