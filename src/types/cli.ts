export type CliProtocol = 'DoH' | 'DoT/853' | 'UDP/53';

export interface CliResultRow {
  protocol: CliProtocol;
  name: string;
  medianMs: number | null;
  successPct: number;
}

export interface CliAdblockRow {
  name: string;
  domain: string;
  blocked: boolean;
  rcode?: number;
}

export interface CliReport {
  schemaVersion: number;
  createdAt: string;
  samples?: number;
  systemDns: {
    servers: string[];
    medianMs: number | null;
    successPct: number;
  };
  port53Check: {
    hijacked: boolean;
    udpIdServer: string | null;
    dotIdServer: string | null;
  };
  results: CliResultRow[];
  adblockCheck: CliAdblockRow[];
}
