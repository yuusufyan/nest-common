import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditTrail, AuditAction } from './audit-trail.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { AUDIT_SERVICE_NAME } from './audit-service-name.token';
import { SafeJsonLimitError, toSafeJson } from '../shared/safe-json';

// The shared queue every service publishes onto for the centralized audit
// pipeline -- the audit aggregator consumes exactly this queue name. Kept
// in sync with the sibling Go and Python packages' own audit-events queue
// constants.
const AUDIT_EVENTS_QUEUE = 'audit.events';

const AUDIT_PAYLOAD_MAX_CHARS = 50000;
const PAYLOAD_TOO_LARGE = '[PAYLOAD TOO LARGE - REDACTED]';

@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  constructor(
    @InjectRepository(AuditTrail)
    private auditTrailRepository: Repository<AuditTrail>,
    // Optional: AuditModule.forRoot() always provides both, but this
    // service has no other reason to require a broker connection just to
    // write the LOCAL audit_trail row, which every consumer needs
    // regardless of whether the centralized pipeline is wired up yet.
    @Optional() private readonly rabbitMQService?: RabbitMQService,
    @Optional() @Inject(AUDIT_SERVICE_NAME) private readonly serviceName?: string,
  ) {}

  async log(data: {
    user_id?: string;
    username?: string;
    table_name: string;
    record_id?: string;
    action: AuditAction;
    old_values?: any;
    new_values?: any;
    ip_address?: string;
    user_agent?: string;
    description?: string;
  }) {
    // Silent Bug Fix: Handle BigInt and limit payload size to 50KB to prevent DB bloat
    const stringifyWithLimit = (val: any) => {
      if (!val) return null;
      try {
        // Cycles tracked by ancestor path so an object shared between two
        // branches of the body is kept, not replaced with '[Circular]'.
        // maxNodes = AUDIT_PAYLOAD_MAX_CHARS / 2 bounds a "diamond" graph
        // (this budget is on VALUE COUNT, not char count -- with every
        // value, container or primitive, costing one node -- so it is not
        // a tight char-budget guarantee by itself; the downstream
        // str.length check is what actually enforces the char limit).
        //
        // maxStringLength = AUDIT_PAYLOAD_MAX_CHARS: without this, a single
        // huge string field (a pasted document, a base64 attachment) in
        // old_values/new_values sails through toSafeJson untouched --
        // strings aren't copied, so the node budget above never catches
        // it -- and the full multi-MB value then goes through
        // JSON.stringify() below, an O(string length) synchronous call
        // that blocks the event loop and doubles memory, only for the
        // str.length check to immediately discard it as PAYLOAD_TOO_LARGE
        // anyway. Truncating the field first makes that discard (for this
        // one-huge-field case) cheap instead of O(n).
        //
        // Behavior change this introduces (verified, not assumed): a
        // payload whose oversized-ness comes from ONE huge string field
        // now stores a short stringTruncatedMarker() for that field
        // (preserving the rest of the object and the field's original
        // length) instead of the previous all-or-nothing
        // PAYLOAD_TOO_LARGE for the whole record. A payload that's
        // oversized because of many fields/rows (no single field over the
        // limit) still gets PAYLOAD_TOO_LARGE exactly as before, since
        // nothing here shrinks the total before the str.length check.
        const str = JSON.stringify(
          toSafeJson(val, {
            bigint: 'string',
            maxNodes: AUDIT_PAYLOAD_MAX_CHARS / 2,
            maxStringLength: AUDIT_PAYLOAD_MAX_CHARS,
          }),
        );
        return str.length > AUDIT_PAYLOAD_MAX_CHARS ? PAYLOAD_TOO_LARGE : str;
      } catch (e) {
        if (e instanceof SafeJsonLimitError) return PAYLOAD_TOO_LARGE;
        return '[SERIALIZATION ERROR]';
      }
    };

    const audit = this.auditTrailRepository.create({
      ...data,
      old_values: stringifyWithLimit(data.old_values),
      new_values: stringifyWithLimit(data.new_values),
    });
    const saved = await this.auditTrailRepository.save(audit);

    // Only after the local write succeeds (keeps the central table a
    // strict mirror, never a superset) and only when this service opted
    // in via AuditModule.forRoot('service-name') -- both optional deps are
    // undefined otherwise, matching the sibling Go package's publisher being an
    // opt-in functional option rather than a required parameter.
    if (this.rabbitMQService && this.serviceName) {
      // MUST be fire-and-forget (no `await`) -- the sibling Go package's own
      // equivalent was found live to add up to the full
      // publish timeout (or worse, stacking with a service's own
      // pre-existing synchronous publishes) to a client-facing response
      // when the broker is reachable-but-slow, directly contradicting
      // the pipeline's "fire-and-forget, non-blocking" design for this exact
      // feature. RabbitMQService.publish() already catches and only logs
      // its own failures internally, so this can never become an
      // unhandled rejection either.
      // .catch() is a defensive backstop, not a requirement of the current
      // contract -- RabbitMQService.publish() already never rejects (it
      // catches and only logs its own failures internally) -- but relying
      // on that forever, unenforced by the type system, is exactly the
      // kind of assumption worth not making permanent.
      void this.rabbitMQService
        .publish(AUDIT_EVENTS_QUEUE, { ...saved, service_name: this.serviceName })
        .catch((err) =>
          this.logger.error(`Failed to publish audit event: ${err.message}`),
        );
    }

    return saved;
  }
}
