// DI token for the string AuditModule.forRoot(serviceName) is called with —
// a plain string can't be an injection token on its own, and this needs to
// be importable both from audit.module.ts (to provide it) and
// audit-trail.service.ts (to inject it), without either importing the
// other.
export const AUDIT_SERVICE_NAME = 'AUDIT_SERVICE_NAME';
