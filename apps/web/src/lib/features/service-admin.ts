export type ServiceAdminUser = { userId: string | null; displayName: string };

export type ServiceAdminEventKind = 'granted' | 'revoked';
export type ServiceAdminEventSource = 'web' | 'bootstrap';

export type ServiceAdminEvent = {
    id: string;
    occurredAt: string;
    kind: ServiceAdminEventKind;
    source: ServiceAdminEventSource;
    actor: ServiceAdminUser | null;
    target: ServiceAdminUser;
};

export type ServiceAdminOverview = {
    admins: ServiceAdminUser[];
    entries: ServiceAdminEvent[];
    total: number;
};
